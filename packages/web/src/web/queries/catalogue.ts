import { useQuery } from "@tanstack/react-query";
import { orpc } from "../lib/api";

export function useCatalogue() {
  return useQuery(orpc.catalogue.list.queryOptions({ staleTime: 5 * 60_000 }));
}

export function useProduct(slug: string | undefined) {
  return useQuery(
    orpc.catalogue.product.queryOptions({
      input: { slug: slug ?? "" },
      enabled: Boolean(slug),
      staleTime: 5 * 60_000,
    }),
  );
}
