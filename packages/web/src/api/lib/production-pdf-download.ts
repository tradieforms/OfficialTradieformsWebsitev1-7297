import type { Context } from "hono";
import { eq } from "drizzle-orm";
import { auth } from "../auth";
import { db } from "../database";
import * as schema from "../database/schema";
import { isAdmin } from "./admin";
import { clientIp, hit } from "./rate-limit";
import { buildProductionPdf } from "./production-pdf";

/**
 * GET /api/admin/orders/:reference/production.pdf — the internal supplier production
 * sheet for one order. Signed-in, email-verified admins only (ADMIN_EMAILS). The sheet is generated on
 * demand from the stored order, so it always reflects the current payment status.
 */
export async function productionPdfRoute(c: Context) {
  const session = await auth.api.getSession({ headers: c.req.raw.headers });
  if (!session) return c.json({ error: "Sign in as an admin to download production sheets." }, 401);
  if (!isAdmin(session.user)) return c.json({ error: "Admins only." }, 403);
  const retry = hit("production-pdf", clientIp(c.req.raw.headers));
  if (retry != null) return c.json({ error: "Too many downloads. Wait a minute and try again." }, 429);

  const reference = c.req.param("reference") ?? "";
  const [order] = await db.select().from(schema.orders).where(eq(schema.orders.reference, reference));
  if (!order) return c.json({ error: "Order not found." }, 404);
  const items = await db.select().from(schema.orderItems).where(eq(schema.orderItems.orderId, order.id));

  // Garment photos and the brand mark are fetched from this same server.
  const origin = new URL(c.req.url).origin;
  const bytes = await buildProductionPdf(order, items, origin);
  const paid = order.paymentStatus === "paid";
  return new Response(new Blob([bytes as BlobPart], { type: "application/pdf" }), {
    status: 200,
    headers: {
      "Content-Type": "application/pdf",
      "Content-Disposition": `attachment; filename="TradieForms-${order.reference}-production${paid ? "" : "-NOT-APPROVED"}.pdf"`,
      "Cache-Control": "no-store",
    },
  });
}
