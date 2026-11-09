# TradieForms — Design System

Premium Australian workwear showroom. Industrial, editorial, high-contrast. Built on the
existing TradieForms identity (navy + safety yellow + orange) — never a generic luxury
fashion store.

## 1. Brand foundation

| Token | Value | Use |
|---|---|---|
| `--tf-navy` | `#0B2A5B` | Primary brand surface, header, hero stage |
| `--tf-navy-deep` | `#06152E` | Hero void, footer, deepest depth layer |
| `--tf-navy-mid` | `#123B78` | Raised navy panels, orbit rim light |
| `--tf-yellow` | `#FFC72C` | Brand highlight, eyebrows, underlines, focus ring |
| `--tf-orange` | `#F26B21` | Primary action / CTA only. Never decorative |
| `--tf-paper` | `#F6F4EF` | Light section background (warm off-white, not pure white) |
| `--tf-white` | `#FFFFFF` | Cards, product stages |
| `--tf-steel` | `#5C6572` | Body text on light, secondary labels |
| `--tf-ink` | `#12151A` | Headings on light surfaces |
| `--tf-line` | `#E2DFD7` | Hairlines, dividers, card borders |

Accents carry meaning: **orange = act**, **yellow = brand/label**, **navy = ground**.
No gradients-as-decoration, no glow, no glassmorphism. Depth comes from perspective,
shadow and scale.

## 2. Typography

Self-hosted in `packages/web/public/fonts/`.

- **Display — Archivo** (`archivo-latin.woff2`, variable 100–900). Headlines, prices,
  section titles. Weights 700–900. Tracking `-0.02em` to `-0.035em`. Sentence case for
  statements, UPPERCASE + `0.16em` tracking for eyebrows/labels.
- **Body — Barlow** (400/500/600/700). Paragraphs, UI, forms. Line height 1.55–1.7.

Scale (clamp, mobile → desktop):

| Role | Size |
|---|---|
| Hero statement | `clamp(2.6rem, 8.4vw, 7.6rem)` |
| Section title | `clamp(1.9rem, 4.6vw, 3.6rem)` |
| Card title | `1.05rem`–`1.5rem` |
| Body | `0.95rem`–`1.06rem` |
| Eyebrow / label | `0.7rem`–`0.78rem`, uppercase, `0.16em` |

## 3. Spacing & layout

- 4px base scale. Section rhythm `clamp(4.5rem, 9vw, 9rem)` vertical.
- Shell: `max-width: 1320px`, gutter `clamp(1.1rem, 4vw, 3rem)`.
- Asymmetric and grid-breaking on purpose: 7/5 splits, images bleeding off the grid,
  overlapping typography over imagery. Avoid centred symmetric stacks and endless
  identical rounded cards.
- Corner radius is **restrained**: `2px` on cards/panels, `999px` only on pills/chips.
  Sharp industrial edges over soft blobs.

## 4. Depth & surfaces

- Product imagery sits on **white stages** (cards) or directly on the navy stage.
- Shadows are directional and low-spread: `0 18px 40px -24px rgba(6,21,46,.45)`.
- Hairline borders (`--tf-line`) instead of heavy fills.
- One restrained texture: a fine diagonal hatch / dot grid at 4–6% opacity on navy
  surfaces for industrial grit.

## 5. Motion

- **Hero**: GSAP + ScrollTrigger, one pinned, scroll-scrubbed timeline. Card orbit is a
  genuine CSS 3D orbit (`perspective` + `rotateY` + depth scale/opacity/z-index) driven
  by scroll progress, not a free-running timer.
- **Sections**: CSS transitions and IntersectionObserver reveals — staggered, once only.
- Durations 260–520ms, easing `cubic-bezier(.22,.61,.36,1)`.
- `prefers-reduced-motion: reduce` — orbit holds a static hero composition, reveals are
  instant, no pinning. Content is never hidden behind animation.

## 6. Components

- **Header**: navy, hairline bottom border, logo left, nav centre-right, cart + account
  right. Sticky. Mobile: drawer.
- **Buttons**: `btn-primary` orange, `btn-secondary` outlined navy, `btn-ghost` text.
  Square-ish (2px), uppercase-ish label weight 600, generous padding.
- **Product card**: white stage, cutout garment large and centred, name + price row,
  colour chips, "Customise" action.
- **Customiser studio**: left large garment stage, right 4-step wizard
  (Colour → Front → Back → Review) with a step rail, colour chips, logo upload and
  drag/scale/rotate handles, save + add to kit.
- **Orbit card**: white stage, garment cutout, small label strip at the bottom.
- **Bundle card**: kit photo, piece count badge, contents line, price + saving.
- **Forms**: labelled inputs, navy focus ring, inline validation errors in orange.

## 7. Accessibility

- Contrast: navy on paper, white on navy — all ≥ 4.5:1 for body copy.
- Every icon-only control has an `aria-label`; wizard steps are real buttons with
  `aria-current`; drag handles are keyboard-nudgeable via arrow keys and expose sliders.
- Focus visible everywhere (`--tf-yellow` ring on navy, navy ring on light).
- Animation never gates content; reduced-motion path is a first-class layout.
