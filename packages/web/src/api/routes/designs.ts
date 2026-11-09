import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../database";
import * as schema from "../database/schema";
import { authed } from "../middleware/auth";
import { logoKeyInput } from "../lib/logo-key";
import { colourOffered, getProduct, getVariant } from "../../shared/catalogue";
import {
  type PlacedLogoInput,
  placedLogoInput as transform,
  resolveOrThrow,
  stringifyLogo,
} from "../lib/placement-input";

const designInput = z.object({
  name: z.string().min(1).max(80),
  productSlug: z.string().max(80),
  variantId: z.string().max(40).nullable().optional(),
  colourId: z.string().max(40),
  size: z.string().max(40),
  logoKey: logoKeyInput.nullable().optional(),
  logoName: z.string().max(160).nullable().optional(),
  activeView: z.enum(["front", "back"]).nullable().optional(),
  frontLogo: transform.nullable().optional(),
  backLogo: transform.nullable().optional(),
  notes: z.string().max(400).nullable().optional(),
});

function assertValidProduct(
  productSlug: string,
  colourId: string,
  size: string,
  variantId?: string | null,
) {
  const product = getProduct(productSlug);
  if (!product) throw new ORPCError("BAD_REQUEST", { message: "Unknown product" });
  if (!getVariant(product, variantId))
    throw new ORPCError("BAD_REQUEST", { message: "Unknown option for this garment" });
  const colour = product.colours.find((c) => c.id === colourId);
  if (!colour) throw new ORPCError("BAD_REQUEST", { message: "Unknown colour for this garment" });
  if (!colourOffered(product, variantId, colourId))
    throw new ORPCError("BAD_REQUEST", { message: "That colour isn't made in the chosen fabric option" });
  if (!product.sizes.includes(size))
    throw new ORPCError("BAD_REQUEST", { message: "Unknown size for this garment" });
  return { product, colour };
}

function parseStored(raw: string | null): PlacedLogoInput | null {
  if (!raw) return null;
  try {
    const parsed = transform.safeParse(JSON.parse(raw));
    return parsed.success ? parsed.data : null;
  } catch {
    return null;
  }
}

/** Saved designs — full editable configuration, scoped to the signed-in user. */
export const designs = {
  list: authed.handler(({ context }) =>
    db
      .select()
      .from(schema.designs)
      .where(eq(schema.designs.userId, context.user.id))
      .orderBy(asc(schema.designs.sortOrder), asc(schema.designs.id)),
  ),

  save: authed
    .input(designInput)
    .handler(async ({ input, context }) => {
      const { product, colour } = assertValidProduct(
        input.productSlug,
        input.colourId,
        input.size,
        input.variantId,
      );
      const frontLogo = resolveOrThrow(product, colour, "front", input.frontLogo);
      const backLogo = resolveOrThrow(product, colour, "back", input.backLogo);

      const [last] = await db
        .select({ sortOrder: schema.designs.sortOrder })
        .from(schema.designs)
        .where(eq(schema.designs.userId, context.user.id))
        .orderBy(asc(schema.designs.sortOrder));

      const [row] = await db
        .insert(schema.designs)
        .values({
          userId: context.user.id,
          name: input.name,
          productSlug: input.productSlug,
          variantId: getVariant(product, input.variantId)!.id,
          colourId: input.colourId,
          size: input.size,
          logoKey: input.logoKey ?? null,
          logoName: input.logoName ?? null,
          activeView: input.activeView ?? null,
          frontLogo: stringifyLogo(frontLogo),
          backLogo: stringifyLogo(backLogo),
          notes: input.notes ?? null,
          sortOrder: (last?.sortOrder ?? 0) + 1,
        })
        .returning();
      return row;
    }),

  update: authed
    .input(designInput.partial().extend({ id: z.number() }))
    .handler(async ({ input, context }) => {
      const { id, ...patch } = input;
      const [existing] = await db
        .select()
        .from(schema.designs)
        .where(and(eq(schema.designs.id, id), eq(schema.designs.userId, context.user.id)));
      if (!existing) throw new ORPCError("NOT_FOUND", { message: "Design not found" });

      const productSlug = patch.productSlug ?? existing.productSlug;
      const colourId = patch.colourId ?? existing.colourId;
      const size = patch.size ?? existing.size;
      // A product change without a variant falls back to the new product's default option.
      const variantId =
        patch.variantId !== undefined
          ? patch.variantId
          : productSlug === existing.productSlug
            ? existing.variantId
            : null;
      const { product, colour } = assertValidProduct(productSlug, colourId, size, variantId);
      // Re-resolve both views against the (possibly new) product + colour so stored
      // placements always match that garment's fixed spots.
      const frontRaw = patch.frontLogo === undefined ? parseStored(existing.frontLogo) : patch.frontLogo;
      const backRaw = patch.backLogo === undefined ? parseStored(existing.backLogo) : patch.backLogo;
      const frontLogo = resolveOrThrow(product, colour, "front", frontRaw);
      const backLogo = resolveOrThrow(product, colour, "back", backRaw);

      const [row] = await db
        .update(schema.designs)
        .set({
          name: patch.name ?? existing.name,
          productSlug,
          variantId: getVariant(product, variantId)!.id,
          colourId,
          size,
          logoKey: patch.logoKey === undefined ? existing.logoKey : patch.logoKey,
          logoName: patch.logoName === undefined ? existing.logoName : patch.logoName,
          activeView: patch.activeView === undefined ? existing.activeView : patch.activeView,
          frontLogo: stringifyLogo(frontLogo),
          backLogo: stringifyLogo(backLogo),
          notes: patch.notes === undefined ? existing.notes : patch.notes,
          updatedAt: new Date(),
        })
        .where(eq(schema.designs.id, id))
        .returning();
      return row;
    }),

  remove: authed
    .input(z.object({ id: z.number() }))
    .handler(async ({ input, context }) => {
      const deleted = await db
        .delete(schema.designs)
        .where(and(eq(schema.designs.id, input.id), eq(schema.designs.userId, context.user.id)))
        .returning({ id: schema.designs.id });
      if (!deleted.length) throw new ORPCError("NOT_FOUND", { message: "Design not found" });
      return { id: input.id };
    }),

  reorder: authed
    .input(z.object({ ids: z.array(z.number().int()).min(1).max(200) }))
    .handler(async ({ input, context }) => {
      await Promise.all(
        input.ids.map((id, index) =>
          db
            .update(schema.designs)
            .set({ sortOrder: index, updatedAt: new Date() })
            .where(and(eq(schema.designs.id, id), eq(schema.designs.userId, context.user.id))),
        ),
      );
      return { ok: true };
    }),
};
