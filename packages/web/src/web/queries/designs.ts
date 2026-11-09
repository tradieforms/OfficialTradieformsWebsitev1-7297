import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { orpc } from "../lib/api";
import { authClient } from "../lib/auth";

export function useDesigns() {
  const { data: session } = authClient.useSession();
  return useQuery(
    orpc.designs.list.queryOptions({
      enabled: Boolean(session?.user),
      staleTime: 10_000,
    }),
  );
}

function useInvalidate() {
  const queryClient = useQueryClient();
  return () => queryClient.invalidateQueries({ queryKey: orpc.designs.key() });
}

export function useSaveDesign() {
  const invalidate = useInvalidate();
  return useMutation(orpc.designs.save.mutationOptions({ onSuccess: invalidate }));
}

export function useUpdateDesign() {
  const invalidate = useInvalidate();
  return useMutation(orpc.designs.update.mutationOptions({ onSuccess: invalidate }));
}

export function useDeleteDesign() {
  const invalidate = useInvalidate();
  return useMutation(orpc.designs.remove.mutationOptions({ onSuccess: invalidate }));
}

export function useReorderDesigns() {
  const invalidate = useInvalidate();
  return useMutation(orpc.designs.reorder.mutationOptions({ onSuccess: invalidate }));
}
