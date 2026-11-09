import { Link } from "wouter";
import { AlertTriangle, FileDown, Loader2, Lock } from "lucide-react";
import { formatAUD } from "../../shared/catalogue";
import { formatKg } from "../../shared/shipping";
import { storedFlags } from "../components/order/order-record";
import { PageIntro } from "../components/layout";
import { ShippingQuoteList } from "../components/admin/shipping-quote-list";
import { authClient } from "../lib/auth";
import { cn } from "../lib/utils";
import { productionPdfUrl, useAdminOrders, useAdminStatus } from "../queries/admin";

function formatDate(value: string | Date | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

/** Internal: order list with supplier production sheet downloads. Gated by ADMIN_EMAILS. */
export default function AdminOrdersPage() {
  const { data: session, isPending } = authClient.useSession();
  const status = useAdminStatus();
  const isAdmin = Boolean(status.data?.admin);
  const orders = useAdminOrders(isAdmin);

  if (isPending || (session?.user && status.isLoading)) {
    return (
      <div className="tf-shell flex min-h-[60vh] items-center gap-3 py-24 text-sm text-tf-steel">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking access…
      </div>
    );
  }

  if (!session?.user || !isAdmin) {
    return (
      <>
        <PageIntro title="Staff only." intro="Production sheets are restricted to TradieForms staff accounts." />
        <div className="tf-shell py-14" data-admin-denied>
          <div className="flex max-w-xl items-start gap-3 border border-tf-line bg-tf-paper p-6">
            <Lock className="mt-0.5 size-5 shrink-0 text-tf-rust" aria-hidden />
            <p className="text-[0.92rem] leading-relaxed text-tf-steel">
              {!session?.user
                ? "Sign in with a staff account to continue."
                : status.data?.needsVerification
                  ? "This address is on the staff list, but its ownership hasn't been verified yet. Sign out, then sign in once with Google using the same address to unlock staff tools."
                  : "This account isn't on the staff list."}
            </p>
          </div>
          {!session?.user ? (
            <Link to="/login?next=/admin/orders" className="btn-base btn-primary mt-6">
              Sign in
            </Link>
          ) : null}
        </div>
      </>
    );
  }

  const rows = orders.data ?? [];

  return (
    <>
      <PageIntro
        title="Production orders."
        intro="Download the supplier production sheet for any order. Sheets for unpaid orders are stamped NOT APPROVED."
      />
      <section className="bg-white py-[clamp(3rem,6vw,5rem)]">
        <div className="tf-shell">
          {orders.isLoading ? (
            <div className="flex items-center gap-3 text-sm text-tf-steel">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading orders…
            </div>
          ) : orders.isError ? (
            <p className="text-sm text-tf-rust">Couldn&apos;t load orders. Refresh to try again.</p>
          ) : rows.length === 0 ? (
            <div className="border border-tf-line bg-tf-paper p-8 text-[0.92rem] text-tf-steel">No orders yet.</div>
          ) : (
            <div className="overflow-x-auto border border-tf-line bg-white">
              <table className="w-full min-w-[56rem] border-collapse text-left" data-admin-orders>
                <caption className="sr-only">Orders</caption>
                <thead>
                  <tr className="border-b border-tf-line">
                    {["Reference", "Placed", "Customer", "Garments", "Ship to", "Total", "Payment", "Sheet"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-4 py-3.5 font-display text-[0.72rem] font-bold tracking-[0.12em] text-tf-steel uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map((order) => {
                    const skus = [...new Set(order.lines.map((l) => l.sku).filter(Boolean))];
                    return (
                      <tr key={order.reference} className="border-b border-tf-line align-top last:border-0">
                        <td className="px-4 py-4 font-display text-[0.9rem] font-bold text-tf-navy">
                          {order.reference}
                        </td>
                        <td className="px-4 py-4 text-[0.85rem] text-tf-steel">
                          {formatDate(order.createdAt as unknown as string)}
                        </td>
                        <td className="px-4 py-4 text-[0.85rem] text-tf-ink">
                          <div className="font-semibold">{order.customerName}</div>
                          {order.company ? <div className="text-tf-steel">{order.company}</div> : null}
                          <div className="text-tf-steel">{order.email}</div>
                        </td>
                        <td className="px-4 py-4 text-[0.82rem] text-tf-steel">
                          {order.lines.length} line{order.lines.length === 1 ? "" : "s"}
                          {skus.length ? <div className="mt-1 font-mono text-[0.75rem] text-tf-ink">{skus.join(", ")}</div> : null}
                          {order.unmappedSkus > 0 ? (
                            <div className="mt-1 flex items-center gap-1 text-tf-rust">
                              <AlertTriangle className="size-3.5" aria-hidden /> SKU mapping required
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 text-[0.82rem] text-tf-steel" data-admin-ship>
                          {order.shipPostcode ? (
                            <>
                              <div className="text-tf-ink">
                                {[order.shipSuburb, order.shipState, order.shipPostcode].filter(Boolean).join(" ")}
                              </div>
                              <div>
                                {order.shippingZone ?? "—"}
                                {order.shippingWeightGrams != null ? ` · ${formatKg(order.shippingWeightGrams)}` : ""}
                              </div>
                            </>
                          ) : (
                            "—"
                          )}
                          {order.shippingZoneOverride || storedFlags(order.shippingFlags).length ? (
                            <div className="mt-1 flex items-center gap-1 text-tf-rust">
                              <AlertTriangle className="size-3.5" aria-hidden />
                              {order.shippingZoneOverride ? "Zone set by customer" : "Shipping review"}
                            </div>
                          ) : null}
                        </td>
                        <td className="px-4 py-4 font-display text-[0.9rem] font-bold text-tf-ink">
                          {formatAUD(order.total)}
                          <div className="font-sans text-[0.74rem] font-normal text-tf-steel">
                            Garments {formatAUD(order.subtotal)}
                            {order.embroideryFee ? ` · Embroidery ${formatAUD(order.embroideryFee)}` : ""}
                            {order.shippingCharge != null ? ` · Shipping ${formatAUD(order.shippingCharge)}` : ""}
                          </div>
                        </td>
                        <td className="px-4 py-4">
                          <span
                            className={cn(
                              "px-2.5 py-1 font-display text-[0.68rem] font-bold tracking-[0.1em] uppercase",
                              order.paymentStatus === "paid"
                                ? "bg-tf-navy text-tf-yellow"
                                : "bg-tf-paper-dim text-tf-steel",
                            )}
                          >
                            {order.paymentStatus}
                          </span>
                        </td>
                        <td className="px-4 py-4">
                          <a
                            href={productionPdfUrl(order.reference)}
                            className="inline-flex items-center gap-1.5 font-display text-[0.8rem] font-bold text-tf-navy underline-offset-4 hover:underline"
                            data-production-pdf
                          >
                            <FileDown className="size-4" aria-hidden /> PDF
                          </a>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
      <ShippingQuoteList />
    </>
  );
}
