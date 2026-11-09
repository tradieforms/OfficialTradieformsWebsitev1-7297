import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { authClient } from "../lib/auth";
import type { CartLine } from "../lib/cart";

export type OrderLineInput = {
  kind: "product" | "bundle";
  slug: string;
  variantId?: string;
  colourId?: string;
  size?: string;
  quantity: number;
  logoKey?: string | null;
  frontLogo?: CartLine["frontLogo"];
  backLogo?: CartLine["backLogo"];
  sizes?: { slug: string; size: string; quantity: number; colourId?: string; variantId?: string }[];
  colourIds?: Record<string, string>;
  placements?: CartLine["placements"];
};

export function toOrderLines(lines: CartLine[]): OrderLineInput[] {
  return lines.map((l) => ({
    kind: l.kind,
    slug: l.slug,
    variantId: l.variantId,
    colourId: l.colourId,
    size: l.size,
    quantity: l.quantity,
    logoKey: l.logoKey ?? null,
    frontLogo: l.frontLogo ?? null,
    backLogo: l.backLogo ?? null,
    sizes: l.sizes,
    colourIds: l.colourIds,
    placements: l.kind === "bundle" ? l.placements : undefined,
  }));
}

/**
 * Server-priced cart: garments, embroidery and shipping. Re-runs whenever the lines,
 * the postcode or the zone correction change. The postcode is only sent once it's a
 * full 4 digits (partial input = "enter your postcode").
 */
export function useQuote(
  lines: OrderLineInput[],
  delivery?: { postcode?: string | null; zone?: "metro" | "regional" | null },
) {
  const postcode = /^\d{4}$/.test(delivery?.postcode ?? "") ? delivery!.postcode! : null;
  return useQuery(
    orpc.orders.quote.queryOptions({
      input: { lines, postcode, zone: postcode ? (delivery?.zone ?? null) : null },
      enabled: lines.length > 0,
      staleTime: 0,
      placeholderData: keepPreviousData,
      // A 4xx (e.g. a colour that isn't made in the chosen fabric) won't fix itself — show it
      // straight away instead of retrying; network / 5xx errors still retry twice.
      retry: (count, err) => {
        const status = (err as { status?: number })?.status ?? 0;
        return !(status >= 400 && status < 500) && count < 2;
      },
    }),
  );
}

export type CartQuote = NonNullable<ReturnType<typeof useQuote>["data"]>;
export type PricedCartLine = CartQuote["lines"][number];

export function usePaymentStatus() {
  return useQuery(orpc.orders.paymentStatus.queryOptions({ staleTime: 60_000 }));
}

export function useCreateOrder() {
  return useMutation(orpc.orders.create.mutationOptions());
}

export function useStartPayment() {
  return useMutation(orpc.orders.startPayment.mutationOptions());
}

export function useRefreshPayment() {
  return useMutation(orpc.orders.refreshPayment.mutationOptions());
}

export function useOrder(reference: string | null, token: string | null) {
  return useQuery(
    orpc.orders.get.queryOptions({
      input: { reference: reference ?? "", token },
      enabled: Boolean(reference),
      // Polls until paid (the success page verifies with eWAY once, then watches the order).
      refetchInterval: (q) => (!reference || q.state.data?.order.paymentStatus === "paid" ? false : 4000),
    }),
  );
}

export function useMyOrders() {
  const { data: session } = authClient.useSession();
  return useQuery(
    orpc.orders.listMine.queryOptions({
      enabled: Boolean(session?.user),
      staleTime: 15_000,
    }),
  );
}

/** Ask for a freight quote on a cart over the 30 kg shipping table (stored for staff). */
export function useRequestShippingQuote() {
  return useMutation(orpc.shippingQuotes.request.mutationOptions());
}
