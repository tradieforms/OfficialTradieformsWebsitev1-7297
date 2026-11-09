/**
 * eWAY Rapid API — Responsive Shared Page (hosted payment page). Server side only.
 *
 * Flow:
 *   1. createSharedPage()  POST /AccessCodesShared → AccessCode + SharedPaymentUrl. The
 *      customer is redirected to eWAY's hosted page; card details never touch this server.
 *   2. eWAY redirects back to RedirectUrl with ?AccessCode=… appended.
 *   3. queryAccessCode()   GET /AccessCode/{AccessCode} → TransactionStatus, amount,
 *      invoice number. The order is only marked paid after this server-side check.
 *
 * Environment (root .env — never shipped to the browser):
 *   EWAY_API_KEY       Rapid API key (MYeWAY → Settings → API Key)
 *   EWAY_PASSWORD      Rapid API password
 *   EWAY_ENVIRONMENT   "sandbox" (default) or "production" / "live"
 *
 * The client-side encryption key is NOT used — the Shared Page collects the card on eWAY's
 * own domain, so nothing here encrypts or sees card data.
 */

const ENDPOINTS = {
  sandbox: "https://api.sandbox.ewaypayments.com",
  production: "https://api.ewaypayments.com",
} as const;

export type EwayEnvironment = keyof typeof ENDPOINTS;

/** Request timeout for every eWAY call; a hung gateway must not hang checkout. */
const TIMEOUT_MS = 20_000;

/**
 * EWAY_ENVIRONMENT values: "production" or "live" → live gateway; "sandbox" or unset → sandbox.
 * Any other value is a misconfiguration: it is reported as missing (payments stay off) rather
 * than silently falling back to the sandbox with what may be live credentials.
 */
function parseEnvironment(): EwayEnvironment | null {
  const raw = (process.env.EWAY_ENVIRONMENT ?? "").trim().toLowerCase();
  if (raw === "production" || raw === "live") return "production";
  if (raw === "sandbox" || raw === "") return "sandbox";
  return null;
}

export function ewayEnvironment(): EwayEnvironment {
  const env = parseEnvironment();
  if (!env) throw new EwayError("EWAY_ENVIRONMENT is not a recognised value", null);
  return env;
}

/** Names of the eWAY variables that are missing or invalid (empty list = configured). */
export function ewayMissing(): string[] {
  const missing = ["EWAY_API_KEY", "EWAY_PASSWORD"].filter((k) => !process.env[k]?.trim());
  if (!parseEnvironment()) missing.push("EWAY_ENVIRONMENT");
  return missing;
}

export function ewayConfigured(): boolean {
  return ewayMissing().length === 0;
}

/** Raised for any gateway failure. `codes` are eWAY's own error codes (safe to log). */
export class EwayError extends Error {
  constructor(
    message: string,
    readonly status: number | null,
    readonly codes: string[] = [],
  ) {
    super(message);
    this.name = "EwayError";
  }
}

function authHeader() {
  const key = process.env.EWAY_API_KEY?.trim() ?? "";
  const pass = process.env.EWAY_PASSWORD?.trim() ?? "";
  return `Basic ${Buffer.from(`${key}:${pass}`).toString("base64")}`;
}

async function call<T>(method: "GET" | "POST", path: string, body?: unknown): Promise<T> {
  if (!ewayConfigured()) throw new EwayError("eWAY is not configured", null);
  let res: Response;
  try {
    const init: RequestInit = {
      method,
      headers: {
        Authorization: authHeader(),
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    };
    if (method === "POST" && body !== undefined) init.body = JSON.stringify(body);
    res = await fetch(`${ENDPOINTS[ewayEnvironment()]}${path}`, init);
  } catch (err) {
    throw new EwayError(`eWAY unreachable (${(err as Error)?.name ?? "error"})`, null);
  }
  // 401/403 = wrong key/password or wrong environment. The body is never logged or returned:
  // it can echo request fields.
  if (!res.ok) throw new EwayError(`eWAY HTTP ${res.status}`, res.status);
  const json = (await res.json().catch(() => null)) as (T & { Errors?: string | null }) | null;
  if (!json) throw new EwayError("eWAY returned an unreadable response", res.status);
  return json;
}

/** eWAY returns errors as one comma-separated string ("V6011,V6047"). */
function errorCodes(errors: string | null | undefined): string[] {
  return (errors ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean)
    .slice(0, 10);
}

const clip = (s: string | null | undefined, n: number) => (s ?? "").replace(/\s+/g, " ").trim().slice(0, n);

export interface SharedPageInput {
  /** Amount in cents (AUD). */
  amountCents: number;
  /** Order reference — sent as InvoiceNumber, so every attempt for one order shares it. */
  invoiceNumber: string;
  /** Unique per attempt (eWAY's InvoiceRef lookups need uniqueness). */
  invoiceReference: string;
  description: string;
  customer: {
    name: string;
    company?: string | null;
    email: string;
    phone?: string | null;
    street1?: string | null;
    city?: string | null;
    state?: string | null;
    postcode?: string | null;
  };
  redirectUrl: string;
  cancelUrl: string;
  customerIp?: string | null;
}

export interface SharedPage {
  accessCode: string;
  url: string;
}

export async function createSharedPage(input: SharedPageInput): Promise<SharedPage> {
  const [first, ...rest] = clip(input.customer.name, 100).split(" ");
  const ip = input.customerIp && input.customerIp !== "unknown" ? clip(input.customerIp, 50) : undefined;
  const res = await call<{ AccessCode?: string; SharedPaymentUrl?: string; Errors?: string | null }>(
    "POST",
    "/AccessCodesShared",
    {
      Payment: {
        TotalAmount: input.amountCents,
        InvoiceNumber: clip(input.invoiceNumber, 64),
        InvoiceReference: clip(input.invoiceReference, 50),
        InvoiceDescription: clip(input.description, 64),
        CurrencyCode: "AUD",
      },
      Customer: {
        Reference: clip(input.invoiceNumber, 50),
        FirstName: clip(first, 50),
        LastName: clip(rest.join(" "), 50),
        CompanyName: clip(input.customer.company, 50),
        Email: clip(input.customer.email, 50),
        Phone: clip(input.customer.phone, 32),
        Street1: clip(input.customer.street1, 50),
        City: clip(input.customer.city, 50),
        State: clip(input.customer.state, 50),
        PostalCode: clip(input.customer.postcode, 30),
        Country: "au",
      },
      RedirectUrl: input.redirectUrl,
      CancelUrl: input.cancelUrl,
      Method: "ProcessPayment",
      TransactionType: "Purchase",
      ...(ip ? { CustomerIP: ip } : {}),
      HeaderText: "TradieForms",
      CustomerReadOnly: false,
    },
  );
  const codes = errorCodes(res.Errors);
  if (codes.length || !res.AccessCode || !res.SharedPaymentUrl)
    throw new EwayError("eWAY rejected the payment request", 200, codes);
  return { accessCode: res.AccessCode, url: res.SharedPaymentUrl };
}

export interface AccessCodeResult {
  /** True only for an approved, completed purchase. */
  approved: boolean;
  /** True once the customer submitted a card (approved or declined); false = never attempted. */
  attempted: boolean;
  amountCents: number | null;
  invoiceNumber: string | null;
  invoiceReference: string | null;
  transactionId: string | null;
  responseCode: string | null;
  /** eWAY response message codes, e.g. ["A2000"] or ["D4405"]. */
  messages: string[];
}

/** Server-side verification of one AccessCode. */
export async function queryAccessCode(accessCode: string): Promise<AccessCodeResult> {
  const res = await call<{
    TransactionStatus?: boolean | null;
    TotalAmount?: number | null;
    InvoiceNumber?: string | null;
    InvoiceReference?: string | null;
    TransactionID?: number | string | null;
    ResponseCode?: string | null;
    ResponseMessage?: string | null;
    Errors?: string | null;
  }>("GET", `/AccessCode/${encodeURIComponent(accessCode)}`);
  const messages = errorCodes(res.ResponseMessage);
  const transactionId = res.TransactionID != null && res.TransactionID !== 0 ? String(res.TransactionID) : null;
  return {
    approved: res.TransactionStatus === true,
    // An unused AccessCode reports ResponseCode "06" / D4406 with no TransactionID, so only a
    // TransactionID means a card was actually submitted.
    attempted: transactionId !== null,
    amountCents: typeof res.TotalAmount === "number" ? res.TotalAmount : null,
    invoiceNumber: res.InvoiceNumber ?? null,
    invoiceReference: res.InvoiceReference ?? null,
    transactionId,
    responseCode: res.ResponseCode?.trim() || null,
    messages,
  };
}

/**
 * Friendly text for a declined / failed attempt. Codes come from eWAY's response-message
 * list (D = declined by the bank, F = blocked by fraud rules, V/S = request or system).
 */
export function describeDecline(result: Pick<AccessCodeResult, "messages" | "responseCode">): string {
  const code = result.messages[0] ?? result.responseCode ?? "";
  const known: Record<string, string> = {
    D4405: "The bank declined the card (do not honour).",
    D4406: "The card was declined — check the card number, expiry and CVN, or try another card.",
    D4451: "The card was declined — insufficient funds.",
    D4454: "The card was declined — it has expired.",
    D4482: "The card was declined — the CVN was wrong.",
    D4457: "The card was declined for this kind of purchase.",
  };
  if (known[code]) return `${known[code]} (${code})`;
  if (code.startsWith("D")) return `The bank declined the card (${code}).`;
  if (code.startsWith("F")) return `The payment was blocked by the gateway's fraud checks (${code}).`;
  return code ? `The payment didn't go through (${code}).` : "The payment didn't go through.";
}
