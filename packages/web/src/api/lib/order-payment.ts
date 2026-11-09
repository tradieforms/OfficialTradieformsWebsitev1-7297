import { ORPCError } from "@orpc/server";
import { and, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { formatAUD } from "../../shared/catalogue";
import {
  type AccessCodeResult,
  EwayError,
  createSharedPage,
  describeDecline,
  ewayConfigured,
  ewayEnvironment,
  ewayMissing,
  queryAccessCode,
} from "./eway";
import { BUSINESS_INBOX, MailerNotConfigured, notificationEmail, sendMail } from "./mailer";
import { clientIp } from "./rate-limit";

/**
 * Order payment through eWAY's Responsive Shared Page. The rules:
 *  - an order is only ever marked paid after the server itself asks eWAY about an AccessCode
 *    it issued for THAT order, and eWAY reports an approved transaction for the order's exact
 *    total and reference;
 *  - the unpaid → paid write is conditional (WHERE payment_status = 'unpaid'), so concurrent
 *    returns / refreshes record the payment once and send one notification;
 *  - before a new payment page is opened, every earlier AccessCode for the order is re-checked,
 *    so a customer who already paid in another tab is never charged twice.
 */

type Order = typeof schema.orders.$inferSelect;

/** Max hosted-page attempts per order (declines + cancels); after that the customer calls us. */
export const MAX_PAYMENT_ATTEMPTS = 8;

const GENERIC_START_ERROR =
  "We couldn't start the card payment. Your order is saved and has not been charged — please try again or contact us.";

export function paymentConfigured() {
  return ewayConfigured();
}

export function paymentStatusInfo() {
  const configured = ewayConfigured();
  return {
    configured,
    provider: configured ? ("eway" as const) : null,
    /** "sandbox" = test gateway, no real money moves. */
    environment: configured ? ewayEnvironment() : null,
    missing: ewayMissing(),
  };
}

function attemptsOf(order: Pick<Order, "paymentAttempts" | "paymentRef">): string[] {
  let list: string[] = [];
  try {
    const parsed = JSON.parse(order.paymentAttempts ?? "[]");
    if (Array.isArray(parsed)) list = parsed.filter((x): x is string => typeof x === "string");
  } catch {
    list = [];
  }
  if (order.paymentRef && !list.includes(order.paymentRef)) list.push(order.paymentRef);
  return list;
}

/** True when eWAY's answer is an approved payment of exactly this order. */
function matchesOrder(order: Order, r: AccessCodeResult) {
  return r.approved && r.amountCents === order.total && r.invoiceNumber === order.reference;
}

const resultWords = (r: AccessCodeResult) =>
  r.approved ? `Approved (${r.messages[0] ?? r.responseCode ?? "00"})` : describeDecline(r);

/** Conditional unpaid → paid. Returns the updated row only for the request that won. */
async function markPaid(order: Order, r: AccessCodeResult): Promise<Order | null> {
  const [updated] = await db
    .update(schema.orders)
    .set({
      paymentStatus: "paid",
      status: "paid",
      paymentProvider: "eway",
      paymentTransactionId: r.transactionId,
      paymentResult: resultWords(r),
    })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.paymentStatus, "unpaid")))
    .returning();
  return updated ?? null;
}

/** One email to the business inbox per verified payment (sandbox ones are labelled). */
async function notifyPaid(order: Order) {
  const sandbox = ewayEnvironment() === "sandbox";
  try {
    const { text, html } = notificationEmail(
      `${sandbox ? "[SANDBOX TEST] " : ""}Order ${order.reference} paid — ${formatAUD(order.total)}`,
      [
        ["Reference", order.reference],
        ["Amount", `${formatAUD(order.total)} AUD${sandbox ? " (eWAY sandbox — no real money moved)" : ""}`],
        ["eWAY transaction", order.paymentTransactionId],
        ["Customer", [order.customerName, order.company].filter(Boolean).join(", ")],
        ["Email", order.email],
        ["Phone", order.phone],
        ["Ship to", [order.shipAddress1, order.shipAddress2, `${order.shipSuburb ?? ""} ${order.shipState ?? ""} ${order.shipPostcode ?? ""}`.trim()].filter(Boolean).join("\n")],
        ["Next step", "Open Admin → Orders to download the supplier production sheet."],
      ],
    );
    await sendMail({
      to: BUSINESS_INBOX,
      subject: `${sandbox ? "[SANDBOX] " : ""}Paid order ${order.reference} (${formatAUD(order.total)})`,
      text,
      html,
      replyTo: order.email,
    });
  } catch (err) {
    // The payment is recorded either way; the order is in Admin → Orders.
    console.error(
      "[payments] paid-order notification not sent",
      order.reference,
      err instanceof MailerNotConfigured ? "mailer not configured" : (err as Error)?.message,
    );
  }
}

/** eWAY AccessCodes are base64-style strings (URL-safe alphabet plus "=" padding, ≤ 512 chars). */
const ACCESS_CODE = /^[A-Za-z0-9_\-+/]{20,510}={0,2}$/;

export type PaymentOutcome = "paid" | "declined" | "pending" | "none";

/**
 * Asks eWAY about this order's AccessCodes (the one in the return URL first, if it is one we
 * issued for this order) and records a verified payment. Never downgrades a paid order.
 */
export async function verifyOrderPayment(
  order: Order,
  returnedAccessCode?: string | null,
  /** True when the customer came back through the hosted page's Cancel link. */
  cancelled = false,
): Promise<{ order: Order; outcome: PaymentOutcome; message: string | null }> {
  if (order.paymentStatus === "paid") return { order, outcome: "paid", message: null };
  const issued = attemptsOf(order);
  if (!ewayConfigured() || (issued.length === 0 && !returnedAccessCode)) return { order, outcome: "none", message: null };

  // The code in the return URL is checked first. It proves nothing by itself: eWAY's answer
  // must name this order's reference and total, so another order's code (or a made-up one)
  // can never mark this order paid. Malformed codes aren't sent to eWAY at all.
  const returned = returnedAccessCode && ACCESS_CODE.test(returnedAccessCode) ? returnedAccessCode : null;
  const ordered = [...(returned ? [returned] : []), ...[...issued].reverse().filter((c) => c !== returned)];

  let latestDecline: AccessCodeResult | null = null;
  for (const code of ordered) {
    let r: AccessCodeResult;
    try {
      r = await queryAccessCode(code);
    } catch (err) {
      const e = err as EwayError;
      console.error("[payments] eWAY query failed", order.reference, e.message, e.codes?.join(",") ?? "");
      continue;
    }
    if (matchesOrder(order, r)) {
      const updated = await markPaid(order, r);
      if (updated) {
        void notifyPaid(updated);
        return { order: updated, outcome: "paid", message: null };
      }
      const [fresh] = await db.select().from(schema.orders).where(eq(schema.orders.id, order.id));
      return { order: fresh ?? order, outcome: "paid", message: null };
    }
    if (r.approved) {
      // Approved but for a different amount / invoice: never accepted. Flag for staff.
      console.error("[payments] approved eWAY transaction did not match order", order.reference, r.transactionId);
      continue;
    }
    // Only a decline on this order's own latest attempt is shown to the customer. eWAY reports
    // some declines (e.g. D4406) exactly like an unused code — no TransactionID — so a code we
    // issued that came back through the hosted page's result redirect (not Cancel) also counts.
    const submitted = r.attempted || (code === returned && issued.includes(code) && !cancelled);
    if (submitted && !latestDecline && code === ordered[0] && r.invoiceNumber === order.reference) latestDecline = r;
  }

  if (latestDecline) {
    const words = describeDecline(latestDecline);
    const [updated] = await db
      .update(schema.orders)
      .set({ paymentResult: words })
      .where(and(eq(schema.orders.id, order.id), eq(schema.orders.paymentStatus, "unpaid")))
      .returning();
    return { order: updated ?? order, outcome: "declined", message: words };
  }
  return { order, outcome: "pending", message: null };
}

/** Opens a fresh eWAY Shared Page for an unpaid order (after re-checking earlier attempts). */
export async function startOrderPayment(order: Order, headers: Headers) {
  if (order.paymentStatus === "paid") return { configured: true as const, provider: "eway" as const, paid: true as const };

  if (!ewayConfigured()) {
    return {
      configured: false as const,
      provider: null,
      missing: ewayMissing(),
      message:
        "Card payments are not connected yet. This order is saved and will not be marked paid until payment is taken.",
    };
  }

  // Paid in another tab / an earlier attempt already went through → never open a second page.
  const check = await verifyOrderPayment(order);
  if (check.outcome === "paid") return { configured: true as const, provider: "eway" as const, paid: true as const };

  const attempts = attemptsOf(check.order);
  if (attempts.length >= MAX_PAYMENT_ATTEMPTS)
    throw new ORPCError("BAD_REQUEST", {
      message:
        "This order has had too many payment attempts. It's saved and unpaid — please call or email us and we'll sort payment with you.",
    });

  const origin = (process.env.WEBSITE_URL ?? "").replace(/\/+$/, "");
  const ref = encodeURIComponent(order.reference);
  const token = encodeURIComponent(order.accessToken ?? "");
  let page;
  try {
    page = await createSharedPage({
      amountCents: order.total,
      invoiceNumber: order.reference,
      invoiceReference: `${order.reference}-${attempts.length + 1}`,
      description: `TradieForms order ${order.reference}`,
      customer: {
        name: order.customerName,
        company: order.company,
        email: order.email,
        phone: order.phone,
        street1: order.shipAddress1,
        city: order.shipSuburb,
        state: order.shipState,
        postcode: order.shipPostcode,
      },
      // eWAY appends &AccessCode=… to the redirect; the success page verifies it server side.
      redirectUrl: `${origin}/checkout/success?ref=${ref}&t=${token}`,
      cancelUrl: `${origin}/checkout/success?ref=${ref}&t=${token}&cancelled=1`,
      customerIp: clientIp(headers),
    });
  } catch (err) {
    // Status + eWAY error codes only — never the request, response body or credentials.
    const e = err as EwayError;
    console.error("[payments] eWAY rejected shared page", order.reference, e.status ?? "-", e.codes?.join(",") || e.message);
    throw new ORPCError("INTERNAL_SERVER_ERROR", { message: GENERIC_START_ERROR });
  }

  await db
    .update(schema.orders)
    .set({
      paymentProvider: "eway",
      paymentRef: page.accessCode,
      paymentAttempts: JSON.stringify([...attempts, page.accessCode]),
    })
    .where(and(eq(schema.orders.id, order.id), eq(schema.orders.paymentStatus, "unpaid")));

  return { configured: true as const, provider: "eway" as const, paid: false as const, url: page.url };
}
