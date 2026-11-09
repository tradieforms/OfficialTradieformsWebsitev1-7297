import { z } from "zod";
import { ORPCError } from "@orpc/server";
import type { GarmentColour, PlacementId, Product } from "../../shared/catalogue";
import { type PlacedLogo, type PlacementView, resolveLogo } from "../../shared/placements";

const PLACEMENT_IDS = [
  "left-chest",
  "right-chest",
  "left-sleeve",
  "right-sleeve",
  "standard-back",
  "front-panel",
] as const satisfies readonly PlacementId[];

/**
 * What the browser may send for one view. Only `placementId` matters for new data —
 * the server rebuilds the box and production spec from the catalogue. x/y/scale are
 * accepted so carts and drafts saved before fixed spots still load (mapped to the
 * nearest spot and flagged `migrated`).
 */
export const placedLogoInput = z.object({
  placementId: z.enum(PLACEMENT_IDS).optional(),
  x: z.number().min(-50).max(150),
  y: z.number().min(-50).max(150),
  scale: z.number().min(0).max(100),
  height: z.number().min(0).max(100).optional(),
  rotation: z.number().min(-360).max(360).default(0),
  enabled: z.boolean(),
  migrated: z.boolean().optional(),
  /** Decoration method for this view; omitted = print. */
  method: z.enum(["print", "embroidery"]).optional(),
  // Ignored on input (rebuilt server-side) but tolerated so clients can echo it back.
  production: z.unknown().optional(),
});

export type PlacedLogoInput = z.infer<typeof placedLogoInput>;

/** Resolves one view to the canonical placed logo, or throws a customer-readable error. */
export function resolveOrThrow(
  product: Product,
  colour: GarmentColour,
  view: PlacementView,
  raw: PlacedLogoInput | null | undefined,
): PlacedLogo | null {
  const { production: _ignored, ...rest } = raw ?? ({} as PlacedLogoInput);
  const res = resolveLogo(product, colour, view, raw ? (rest as Partial<PlacedLogo>) : null, {
    allowLegacy: true,
  });
  if (!res.ok)
    throw new ORPCError("BAD_REQUEST", {
      message: `${res.reason}. Pick one of the fixed logo spots for the ${product.name} in ${colour.name}.`,
    });
  return res.logo;
}

/** One front spot + one back spot is enforced by the data shape (one field per view). */
export const stringifyLogo = (l: PlacedLogo | null) => (l ? JSON.stringify(l) : null);
