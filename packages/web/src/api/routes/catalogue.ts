import { z } from "zod";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import {
  bundles,
  bundleContents,
  bundleFullPrice,
  bundleSaving,
  bundleDiscountPercent,
  products,
  getProduct,
} from "../../shared/catalogue";

/** Public catalogue read — the same data the API validates orders against. */
export const catalogue = {
  list: base.handler(() => ({
    products,
    bundles: bundles.map((bundle) => ({
      ...bundle,
      fullPrice: bundleFullPrice(bundle),
      saving: bundleSaving(bundle),
      contents: bundleContents(bundle),
      discountPercent: bundleDiscountPercent(bundle),
    })),
  })),

  product: base.input(z.object({ slug: z.string() })).handler(({ input }) => {
    const product = getProduct(input.slug);
    if (!product) throw new ORPCError("NOT_FOUND", { message: "Unknown product" });
    return product;
  }),
};
