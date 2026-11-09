# TradieForms: Import and Verification Report

**Date:** 4 November 2026
**Preview URL:** https://tradief-ahy55rn-preview-4200.runable.site
**Project path:** `/home/user/tradieforms`

## 1. What was imported

I extracted both ZIP parts (294 + 26 files) and merged them into one tree. The project was already built on the Runable template (v0.8.0): Bun + Turborepo monorepo, Vite 7 + React 19 + Wouter + Tailwind 4 frontend, and a Hono + oRPC API on the same port. It uses Drizzle ORM on Turso/libSQL, Better Auth with Runable managed auth (Google/Apple) plus email/password, S3-compatible storage (Tigris) for logos, nodemailer SMTP with a Resend fallback, the eWAY Rapid API Responsive Shared Page, and pdf-lib for the supplier production sheets.

I created a new Runable app so this account has its own database, storage bucket, auth application ID and secrets. Then I copied the whole original source over it unchanged. The only files kept from the new app are the ones tied to this account:

| File | Reason |
|---|---|
| `.env` | New database, storage, auth and gateway credentials for this account |
| `packages/mobile/app.json`, `packages/mobile/.env` | New application ID, API URL and deep-link scheme |
| `.runable/ports.json`, `.template-version` | Created by the platform; the ports are the same (4200/4300/4400) |

All template-managed `__*` files were byte-for-byte identical between the original and the new app.

**One source edit:** in `packages/web/src/api/auth.ts`, I added the new mobile scheme `runable-tradief-ahy55rn://` to the trusted origins. The old scheme is still there. Nothing else was changed: no UI, business logic or design files.

The Bun runtime is supported natively, so no adaptation was needed. Production runs `packages/web/src/__server.ts` (`Bun.serve`) under pm2. The Hostinger/Node build scripts were also kept, unchanged.

## 2. Setup

- `bun install`: OK (the original `bun.lock` and the hono/zod overrides were kept)
- `db:push`: all tables created in the new Turso database
- `bun run lint`: 0 errors
- `bun run build`: typecheck and Vite build succeed, and all images are optimised
- Dev server is running on 4200. I also ran the production server (`__server.ts`) separately on a temporary port and it served the pages and the API.

## 3. Environment variables

| Variable | Status |
|---|---|
| DATABASE_URL, DATABASE_AUTH_TOKEN | Set (new database) |
| S3_ENDPOINT, S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY | Set (new bucket) |
| BETTER_AUTH_SECRET, APPLICATION_ID, VITE_APPLICATION_ID, VITE_RUNABLE_AUTH_ISSUER, WEBSITE_URL | Set |
| SMTP_HOST, SMTP_PORT, EMAIL_TO, EWAY_ENVIRONMENT | Set to the project's documented defaults (smtp.hostinger.com, 465, info@tradieforms.com, sandbox) |
| **SMTP_USER, SMTP_PASS** (or RESEND_API_KEY) | **Missing.** Needed for contact form, crew-deals and shipping-quote emails |
| **EWAY_API_KEY, EWAY_PASSWORD** | **Missing.** Needed to take card payments |
| **ADMIN_EMAILS** | **Missing.** Needed for /admin/orders and the supplier PDFs. Must be Google/Apple-verified emails |
| EMAIL_FROM, TRUSTED_ORIGINS | Optional, left empty |

## 4. Tests performed

### API tests (against the HTTPS preview)

27 of 29 passed on the first run. Both failures came from my test inputs, not the app, and both passed once the inputs were corrected.

- **Catalogue:** 8 products and 4 bundles load, and single-product lookup works.
- **Cart pricing:** 10 T-shirts come to A$399.90.
  - Postcode 2000 is detected as metro: 5.6 kg, A$30 shipping, A$429.90 total.
  - Postcode 2880 is detected as regional: A$50 shipping.
  - These figures match an independent calculation from the shipping band table.
- **Bundles:** the 39-piece bundle prices at A$1,499 and the unweighed caps are flagged for shipping review. A quantity of 0 is rejected.
- **Embroidery:** a fee of A$16 per garment is applied on the server.
- **Logo upload:** presign, PUT to storage, verify, then signed read returns identical bytes, so uploads persist. An HTML file disguised as a PNG is rejected and deleted.
- **Auth and saved designs:** email sign-up and session work. Saving and listing designs works and requires sign-in.
- **Orders:**
  - Creating an order produces a `TF-` reference.
  - Reading the order works with the access token and returns 404 without it.
  - The customer's own order list works.
  - Starting payment reports that eWAY is not configured, as designed.
- **Shipping quote request** (over 30 kg): an `SQ-` reference is created.
- **Contact form:** the message is saved with `delivery_status=failed`. The server returns 503 "email service isn't set up", as designed when no email credentials are set.
- **Admin:** admin pages and the PDF are refused for non-admins. A foreign Origin is blocked with 403.

### Browser tests (Chrome, desktop 1440 px and mobile 390 px)

- **13 pages each:**
  - Pages: home, about, shop, two product pages, bundle deals, design studio, contact, login, account, cart, checkout, admin.
  - Results: all returned 200, with 0 broken images, 0 console errors and no horizontal overflow at either size.
- **Full purchase flow, signed in:**
  1. Studio: picked the polo and a colour and size, then uploaded a logo.
  2. Placed it on the left chest with embroidery and checked the back view.
  3. Review showed A$39.99 + A$16 = A$55.99.
  4. Saved the design to the account, then added it to the cart.
  5. Cart shows the line and its totals.
  6. Checkout calculates metro shipping and places the order.
  7. The success page shows "Order saved, not paid yet", which is the payment stage.
- **Saved design reuse:** the account page lists the saved design and the order. "Reopen" loads the product, colour, size, logo and placement back into the studio.

### Admin and production PDF (production server)

- A verified admin account sees `admin.status = admin:true` and the list of orders.
- The production PDF downloads (336 KB). It contains the order, customer, decoration, weight and total, plus the "NOT APPROVED — unpaid" banner.

**Cleanup:** I deleted every QA record afterwards (users, orders, designs, messages, quotes), so the database is empty.

## 5. Not tested / open items

- **eWAY payment:** not tested beyond the "not configured" stage, because there are no keys. After adding them, place a sandbox payment. Live payments were never tested in the original project either.
- **Email delivery:** not tested, because there are no credentials.
- **Google/Apple sign-in:** a real Google account is needed. The managed auth is configured with the new application ID.
- **Previous production data:** existing customer accounts, orders, saved designs and uploaded logos lived in the old project's database and bucket. They were not in the ZIP and have not been migrated. The new database starts empty.
- **Custom domain:** `tradieforms.com` is still in the trusted origins. After you publish and connect the domain, update `WEBSITE_URL` to it, because eWAY redirects to `WEBSITE_URL/checkout/success`.
- **Preview proxy and 503s:** through the preview URL, the contact form's 503 reached the client as a 502 proxy error page. The message is still saved. This should go away once email is configured.
