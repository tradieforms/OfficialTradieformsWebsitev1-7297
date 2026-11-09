# TradieForms — SKU mapping report (INTERNAL)

> Contains supplier names, codes and costs. Do not publish. Regenerate with `cd packages/web && bun scripts/sku-report.ts`.

Generated 2026-10-27 from `src/api/lib/supplier-catalogue.ts`.

## Summary

- **Fully mapped:** 7 variants
- **Mapped with open questions:** 3 variants
- **SKU mapping required:** 1 variants (Cap)
- **Stored only (not on storefront):** Quarterzip (TF-QZ-P-AM), Lightweight Vest, Style 1 (TF-N-V-EL)

## Mapping table

| Product | Option | Material | TF SKU | Supplier | Supplier code / style | Cost | RRP | Weight | Status |
|---|---|---|---|---|---|---|---|---|---|
| Jacket, Style 2 | Jacket, Style 2 | 100% polyester fiber | TF-P-J-2-AM | AMY | HZ 7177 | A$30.28 | A$69.99 | 0.68 kg | Fully mapped |
| Crewneck Jacket | Crewneck Jacket | 100% polyester fiber | TF-P-J-3-NH-AM | AMY | HZ8518 | A$24.05 | A$64.99 | 0.68 kg | Fully mapped |
| Premium Vest | Premium Vest, Style 2 | 100% nylon fabric, polyester lining, polyester filling | TF-N-V-AM | AMY | — | A$33.50 | A$69.99 | 0.75 kg | Fully mapped |
| Hoodie | Hoodie, Style 1 | 100% cotton, 450 GSM | TF-C-H-AM | AMY | HX Y06 | A$26.57 | A$59.99 | 0.71 kg | Fully mapped |
| Polo | Polo, Option 1 | 40% cotton / 60% polyester | TF-QDC-P-1-AM | AMY | — | A$27.48 | A$39.99 | 0.56 kg | Fully mapped |
| Polo | Polo, Option 2 | 73.5% long-staple cotton / 26.5% elastic fiber, 230 GSM | TF-EQDC-P-4-AM | ELLA | TS-D659 | A$17.83 | A$39.99 | 0.56 kg | Fully mapped |
| Polo | Polo, Option 3 | 100% cotton | TF-C-P-5-AM | AMY | — | A$19.83 | A$39.99 | 0.56 kg | Fully mapped |
| T-Shirt | T-Shirt, 240 GSM | 100% cotton, 240 GSM | TF-C-TS-240-AM | CHENGYU | QP T027 | — | A$39.99 | 0.56 kg | Mapped — confirm |
| T-Shirt | T-Shirt, 260 GSM | 100% cotton, 260 GSM | TF-C-TS-260-AM | CHENGYU | QP T018 | — | A$39.99 | 0.56 kg | Mapped — confirm |
| Tank Top | Tank Top | — | TF-C-TT-AM | — | — | — | A$37.99 | 0.56 kg | Mapped — confirm |
| Cap | Cap | — | — | — | — | — | A$29.99 | — | **SKU mapping required** |
| Quarterzip | Quarterzip | 100% polyester | TF-QZ-P-AM | AMY | TS 3817 | A$20.33 | A$54.99 | 0.71 kg | Stored only |
| Lightweight Vest, Style 1 | Lightweight Vest, Style 1 | 100% nylon fabric, polyester lining, polyester filling | TF-N-V-EL | ELLA | — | A$21.09 | A$54.95 | 0.75 kg | Stored only |

## Open questions

### T-Shirt — T-Shirt, 240 GSM (TF-C-TS-240-AM)
- Supplier cost not supplied.

### T-Shirt — T-Shirt, 260 GSM (TF-C-TS-260-AM)
- Supplier cost not supplied.

### Tank Top — Tank Top (TF-C-TT-AM)
- Supplier, supplier cost and material not supplied (existing RRP A$37.99 retained).

### Cap — Cap
- SKU mapping required — no cap SKU supplied (inventory PDF has Trucker Hat TF-TH-IN and 5 Panel Hats TF-PH-IN; neither confirmed for this 6-panel cap).
- Supplier, cost, material, RRP and shipping weight not supplied (existing A$29.99 retained).
- No shipping weight: caps are excluded from the calculated shipment weight and the order is flagged for a shipping review.

### Quarterzip — Quarterzip (TF-QZ-P-AM)
- Stored only — no product page, images or placements until requested.

### Lightweight Vest, Style 1 — Lightweight Vest, Style 1 (TF-N-V-EL)
- Stored only — removed from the storefront (not -AM); not selectable in the shop or bundles.

## Notes

- Crewneck Jacket (`jacket`, stand-collar navy, no hood) is fully mapped: TF-P-J-3-NH-AM, AMY HZ8518, 100% polyester fiber, A$64.99, 0.68 kg. NH = no hood, confirmed by the owner.
- Jacket, Style 2 (`jacket-b`, hooded black) is fully mapped: TF-P-J-2-AM, AMY HZ 7177, 100% polyester fiber, A$69.99, 0.68 kg.
- Crewneck Jacket (`jacket`) and Jacket, Style 2 (`jacket-b`) are separate products with separate SKUs; they are linked on their product pages as "Jacket styles".
- Supplier, supplier code and cost never leave the server. Orders store SKU, supplier and supplier code (not cost) for the production sheet.
- Only the `-AM` SKUs are sold on the storefront. Lightweight Vest, Style 1 (TF-N-V-EL) and the Quarterzip are stored (supplier data kept) but not offered.
- Embroidery: A$16 per embroidered garment, once per garment even when front and back are both embroidered, multiplied by quantity. Printed garments carry no fee. Shared logic in `src/shared/decoration.ts`.
- Shipping: the weights above drive the Australia shipping calculator (`src/shared/shipping.ts`): bands up to 5/10/15/20/25/30 kg; metro A$16/30/50/70/110/150, regional A$30/50/70/110/150/190. Under 1 kg is charged the up-to-5 kg band (approved). Over 30 kg needs a custom quote and checkout is blocked. No packaging allowance is added (not approved).
- Metro = Australia Post capital-city postcode list (static copy, see `METRO_SOURCE`); everything else regional. The customer can correct the zone; corrections are flagged on the order and the production sheet.
- Cap has no supplied weight: caps are left out of the shipping weight and the order is flagged for a shipping review (`UNWEIGHED_ITEM_POLICY = "flag"`; switch to `"quote"` to require a custom quote instead).
