import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { authClient } from "../lib/auth";

/** Whether the signed-in user is on the ADMIN_EMAILS allowlist. */
export function useAdminStatus() {
  const { data: session } = authClient.useSession();
  return useQuery(
    orpc.admin.status.queryOptions({
      enabled: Boolean(session?.user),
      staleTime: 60_000,
    }),
  );
}

/** Recent orders with line SKUs — admin only (the server rejects anyone else). */
export function useAdminOrders(enabled: boolean) {
  return useQuery(
    orpc.admin.orders.queryOptions({
      enabled,
      staleTime: 10_000,
    }),
  );
}

/** Supplier production sheet (PDF) for one order. Plain HTTP because it streams a binary file. */
export function productionPdfUrl(reference: string) {
  return `/api/admin/orders/${encodeURIComponent(reference)}/production.pdf`;
}

/** Shipping quote requests (carts over 30 kg) — admin only. */
export function useAdminShippingQuotes(enabled: boolean) {
  return useQuery(
    orpc.admin.shippingQuotes.queryOptions({
      enabled,
      staleTime: 10_000,
    }),
  );
}
