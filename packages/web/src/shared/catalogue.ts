/**
 * TradieForms catalogue — the single source of truth for products, colours,
 * sizes and bundles. Imported by both the API (price validation, order totals)
 * and the web front end (shop, product pages, bundle builder).
 *
 * All money values are integer cents in AUD.
 */

export const CURRENCY = "AUD";

export interface GarmentColour {
  /** Stable id used in saved designs, cart lines and orders. */
  id: string;
  name: string;
  /** Swatch colour shown in the UI. */
  hex: string;
  /** Front cutout path (always available, transparent PNG). */
  front: string;
  /** Back cutout path — only where a genuine back view exists. Never a mirrored front. */
  back?: string;
  /**
   * "supplier" = real supplier photograph.
   * "tint" = rendered preview: the supplier photo of another colour re-shaded
   * into this colour offline (tools/recolour-garments.py). Texture, seams and
   * shadows come from the real photo; small trims may not match the real garment.
   */
  source: "supplier" | "tint";
  /** Set when the back view is a rendered preview but the front is a supplier photo. */
  backSource?: "supplier" | "tint";
  /** Short note surfaced in the studio when a colour is a rendered preview. */
  note?: string;
  /** Overrides the product's front print map when this photo is framed differently. */
  printFront?: PrintMap;
  /**
   * Per-photo overrides for fixed logo spots (stage geometry only), for photos framed
   * differently from the product's main photo. Production sizes never change per colour.
   */
  spots?: Partial<Record<PlacementId, SpotBox>>;
}

/**
 * The fixed logo spots a customer can choose from. There is no free positioning:
 * every spot has a set view, on-screen box and production size (see shared/placements.ts).
 * "Left"/"right" are always the WEARER's left/right — the wearer's left shows on the
 * viewer's right of a front-facing photo.
 */
export type PlacementId =
  | "left-chest"
  | "right-chest"
  | "left-sleeve"
  | "right-sleeve"
  | "standard-back"
  | "front-panel";

/** A spot's on-screen box: centre x/y and width/height, in % of the square preview stage. */
export interface SpotBox {
  x: number;
  y: number;
  w: number;
  h: number;
}

/**
 * Where a logo can sit on a garment photo, in % of the square preview stage.
 * Coordinates are relative to the stage (which always shows the whole photo
 * with object-contain), so placement survives resizing and colour changes.
 */
export interface PrintMap {
  /** Garment centre line (x %). */
  centre: number;
  /** Printable half-width either side of the centre line. */
  halfWidth: number;
  /** Printable band, top and bottom (y %). */
  top: number;
  bottom: number;
  /** Default logo position: x offset from the centre line towards the wearer's left, and y. */
  chestOffset: number;
  chestY: number;
  /** Default logo width (% of stage). */
  scale: number;
  /** Explicit boxes for fixed spots on this view; chest/back/panel boxes default from the map. */
  spots?: Partial<Record<PlacementId, SpotBox>>;
}

/**
 * A sellable variant of a product line (fabric / style option). Each variant maps to its
 * own supplier SKU on the server (api/lib/supplier-catalogue.ts) — SKUs, supplier names,
 * costs and supplier codes never live in this file, because it ships to the browser.
 */
export interface ProductVariant {
  /** Stable id used in cart lines, saved designs and orders. Unique within the product. */
  id: string;
  /** Customer-facing name of this option, e.g. "Premium Vest, Style 2". */
  name: string;
  /** Short label for option cards, e.g. "260 GSM". */
  label: string;
  /** Fabric composition, shown to customers. */
  material: string;
  /** Fabric weight, where supplied (e.g. "230 GSM"). */
  fabricWeight?: string;
  /** Retail price, integer cents inc. GST. */
  price: number;
  /** Shipping weight per item in kg. Undefined = not supplied yet (flagged for review). */
  weightKg?: number;
  /**
   * Colour ids this fabric option is made in, when it differs between options (e.g. the
   * black polo only exists in the stretch-cotton fabric). Omitted = every product colour.
   * Enforced on the server (orders, saved designs) — not just hidden in the UI.
   */
  colours?: string[];
}

export interface Product {
  slug: string;
  name: string;
  /** Price of the default variant (cents). Derived — never set by hand. */
  price: number;
  /** Sellable variants. One entry when the product has a single option. */
  variants: ProductVariant[];

  defaultVariant: string;
  /** Products in the same family are offered side by side as alternatives (e.g. jackets). */
  family?: string;
  category: "Outerwear" | "Tops" | "Headwear";
  tagline: string;
  description: string;
  details: string[];
  sizes: string[];
  colours: GarmentColour[];
  /** Default colour id for the studio. */
  defaultColour: string;
  /** Card / hero image. */
  image: string;
  featured: boolean;
  badge?: string;
  /** Print areas per view. A view without a map has no placement there. */
  print: { front: PrintMap; back?: PrintMap };
  /** Label for the default front position ("Left chest", "Front panel"). */
  frontDefaultLabel?: string;
  /**
   * Approved logo spots for this product, in display order. Sleeve spots need explicit
   * sleeve boxes in the front print map. Front spots are mutually exclusive (one front
   * logo per garment); standard-back is the only back spot.
   */
  placements: PlacementId[];
  /** Outline used for the back diagram while a colour has no back photo yet. */
  silhouette: "sleeved" | "sleeveless" | "cap";
}

const CUT = "/images/cutouts";

export const SIZE_RANGE = ["XS", "S", "M", "L", "XL", "2XL", "3XL", "4XL", "5XL"];

const rawProducts: Omit<Product, "price">[] = [
  {
    slug: "jacket-b",
    name: "Jacket, Style 2",
    category: "Outerwear",
    family: "jacket",
    tagline: "Hooded softshell",
    defaultVariant: "standard",
    variants: [
      {
        id: "standard",
        name: "Jacket, Style 2",
        label: "Jacket, Style 2",
        material: "100% polyester fiber",
        price: 6999,
        weightKg: 0.68,
      },
    ],
    description:
      "Softshell jacket in black, 100% polyester fiber. Full-length zip, zip hand pockets and a hood that holds its shape on site. Front and back views included.",
    details: [
      "100% polyester fiber",
      "Hooded softshell with bonded face",
      "Full-length front zip and zip hand pockets",
      "Clean back panel for branding",
      "Front and back views included",
    ],
    sizes: SIZE_RANGE,
    defaultColour: "black",
    image: `${CUT}/jacketb-black-front.png`,
    featured: true,
    print: {
      front: {
        centre: 50, halfWidth: 20, top: 18, bottom: 86, chestOffset: 11, chestY: 32, scale: 12,
        spots: { "left-sleeve": { x: 70.5, y: 40, w: 6, h: 6 }, "right-sleeve": { x: 29.5, y: 40, w: 6, h: 6 } },
      },
      back: {
        centre: 50, halfWidth: 22, top: 18, bottom: 86, chestOffset: 0, chestY: 34, scale: 26,
        spots: { "standard-back": { x: 50, y: 37, w: 30, h: 15 } },
      },
    },
    placements: ["left-chest", "right-chest", "left-sleeve", "right-sleeve", "standard-back"],
    silhouette: "sleeved",
    badge: "Crew favourite",
    colours: [
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/jacketb-black-front.png`,
        back: `${CUT}/jacketb-black-back.png`,
        source: "supplier",
      },
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/jacketb-navy-front-recolour.png`,
        back: `${CUT}/jacketb-navy-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier navy photo still to come.",
      },
      {
        id: "charcoal",
        name: "Charcoal",
        hex: "#3C4149",
        front: `${CUT}/jacketb-charcoal-front-recolour.png`,
        back: `${CUT}/jacketb-charcoal-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier charcoal photo still to come.",
      },
    ],
  },
  {
    slug: "jacket",
    name: "Crewneck Jacket",
    category: "Outerwear",
    family: "jacket",
    tagline: "Stand-collar softshell",
    defaultVariant: "standard",
    variants: [
      {
        id: "standard",
        name: "Crewneck Jacket",
        label: "Crewneck Jacket",
        material: "100% polyester fiber",
        price: 6499,
        weightKg: 0.68,
      },
    ],
    description:
      "Stand-collar softshell jacket in navy, 100% polyester fiber. Full-length zip, zip hand pockets, and a clean back panel for branding. Front and back views included.",
    details: [
      "100% polyester fiber",
      "Stand-collar softshell, bonded face",
      "Full-length zip and zip hand pockets",
      "Clean back panel for branding",
      "Front and back views included",
    ],
    sizes: SIZE_RANGE,
    defaultColour: "navy",
    image: `${CUT}/jacket-navy-front.png`,
    featured: true,
    print: {
      front: {
        centre: 50, halfWidth: 24, top: 16, bottom: 88, chestOffset: 12, chestY: 30, scale: 13,
        spots: { "left-sleeve": { x: 75, y: 37, w: 7, h: 7 }, "right-sleeve": { x: 25, y: 37, w: 7, h: 7 } },
      },
      back: {
        centre: 50, halfWidth: 25, top: 15, bottom: 88, chestOffset: 0, chestY: 32, scale: 28,
        spots: { "standard-back": { x: 50, y: 33, w: 32, h: 16 } },
      },
    },
    placements: ["left-chest", "right-chest", "left-sleeve", "right-sleeve", "standard-back"],
    silhouette: "sleeved",
    colours: [
      // Navy supplier photos (session 16) replace the retired olive photos; same garment
      // model and framing, so the print map and sleeve spots carry over unchanged.
      {
        id: "navy",
        name: "Navy",
        hex: "#24273A",
        front: `${CUT}/jacket-navy-front.png`,
        back: `${CUT}/jacket-navy-back.png`,
        source: "supplier",
      },
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/jacket-black-front-recolour.png`,
        back: `${CUT}/jacket-black-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier black photo still to come.",
      },
    ],
  },
  {
    slug: "vest",
    name: "Premium Vest",
    category: "Outerwear",
    tagline: "Puffer vest, Style 2",
    defaultVariant: "premium",
    variants: [
      {
        id: "premium",
        name: "Premium Vest, Style 2",
        label: "Premium",
        material: "100% nylon fabric, polyester lining, polyester filling",
        price: 6999,
        weightKg: 0.75,
      },
    ],
    // Lightweight Vest, Style 1 (TF-N-V-EL) was removed from the storefront (owner decision,
    // session 16). Its record is kept server-side in api/lib/supplier-catalogue.ts.
    description:
      "Premium puffer vest (Style 2) with high collar, horizontal baffles, full zip and lower hand pockets. Front and back views included.",
    details: [
      "100% nylon fabric, polyester lining and filling",
      "High collar, horizontal baffle puffer",
      "Full zip with lower hand pockets",
      "Front and back views included",
    ],
    sizes: SIZE_RANGE,
    defaultColour: "black",
    image: `${CUT}/vest-black-front.png`,
    featured: true,
    print: {
      front: { centre: 52, halfWidth: 19, top: 16, bottom: 88, chestOffset: 10, chestY: 32, scale: 12 },
      back: {
        centre: 50, halfWidth: 21, top: 16, bottom: 88, chestOffset: 0, chestY: 32, scale: 24,
        spots: { "standard-back": { x: 50, y: 32, w: 28, h: 14 } },
      },
    },
    placements: ["left-chest", "right-chest", "standard-back"],
    silhouette: "sleeveless",
    badge: "4 colours",
    colours: [
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/vest-black-front.png`,
        back: `${CUT}/vest-black-back.png`,
        source: "supplier",
      },
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/vest-white-front-recolour.png`,
        back: `${CUT}/vest-white-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier white photo still to come.",
      },
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/vest-navy-front-recolour.png`,
        back: `${CUT}/vest-navy-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier navy photo still to come.",
      },
      {
        id: "red",
        name: "Red",
        hex: "#B4232A",
        front: `${CUT}/vest-red-front-recolour.png`,
        back: `${CUT}/vest-red-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier red photo still to come.",
      },
    ],
  },
  {
    slug: "hoodie",
    name: "Hoodie",
    category: "Tops",
    tagline: "Heavyweight pullover",
    defaultVariant: "style-1",
    variants: [
      {
        id: "style-1",
        name: "Hoodie, Style 1",
        label: "Style 1",
        material: "100% cotton",
        fabricWeight: "450 GSM",
        price: 5999,
        weightKg: 0.71,
      },
    ],
    description:
      "Heavyweight 450 GSM pullover hoodie in 100% cotton, with a lined hood, kangaroo pocket and ribbed cuffs. Front and back views included.",
    details: [
      "100% cotton, 450 GSM, with lined hood",
      "Kangaroo pocket, ribbed cuffs and hem",
      "Front and back views included",
    ],
    sizes: SIZE_RANGE,
    defaultColour: "navy",
    image: `${CUT}/hoodie-navy-front.png`,
    featured: true,
    print: {
      front: {
        centre: 50, halfWidth: 24, top: 22, bottom: 84, chestOffset: 12, chestY: 33, scale: 14,
        spots: { "left-sleeve": { x: 74, y: 40, w: 7, h: 7 }, "right-sleeve": { x: 24, y: 40, w: 7, h: 7 } },
      },
      back: {
        centre: 50, halfWidth: 25, top: 24, bottom: 84, chestOffset: 0, chestY: 40, scale: 28,
        spots: { "standard-back": { x: 50, y: 43, w: 34, h: 17 } },
      },
    },
    placements: ["left-chest", "right-chest", "left-sleeve", "right-sleeve", "standard-back"],
    silhouette: "sleeved",
    colours: [
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/hoodie-navy-front.png`,
        back: `${CUT}/hoodie-navy-back.png`,
        source: "supplier",
      },
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/hoodie-white-front.png`,
        back: `${CUT}/hoodie-white-back-recolour.png`,
        source: "supplier",
        backSource: "tint",
        note: "Back view is a rendered preview — supplier white back photo still to come.",
        // Framed narrower than the navy photo: sleeves sit further in.
        spots: { "left-sleeve": { x: 75, y: 40, w: 7, h: 7 }, "right-sleeve": { x: 26, y: 40, w: 7, h: 7 } },
      },
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/hoodie-black-front.png`,
        source: "supplier",
        // Framed wider than the navy photo: sleeves sit further out.
        spots: { "left-sleeve": { x: 79, y: 40, w: 7, h: 7 }, "right-sleeve": { x: 21, y: 40, w: 7, h: 7 } },
      },
    ],
  },
  {
    slug: "work-polo",
    name: "Polo",
    category: "Tops",
    tagline: "Pique knit polo",
    defaultVariant: "option-1",
    variants: [
      {
        id: "option-1",
        name: "Polo, Option 1",
        label: "Cotton / poly blend",
        material: "40% cotton / 60% polyester",
        price: 3999,
        weightKg: 0.56,
        // Owner, session 18: no black in this fabric (black is stretch cotton only).
        colours: ["white", "navy", "royal-blue", "red"],
      },
      {
        id: "option-2",
        name: "Polo, Option 2",
        label: "Stretch cotton",
        material: "73.5% long-staple cotton / 26.5% elastic fiber",
        fabricWeight: "230 GSM",
        price: 3999,
        weightKg: 0.56,
        // The only polo fabric offered in black.
        colours: ["white", "navy", "black", "royal-blue", "red"],
      },
      {
        id: "option-3",
        name: "Polo, Option 3",
        label: "100% cotton",
        material: "100% cotton",
        price: 3999,
        weightKg: 0.56,
        // Buyer: the 100% cotton polo must NOT be offered in black (or red).
        colours: ["white", "navy", "royal-blue"],
      },
    ],
    description:
      "Polo with a three-button placket, knitted collar and contrast tipping on the collar and cuffs. Three fabric options. Front and back views included.",
    details: [
      "Three fabric options: cotton/poly blend, stretch cotton or 100% cotton",
      "Black is made in the stretch cotton fabric only",
      "Knitted collar",
      "Three-button placket, contrast tipping",
      "Front and back views included",
    ],
    sizes: SIZE_RANGE,
    defaultColour: "white",
    image: `${CUT}/polo-white-front.png`,
    featured: true,
    print: {
      front: {
        centre: 50, halfWidth: 25, top: 15, bottom: 90, chestOffset: 13, chestY: 30, scale: 14,
        spots: { "left-sleeve": { x: 79, y: 32, w: 7, h: 7 }, "right-sleeve": { x: 21, y: 32, w: 7, h: 7 } },
      },
      back: {
        centre: 50, halfWidth: 26, top: 12, bottom: 90, chestOffset: 0, chestY: 28, scale: 28,
        spots: { "standard-back": { x: 50, y: 27, w: 32, h: 16 } },
      },
    },
    placements: ["left-chest", "right-chest", "left-sleeve", "right-sleeve", "standard-back"],
    silhouette: "sleeved",
    colours: [
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/polo-white-front.png`,
        back: `${CUT}/polo-white-back.png`,
        source: "supplier",
      },
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/polo-black-front.png`,
        source: "supplier",
      },
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/polo-navy-front-recolour.png`,
        back: `${CUT}/polo-navy-back-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier navy photo still to come.",
      },
      {
        // Buyer photographs, session 18. Fabric not confirmed — offered on all three
        // options for now (flagged for the owner).
        id: "royal-blue",
        name: "Royal Blue",
        hex: "#3047A0",
        front: `${CUT}/polo-royal-blue-front.png`,
        back: `${CUT}/polo-royal-blue-back.png`,
        source: "supplier",
      },
      {
        // Buyer photographs, session 18. Cotton/poly and stretch cotton only (owner).
        id: "red",
        name: "Red",
        hex: "#D81B22",
        front: `${CUT}/polo-red-front.png`,
        back: `${CUT}/polo-red-back.png`,
        source: "supplier",
      },
    ],
  },
  {
    slug: "work-t-shirt",
    name: "T-Shirt",
    category: "Tops",
    tagline: "Crew neck tee",
    defaultVariant: "240gsm",
    variants: [
      {
        id: "240gsm",
        name: "T-Shirt, 240 GSM",
        label: "240 GSM",
        material: "100% cotton",
        fabricWeight: "240 GSM",
        price: 3999,
        weightKg: 0.56,
      },
      {
        id: "260gsm",
        name: "T-Shirt, 260 GSM",
        label: "260 GSM",
        material: "100% cotton",
        fabricWeight: "260 GSM",
        price: 3999,
        weightKg: 0.56,
      },
    ],
    description:
      "Crew neck work t-shirt in 100% cotton, in a 240 GSM or heavier 260 GSM fabric, with a taped neckline that keeps its shape through a working week.",
    details: ["100% cotton, 240 or 260 GSM", "Taped neckline", "Front view included"],
    sizes: SIZE_RANGE,
    defaultColour: "black",
    image: `${CUT}/tshirt-black-front.png`,
    featured: true,
    print: {
      front: {
        centre: 50, halfWidth: 25, top: 15, bottom: 90, chestOffset: 13, chestY: 30, scale: 14,
        spots: { "left-sleeve": { x: 82, y: 30, w: 8, h: 8 }, "right-sleeve": { x: 18, y: 30, w: 8, h: 8 } },
      },
    },
    placements: ["left-chest", "right-chest", "left-sleeve", "right-sleeve", "standard-back"],
    silhouette: "sleeved",
    colours: [
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/tshirt-black-front.png`,
        source: "supplier",
      },
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/tshirt-white-front-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier white photo still to come.",
      },
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/tshirt-navy-front-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier navy photo still to come.",
      },
    ],
  },
  {
    slug: "tank-top",
    name: "Tank Top",
    category: "Tops",
    defaultVariant: "standard",
    variants: [
      // SKU TF-C-TT-AM (confirmed session 16). Material not supplied yet.
      { id: "standard", name: "Tank Top", label: "Standard", material: "", price: 3799, weightKg: 0.56 },
    ],
    tagline: "Singlet",
    description:
      "Sleeveless singlet with a ribbed neckline and dropped armholes for full reach on the tools. Front and back views included.",
    details: ["Sleeveless singlet cut", "Ribbed neckline", "Front and back views included"],
    sizes: SIZE_RANGE,
    defaultColour: "black",
    image: `${CUT}/tank-black-front.png`,
    featured: false,
    print: {
      // Black/charcoal front photos recentred horizontally (session 18) — body centre now 50%.
      front: { centre: 50, halfWidth: 20, top: 22, bottom: 85, chestOffset: 10, chestY: 33, scale: 12 },
      // Back photo (charcoal supplier shot, centred): body spans ~28–72% across the chest.
      back: {
        centre: 50, halfWidth: 19, top: 14, bottom: 86, chestOffset: 0, chestY: 30, scale: 24,
        spots: { "standard-back": { x: 50, y: 31, w: 28, h: 14 } },
      },
    },
    placements: ["left-chest", "right-chest", "standard-back"],
    silhouette: "sleeveless",
    colours: [
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/tank-black-front.png`,
        back: `${CUT}/tank-black-back-recolour.png`,
        source: "supplier",
        backSource: "tint",
        note: "Back view is a rendered preview — supplier black back photo still to come.",
      },
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/tank-white-front.png`,
        back: `${CUT}/tank-white-back-recolour.png`,
        source: "supplier",
        backSource: "tint",
        note: "Back view is a rendered preview — supplier white back photo still to come.",
        // The white tank photo is framed differently (457×620 portrait), so it keeps its own print area.
        printFront: { centre: 50, halfWidth: 17, top: 24, bottom: 88, chestOffset: 9, chestY: 35, scale: 11 },
      },
      {
        // The supplied back photo is charcoal; its front is a tint of the black front photo.
        id: "charcoal",
        name: "Charcoal",
        hex: "#4F4C53",
        front: `${CUT}/tank-charcoal-front-recolour.png`,
        back: `${CUT}/tank-charcoal-back.png`,
        source: "tint",
        backSource: "supplier",
        note: "Front view is a rendered preview — supplier charcoal front photo still to come.",
      },
    ],
  },
  {
    slug: "cap",
    name: "Cap",
    category: "Headwear",
    defaultVariant: "standard",
    variants: [
      // SKU, material and shipping weight not supplied yet — flagged in the SKU mapping report.
      // No weightKg on purpose: the shipping calculator excludes caps and flags the order.
      { id: "standard", name: "Cap", label: "Standard", material: "", price: 2999 },
    ],
    tagline: "6-panel cap",
    description:
      "Structured six-panel cap with a curved brim and an adjustable back closure. One size fits most.",
    details: ["Structured six-panel crown", "Curved brim", "Adjustable back closure"],
    sizes: ["ONE SIZE"],
    defaultColour: "black",
    image: `${CUT}/cap-black-front.png`,
    featured: false,
    print: {
      front: { centre: 46, halfWidth: 28, top: 14, bottom: 56, chestOffset: 0, chestY: 34, scale: 22 },
    },
    frontDefaultLabel: "Front panel",
    placements: ["front-panel"],
    silhouette: "cap",
    colours: [
      {
        id: "black",
        name: "Black",
        hex: "#15171A",
        front: `${CUT}/cap-black-front.png`,
        source: "supplier",
      },
      {
        id: "navy",
        name: "Navy",
        hex: "#12305C",
        front: `${CUT}/cap-navy-front-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier navy photo still to come.",
      },
      {
        id: "white",
        name: "White",
        hex: "#F2F1EC",
        front: `${CUT}/cap-white-front-recolour.png`,
        source: "tint",
        note: "Rendered preview — supplier white photo still to come.",
      },
    ],
  },
];

export const products: Product[] = rawProducts.map((p) => {
  const v = p.variants.find((x) => x.id === p.defaultVariant) ?? p.variants[0];
  return { ...p, price: v.price };
});

/** A product's variant by id; falls back to the default variant when id is omitted. */
export function getVariant(product: Product, variantId?: string | null): ProductVariant | undefined {
  if (!variantId) return product.variants.find((v) => v.id === product.defaultVariant) ?? product.variants[0];
  return product.variants.find((v) => v.id === variantId);
}

/**
 * Colours a fabric option is made in, in the product's colour order. Falls back to every
 * product colour when the option doesn't restrict them (or the variant is unknown).
 */
export function variantColours(product: Product, variantId?: string | null): GarmentColour[] {
  const allowed = getVariant(product, variantId)?.colours;
  return allowed ? product.colours.filter((c) => allowed.includes(c.id)) : product.colours;
}

/** True when this colour is made in this fabric option. */
export function colourOffered(product: Product, variantId: string | null | undefined, colourId: string): boolean {
  return variantColours(product, variantId).some((c) => c.id === colourId);
}

/** The colour to show for an option: the requested one when it's offered, else the first offered. */
export function offeredColour(product: Product, variantId: string | null | undefined, colourId?: string | null): GarmentColour {
  const list = variantColours(product, variantId);
  return (
    list.find((c) => c.id === colourId) ??
    list.find((c) => c.id === product.defaultColour) ??
    list[0] ??
    product.colours[0]
  );
}

/** Lowest variant price — shown as "From …" when variants differ in price. */
export function fromPrice(product: Product): { price: number; varies: boolean } {
  const prices = product.variants.map((v) => v.price);
  const min = Math.min(...prices);
  return { price: min, varies: prices.some((p) => p !== min) };
}

/** Customer-facing name for an order line: the variant name when the product has options. */
export function variantDisplayName(product: Product, variant: ProductVariant): string {
  return product.variants.length > 1 ? variant.name : product.name;
}

/** Display name for a product + (possibly missing or retired) variant id. */
export function garmentName(product: Product, variantId?: string | null): string {
  const v = getVariant(product, variantId) ?? getVariant(product);
  return v ? variantDisplayName(product, v) : product.name;
}

/** Other products in the same family (e.g. the other jacket styles), in catalogue order. */
export function familyOf(product: Product): Product[] {
  return product.family ? products.filter((p) => p.family === product.family) : [product];
}

export interface BundleLine {
  slug: string;
  quantity: number;
}

export interface Bundle {
  id: string;
  name: string;
  tier: string;
  price: number;
  pieces: number;
  image: string;
  lines: BundleLine[];
}

export const bundles: Bundle[] = [
  {
    id: "bundle-39",
    name: "Spring Bundle",
    tier: "Starter Kit",
    price: 149900,
    pieces: 39,
    image: "/images/bundles/kit-39.png",
    lines: [
      { slug: "hoodie", quantity: 5 },
      { slug: "vest", quantity: 2 },
      { slug: "jacket", quantity: 2 },
      { slug: "work-t-shirt", quantity: 10 },
      { slug: "work-polo", quantity: 5 },
      { slug: "tank-top", quantity: 5 },
      { slug: "cap", quantity: 10 },
    ],
  },
  {
    id: "bundle-59",
    name: "Spring Bundle",
    tier: "Team Kit",
    price: 229900,
    pieces: 59,
    image: "/images/bundles/kit-59.png",
    lines: [
      { slug: "hoodie", quantity: 8 },
      { slug: "vest", quantity: 4 },
      { slug: "jacket", quantity: 4 },
      { slug: "work-t-shirt", quantity: 15 },
      { slug: "work-polo", quantity: 8 },
      { slug: "tank-top", quantity: 8 },
      { slug: "cap", quantity: 12 },
    ],
  },
  {
    id: "bundle-82",
    name: "Spring Bundle",
    tier: "Pro Kit",
    price: 319900,
    pieces: 82,
    image: "/images/bundles/kit-82.png",
    lines: [
      { slug: "hoodie", quantity: 10 },
      { slug: "vest", quantity: 6 },
      { slug: "jacket", quantity: 6 },
      { slug: "work-t-shirt", quantity: 20 },
      { slug: "work-polo", quantity: 10 },
      { slug: "tank-top", quantity: 10 },
      { slug: "cap", quantity: 20 },
    ],
  },
  {
    id: "bundle-164",
    name: "Spring Bundle",
    tier: "Enterprise",
    price: 624900,
    pieces: 164,
    image: "/images/bundles/kit-164.png",
    lines: [
      { slug: "hoodie", quantity: 20 },
      { slug: "vest", quantity: 12 },
      { slug: "jacket", quantity: 12 },
      { slug: "work-t-shirt", quantity: 40 },
      { slug: "work-polo", quantity: 20 },
      { slug: "tank-top", quantity: 20 },
      { slug: "cap", quantity: 40 },
    ],
  },
];

export function getProduct(slug: string): Product | undefined {
  return products.find((p) => p.slug === slug);
}

export function getBundle(id: string): Bundle | undefined {
  return bundles.find((b) => b.id === id);
}

/** Full catalogue value of a bundle at individual item prices. */
export function bundleFullPrice(bundle: Bundle): number {
  return bundle.lines.reduce((sum, line) => {
    const product = getProduct(line.slug);
    return sum + (product ? product.price * line.quantity : 0);
  }, 0);
}

export function bundleSaving(bundle: Bundle): number {
  return bundleFullPrice(bundle) - bundle.price;
}

export function formatAUD(cents: number): string {
  return `A$${(cents / 100).toLocaleString("en-AU", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}

export function bundleContents(bundle: Bundle): string {
  return bundle.lines
    .map((line) => {
      const product = getProduct(line.slug);
      return `${line.quantity} ${product?.name ?? line.slug}`;
    })
    .join(", ");
}

/* -------------------------------------------------------------------------- */
/* Flexible bundle pricing                                                     */
/* -------------------------------------------------------------------------- */

/**
 * Seasonal bundle pricing, made composition-free.
 *
 * The four seasonal packs are priced as a fixed total for a fixed mix. That
 * implies a discount rate per tier: `price / fullPrice` of the preset mix. A
 * customer can now choose any mix of garments and quantities; once the kit
 * reaches a tier's piece count, that tier's rate is applied to the kit's full
 * catalogue value. The preset mix therefore still prices at exactly the
 * published pack price — no new discount is invented, the existing one is
 * simply no longer tied to a forced allocation.
 *
 * Below the smallest tier there is no bundle rate: pieces are charged at
 * individual item prices.
 */
export interface KitEntry {
  slug: string;
  size: string;
  quantity: number;
  colourId?: string;
  /** Product variant; omitted = the product's default variant. */
  variantId?: string;
}

/** Fraction of full price the customer pays at this tier (e.g. 0.9087). */
export function bundlePayRatio(bundle: Bundle): number {
  const full = bundleFullPrice(bundle);
  return full > 0 ? bundle.price / full : 1;
}

/** Discount the tier gives, as a whole-number percentage for display. */
export function bundleDiscountPercent(bundle: Bundle): number {
  return Math.round((1 - bundlePayRatio(bundle)) * 1000) / 10;
}

/** Bundles in ascending order of their piece-count threshold. */
export function bundleTiers(): Bundle[] {
  return [...bundles].sort((a, b) => a.pieces - b.pieces);
}

/**
 * The best tier a kit of `pieces` qualifies for, or null below the first.
 * "Best" means the lowest pay ratio among every tier whose threshold is met,
 * so adding pieces can never make the rate worse (the published Pro Kit pack
 * works out slightly dearer per dollar than the Team Kit pack).
 */
export function tierForPieces(pieces: number): Bundle | null {
  let found: Bundle | null = null;
  for (const tier of bundleTiers()) {
    if (pieces < tier.pieces) continue;
    if (!found || bundlePayRatio(tier) <= bundlePayRatio(found)) found = tier;
  }
  return found;
}

/** The next threshold above `pieces` that would actually improve the rate. */
export function nextTierAfter(pieces: number): Bundle | null {
  const current = tierForPieces(pieces);
  const currentRatio = current ? bundlePayRatio(current) : 1;
  return (
    bundleTiers().find((t) => t.pieces > pieces && bundlePayRatio(t) < currentRatio) ?? null
  );
}

export interface KitPrice {
  pieces: number;
  /** Sum of individual item prices. */
  fullPrice: number;
  tier: Bundle | null;
  nextTier: Bundle | null;
  /** Amount taken off the full price by the tier rate. */
  saving: number;
  /** What the customer pays for the kit. */
  total: number;
}

export function priceKit(entries: KitEntry[]): KitPrice {
  let pieces = 0;
  let fullPrice = 0;
  for (const entry of entries) {
    const product = getProduct(entry.slug);
    if (!product || entry.quantity <= 0) continue;
    const variant = getVariant(product, entry.variantId);
    if (!variant) continue;
    pieces += entry.quantity;
    fullPrice += variant.price * entry.quantity;
  }
  const tier = tierForPieces(pieces);
  const total = tier ? Math.round(fullPrice * bundlePayRatio(tier)) : fullPrice;
  return {
    pieces,
    fullPrice,
    tier,
    nextTier: nextTierAfter(pieces),
    saving: fullPrice - total,
    total,
  };
}
