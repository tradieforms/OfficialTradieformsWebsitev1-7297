import { useEffect, useMemo, useState } from "react";
import { Link } from "wouter";
import {
  AlertCircle,
  ArrowDown,
  ArrowUp,
  ExternalLink,
  Loader2,
  LogOut,
  Package,
  Palette,
  Trash2,
} from "lucide-react";
import { formatAUD, garmentName, getProduct } from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { GarmentStage } from "../components/garment-stage";
import { Reveal } from "../components/reveal";
import { authClient } from "../lib/auth";
import { client } from "../lib/api";
import { parseTransform } from "../lib/design";
import { backSupported, fitLogo, spotLabel } from "../lib/garment";
import { GuestDrafts } from "../components/studio/guest-drafts";
import { useDeleteDesign, useDesigns, useReorderDesigns } from "../queries/designs";
import { useMyOrders } from "../queries/orders";
import { useAdminStatus } from "../queries/admin";
import { cn } from "../lib/utils";

interface DesignRow {
  id: number;
  name: string;
  productSlug: string;
  variantId?: string | null;
  colourId: string;
  size: string;
  logoKey: string | null;
  frontLogo: string | null;
  backLogo: string | null;
  activeView?: string | null;
  sortOrder: number;
  updatedAt: string | Date;
}

function formatDate(value: string | Date | undefined) {
  if (!value) return "";
  const date = typeof value === "string" ? new Date(value) : value;
  if (Number.isNaN(date.getTime())) return "";
  return date.toLocaleDateString("en-AU", { day: "numeric", month: "short", year: "numeric" });
}

export default function AccountPage() {
  const { data: session, isPending } = authClient.useSession();
  const designs = useDesigns();
  const orders = useMyOrders();
  const adminStatus = useAdminStatus();
  const removeDesign = useDeleteDesign();
  const reorder = useReorderDesigns();

  const [logoUrls, setLogoUrls] = useState<Record<string, string>>({});
  const [confirmId, setConfirmId] = useState<number | null>(null);

  const rows = useMemo(() => (designs.data ?? []) as DesignRow[], [designs.data]);

  // Sign every stored logo so the saved-design cards can show the real mark.
  useEffect(() => {
    const keys = Array.from(
      new Set(rows.map((r) => r.logoKey).filter((k): k is string => Boolean(k))),
    ).filter((k) => !logoUrls[k]);
    if (keys.length === 0) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string> = {};
      for (const key of keys) {
        try {
          const signed = await client.upload.signGet({ key });
          next[key] = signed.url;
        } catch {
          /* leave unsigned — the card falls back to the placeholder mark */
        }
      }
      if (!cancelled && Object.keys(next).length) {
        setLogoUrls((prev) => ({ ...prev, ...next }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [rows, logoUrls]);

  const move = (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= rows.length) return;
    const ids = rows.map((r) => r.id);
    [ids[index], ids[target]] = [ids[target], ids[index]];
    reorder.mutate({ ids });
  };

  if (isPending) {
    return (
      <div className="tf-shell flex min-h-[60vh] items-center gap-3 py-24 text-sm text-tf-steel">
        <Loader2 className="size-4 animate-spin" aria-hidden /> Checking your session…
      </div>
    );
  }

  if (!session?.user) {
    return (
      <>
        <PageIntro
          title="Sign in to see your kit."
          intro="Saved designs and order history live against your account."
        />
        <div className="tf-shell py-14">
          <Link to="/login?next=/account" className="btn-base btn-primary">
            Sign in or create an account
          </Link>
        </div>
        <GuestDrafts />
      </>
    );
  }

  return (
    <>
      <PageIntro
        title={session.user.name ? `G'day, ${session.user.name.split(" ")[0]}.` : "Your account"}
        intro={session.user.email}
      >
        <div className="mt-8 flex flex-wrap gap-3">
          <Link to="/shop" className="btn-base btn-primary">
            Shop the range
          </Link>
          <button
            type="button"
            className="btn-base btn-secondary text-white hover:text-white"
            onClick={async () => {
              await authClient.signOut();
            }}
          >
            <LogOut className="size-4" aria-hidden />
            <span>Sign out</span>
          </button>
          {adminStatus.data?.admin ? (
            <Link to="/admin/orders" className="btn-base btn-secondary text-white hover:text-white" data-admin-link>
              Production orders
            </Link>
          ) : null}
        </div>
      </PageIntro>

      {/* ---------- Saved designs ---------- */}
      <section className="bg-white py-[clamp(3rem,6vw,5rem)]">
        <div className="tf-shell">
          <div className="flex flex-wrap items-end justify-between gap-5">
            <div>
              <h2 className="tf-display text-[clamp(1.5rem,3.4vw,2.3rem)] text-tf-ink">
                Your saved kit
              </h2>
            </div>
            <p className="max-w-md text-[0.85rem] leading-relaxed text-tf-steel">
              Each design stores the product, colour, size, logo and placement as editable settings —
              not a screenshot.
            </p>
          </div>

          {designs.isLoading ? (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {Array.from({ length: 3 }).map((_, i) => (
                <div key={i} className="animate-pulse border border-tf-line">
                  <div className="aspect-square bg-tf-paper-dim" />
                  <div className="h-32 bg-white" />
                </div>
              ))}
            </div>
          ) : rows.length === 0 ? (
            <div className="mt-8 border border-tf-line bg-tf-paper p-8">
              <Palette className="size-7 text-tf-rust" aria-hidden />
              <h3 className="tf-display mt-4 text-[1.3rem] text-tf-ink">No saved designs yet.</h3>
              <p className="mt-2 max-w-lg text-[0.92rem] leading-relaxed text-tf-steel">
                Open the Design Studio, place your logo, and hit “Save to my account”. It&apos;ll appear
                here ready to reopen and edit.
              </p>
              <Link to="/design-studio" className="btn-base btn-primary mt-6">
                Start a design
              </Link>
            </div>
          ) : (
            <div className="mt-8 grid gap-5 md:grid-cols-2 xl:grid-cols-3">
              {rows.map((row, index) => {
                const product = getProduct(row.productSlug);
                const colour = product?.colours.find((c) => c.id === row.colourId) ?? product?.colours[0];
                const rawFront = parseTransform(row.frontLogo);
                const rawBack = parseTransform(row.backLogo);
                const front = product && colour && rawFront ? fitLogo(product, colour, "front", rawFront) : null;
                const back = product && colour && rawBack ? fitLogo(product, colour, "back", rawBack) : null;
                const showBack = Boolean(row.activeView === "back" && back?.enabled && product && backSupported(product));
                const spots = [spotLabel(front), spotLabel(back)].filter(Boolean).join(" + ");
                const busy = reorder.isPending || removeDesign.isPending;
                return (
                  <Reveal key={row.id} delay={index * 50} as="div">
                    <article className="flex h-full flex-col border border-tf-line bg-white">
                      <div className="tf-stage relative aspect-square">
                        {product && colour ? (
                          <GarmentStage
                            colour={colour}
                            view={showBack ? "back" : "front"}
                            silhouette={product.silhouette}
                            logoUrl={
                              row.logoKey ? logoUrls[row.logoKey] ?? "/images/brand/logo-placeholder.svg" : null
                            }
                            transform={showBack ? back : front}
                            alt={`${row.name} — ${product.name} in ${colour.name}`}
                          />
                        ) : (
                          <p className="grid h-full place-items-center px-6 text-center text-sm text-tf-steel">
                            This garment is no longer in the range.
                          </p>
                        )}
                        <span className="absolute top-0 left-0 bg-tf-navy px-2.5 py-1 font-display text-[0.62rem] font-bold tracking-[0.12em] text-tf-yellow uppercase">
                          {colour?.source === "tint" ? "Rendered preview" : "Supplier photo"}
                        </span>
                      </div>

                      <div className="flex flex-1 flex-col border-t border-tf-line p-5">
                        <h3 className="tf-display text-[1.1rem] text-tf-ink">{row.name}</h3>
                        <p className="mt-1.5 text-[0.82rem] text-tf-steel">
                          {product ? garmentName(product, row.variantId) : row.productSlug} ·{" "}
                          {colour?.name ?? row.colourId} · Size{" "}
                          {row.size}
                        </p>
                        <p className="mt-1 text-[0.75rem] text-tf-steel">
                          {row.logoKey ? spots || "Logo uploaded, no spot" : "No logo placed"} · updated{" "}
                          {formatDate(row.updatedAt)}
                        </p>

                        <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-tf-line pt-4">
                          <Link
                            to={`/design-studio?design=${row.id}`}
                            className="btn-base btn-primary !px-4 !py-2.5 !text-[0.78rem]"
                          >
                            Use this design <ExternalLink className="size-3.5" aria-hidden />
                          </Link>
                          <button
                            type="button"
                            className="grid size-9 place-items-center border border-tf-line text-tf-navy hover:border-tf-navy disabled:opacity-40"
                            aria-label={`Move ${row.name} up`}
                            disabled={index === 0 || busy}
                            onClick={() => move(index, -1)}
                          >
                            <ArrowUp className="size-4" aria-hidden />
                          </button>
                          <button
                            type="button"
                            className="grid size-9 place-items-center border border-tf-line text-tf-navy hover:border-tf-navy disabled:opacity-40"
                            aria-label={`Move ${row.name} down`}
                            disabled={index === rows.length - 1 || busy}
                            onClick={() => move(index, 1)}
                          >
                            <ArrowDown className="size-4" aria-hidden />
                          </button>
                          {confirmId === row.id ? (
                            <span className="flex items-center gap-2">
                              <button
                                type="button"
                                className="btn-base !bg-tf-cta !px-3 !py-2 !text-[0.76rem] text-white"
                                disabled={busy}
                                onClick={() =>
                                  removeDesign.mutate(
                                    { id: row.id },
                                    { onSuccess: () => setConfirmId(null) },
                                  )
                                }
                              >
                                Delete
                              </button>
                              <button
                                type="button"
                                className="text-[0.76rem] font-semibold text-tf-steel underline"
                                onClick={() => setConfirmId(null)}
                              >
                                Cancel
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              className="grid size-9 place-items-center border border-tf-line text-tf-steel hover:border-tf-orange hover:text-tf-rust"
                              aria-label={`Delete ${row.name}`}
                              disabled={busy}
                              onClick={() => setConfirmId(row.id)}
                            >
                              <Trash2 className="size-4" aria-hidden />
                            </button>
                          )}
                        </div>
                      </div>
                    </article>
                  </Reveal>
                );
              })}
            </div>
          )}

          {designs.isError ? (
            <p className="mt-6 flex items-center gap-2 text-[0.88rem] text-tf-rust">
              <AlertCircle className="size-4" aria-hidden /> We couldn&apos;t load your saved designs.
              Refresh to try again.
            </p>
          ) : null}
        </div>
      </section>

      <GuestDrafts signedIn />

      {/* ---------- Orders ---------- */}
      <section className="border-t border-tf-line bg-tf-paper py-[clamp(3rem,6vw,5rem)]">
        <div className="tf-shell">
          <h2 className="tf-display text-[clamp(1.5rem,3.4vw,2.3rem)] text-tf-ink">
            Orders on this account
          </h2>

          {orders.isLoading ? (
            <p className="mt-8 flex items-center gap-3 text-sm text-tf-steel">
              <Loader2 className="size-4 animate-spin" aria-hidden /> Loading your orders…
            </p>
          ) : (orders.data ?? []).length === 0 ? (
            <div className="mt-8 border border-tf-line bg-white p-8">
              <Package className="size-7 text-tf-rust" aria-hidden />
              <h3 className="tf-display mt-4 text-[1.3rem] text-tf-ink">No orders yet.</h3>
              <p className="mt-2 max-w-lg text-[0.92rem] leading-relaxed text-tf-steel">
                Orders placed while signed in show up here with their reference number.
              </p>
              <Link to="/bundle-deals" className="btn-base btn-primary mt-6">
                Build a bundle
              </Link>
            </div>
          ) : (
            <div className="mt-8 overflow-x-auto border border-tf-line bg-white">
              <table className="w-full min-w-[42rem] border-collapse text-left">
                <caption className="sr-only">Your orders</caption>
                <thead>
                  <tr className="border-b border-tf-line">
                    {["Reference", "Placed", "Total", "Payment", "Status"].map((h) => (
                      <th
                        key={h}
                        scope="col"
                        className="px-5 py-3.5 font-display text-[0.72rem] font-bold tracking-[0.12em] text-tf-steel uppercase"
                      >
                        {h}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {(orders.data ?? []).map((order) => (
                    <tr key={order.id} className="border-b border-tf-line last:border-0">
                      <td className="px-5 py-4 font-display text-[0.9rem] font-bold text-tf-navy">
                        {order.reference}
                      </td>
                      <td className="px-5 py-4 text-[0.88rem] text-tf-steel">
                        {formatDate(order.createdAt as unknown as string)}
                      </td>
                      <td className="px-5 py-4 font-display text-[0.9rem] font-bold text-tf-ink">
                        {formatAUD(order.total)}
                        <span className="block font-sans text-[0.74rem] font-normal text-tf-steel">
                          {[
                            order.embroideryFee ? `incl. ${formatAUD(order.embroideryFee)} embroidery` : null,
                            order.shippingCharge != null
                              ? `${formatAUD(order.shippingCharge)} shipping (${order.shippingZone ?? "—"})`
                              : null,
                          ]
                            .filter(Boolean)
                            .join(" · ")}
                        </span>
                      </td>
                      <td className="px-5 py-4">
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
                      <td className="px-5 py-4 text-[0.88rem] text-tf-steel">
                        {order.status.replace(/_/g, " ")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </section>
    </>
  );
}
