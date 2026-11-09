# TradieForms — pre-launch security audit

**Date:** 28 October 2026  
**Scope:** web app and API in `packages/web` (catalogue, SKU mapping, studio, bundles, fixed placements, embroidery pricing, shipping, cart, checkout, contact and crew-deals forms, shipping quotes, saved designs, admin, supplier production PDFs), auth configuration, logo uploads/object storage, dependencies. Mobile/desktop packages were only checked for shared dependencies and the auth origin they use.  
**Method:** code review of every API route and library, then black-box tests against the running server (`http://localhost:4200`) and the public preview (`https://tradief-i9apr9c-preview-4200.runable.site`) for edge behaviour. Every control marked "fixed" below has a passing automated test; anything not tested is listed in §7.  
**Backup before changes:** `/home/user/backups/tradieforms-pre-security-20261028-2118.zip` (sha256 `32b7948a8676dc474951567e8630d43864e736c3c04804254654543b25eb873d`).

**Status in one line:** no open critical or high finding in the application code. The site is **not launch-ready** until the external items in §5 are done, payments in particular. No claim is made that the site cannot be attacked; this is a point-in-time review of known risk classes.

---

## 1. Critical

### C1 — Admin access granted by an unverified email address (FIXED, tested)
- **Evidence:** `lib/admin.ts` `isAdminEmail(email, verified = true)` was called by `middleware/admin.ts`, `routes/admin.ts` and `production-pdf-download.ts` with the email only, so `verified` was always `true`. Email/password sign-up does not verify email (no mail provider is configured). Anyone could sign up as `ibukunoluw25@gmail.com` *before the owner did*, or as any listed address not yet registered, and get the full order list, every customer's name/phone/address, and the supplier production PDFs.
- **Fix:** `isAdmin(user)` requires `emailVerified === true` **and** a listed email. Accounts signed in through Google/Apple (managed auth) are verified; a typed-in email is not. `admin.status` returns `needsVerification` and the admin page explains it. `isAdminEmail` is removed (no callers left).
- **Tests:** `sec.py admin` 9/9 — listed but unverified email → `admin:false`, `needsVerification:true`, 403 on `admin.orders` and on the production PDF; the same account after verification → admin, order list, PDF and token-less order read all work.
- **Owner impact:** `buildwithisrael25@gmail.com` is an email/password account with `email_verified = 0`, so it is **no longer admin** until it signs in once with Google (same email; accounts link). `ibukunoluw25@gmail.com` is verified and keeps admin.

## 2. High

### H1 — Order details readable by anyone who guesses a reference (IDOR) (FIXED, tested)
- **Evidence:** references were `TF-` + 6 timestamp chars + 3 `Math.random()` chars (≈46k combinations per second of creation, and predictable). `orders.get`, `orders.refreshPayment` and `orders.startPayment` were public and needed only the reference, returning name, email, phone and delivery address. Shipping-quote references (`SQ-`) used the same generator.
- **Fix:** `lib/order-access.ts` — references are `TF-`/`SQ-` + 10 Crockford base32 characters from `crypto` (50 bits); each order gets a 256-bit `accessToken` (new column `orders.access_token`) returned once at creation. `get`/`refreshPayment`/`startPayment` require the token (constant-time compare), **or** the signed-in owner, **or** a verified admin; otherwise NOT_FOUND (no existence oracle). Responses go through `publicOrder()`, which removes `accessToken` and `paymentRef`. The checkout success link and the eWAY `RedirectUrl`/`CancelUrl` carry `&t=<token>` (Stripe was replaced by eWAY in session 18; see §10).
- **Tests:** `sec.py main` — reference format; `get` without token / wrong token → 404, with token → 200; `refreshPayment` and `startPayment` without token → 404; user B cannot read user A's order; `listMine` scoped and token-free; unknown reference 404. Browser suites confirm the success page loads with the token (`/checkout/success?ref=TF-…&t=…`).
- **Behaviour change:** old `?ref=` links without `t` only open for the signed-in owner or an admin.

### H2 — Logo uploads: no real size limit, no content check, SVG script injection (FIXED, tested)
- **Evidence:** `upload.presign` accepted an optional size that was not part of the signature, and signed only the key; the browser could PUT any size and any `Content-Type` (e.g. `text/html`). Nothing checked the bytes. SVGs with `<script>`/`onload` were stored and served from a signed URL, i.e. stored XSS on the storage origin, and SVG/HTML could be passed to suppliers.
- **Fix:** `routes/upload.ts`, `lib/logo-sniff.ts` — size is required (≤ 5 MB) and `Content-Length` + `Content-Type` are signed, so storage refuses a different size or type. Keys are `logos/<96-bit random hex>-<sanitised name>`. New `upload.verify` (called by the studio right after the PUT) reads the object back, checks the real size and the magic bytes against the declared type (PNG/JPEG/WEBP); SVG is parsed as text and rejected if it contains `<script`, `on*=` handlers, `javascript:`, `foreignObject`, `<!ENTITY`, `iframe/embed/object`, or external `href`/`url()`/`@import`. Failures are deleted from storage. Per-IP limits on presign/verify.
- **Tests:** `sec.py main` — size required; > 5 MB rejected; `text/html`, `image/gif`, `application/pdf`, `image/svg` rejected; path traversal in filename sanitised; PUT larger than declared → refused by storage; PUT with other content-type → refused; real PNG accepted; HTML disguised as PNG rejected **and deleted (404)**; SVG with `onload` and with `<script>` rejected; clean SVG accepted. Studio browser suite (r8/studio, 28/28) uploads a logo through presign → PUT → verify.

### H3 — `upload.signGet` would sign a read URL for any key in the bucket (FIXED, tested)
- **Evidence:** input was `z.string().min(1)`, expiry 12 h. Any visitor could request signed URLs for any object key, including other prefixes.
- **Fix:** `lib/logo-key.ts` — keys must match `^logos/[A-Za-z0-9][A-Za-z0-9._-]{0,180}$` (no `/`, no `..`), the same validator is used on cart lines and saved designs; expiry 2 h; rate limited.
- **Tests:** `uploads/qa/logo.png`, `logos/../x`, `logos/a/b.png`, `../logos/x.png`, empty, and a URL all rejected; valid key works; expiry ≤ 7200 s; cart lines and designs reject non-`logos/` and `../` keys.

### H4 — Cross-site request forgery: auth trusted every origin (FIXED, tested)
- **Evidence:** `auth.ts` had `trustedOrigins: (req) => origin ? [origin] : ["*"]`, which disables Better Auth's origin/CSRF check. The template CORS layer (`__core/app.ts`, not editable) reflects any `Origin` with `Access-Control-Allow-Credentials: true`.
- **Fix:**
  - `auth.ts` `trustedOrigins` = `WEBSITE_URL`, `http://localhost:4200`, `https://tradieforms.com`, `https://www.tradieforms.com`, the mobile scheme `runable-tradief-i9apr9c://`, optional `TRUSTED_ORIGINS` env, plus the request's own host.
  - `lib/security-headers.ts` `originGuard` on every non-GET `/api/*` request: a foreign `Origin` or `Origin: null` → 403. Requests with no `Origin` (mobile app, server-to-server) go through to normal auth.
  - `corsAllowList`: responses to an untrusted `Origin` have all CORS grant headers removed, so other sites cannot read API responses (session details, orders, PDFs) with a visitor's cookies, and their preflights fail.
  - Session cookie (live check on the preview): `__Secure-better-auth.session_token; HttpOnly; Secure; SameSite=Lax`.
- **Tests:** foreign Origin → 403 on RPC and on auth (also verified live on the preview); own Origin → 200; `Origin: null` → 403; GET `get-session` and preflight from a foreign Origin carry no CORS grant; own origin and mobile scheme keep it. RPC procedures are not callable via GET (405).

### H5 — No rate limiting on sign-in/sign-up or most public endpoints; spoofable IP (FIXED, tested)
- **Evidence:** Better Auth rate limiting was not enabled. Only the contact/crew-deals forms had a limiter, keyed on the left-most `x-forwarded-for` (client-controlled), so rotating that header bypassed it.
- **Fix:** Better Auth `rateLimit` (global 120/min; sign-in 10/min; sign-up 10/10 min; managed exchange 20/min; change-password 5/10 min) with IP from `cf-connecting-ip`/`x-real-ip` only. `lib/rate-limit.ts` limits per IP for contact, crew-deals, shipping quotes (5/10 min), order create (20/10 min), payment start (30/10 min), order read, quotes, logo upload/sign and PDFs.
- **Tests:** sign-in brute force → 429 after 10/min (local and live preview); contact and crew-deals 6th submission → 429. **Live spoofing check on the preview:** rotating `x-forwarded-for` + `x-real-ip` per request still hit 429 on sign-in (after 10) and on contact (after 5); a client-supplied `cf-connecting-ip` is rejected by Cloudflare itself (error 1000).

### H6 — Hono CORS/high advisories in the server framework (FIXED by upgrade)
- **Evidence:** `bun audit` flagged hono 4.12.10 (high, incl. CORS handling) and zod 4.3.6.
- **Fix:** hono `~4.12.34`, zod `^4.6.7`, enforced with root `overrides`; `bun.lock` resolves only those versions. Remaining hono 4.12.34 advisories are moderate and in APIs this app does not use (`toSSG`, `parseBody` dot-notation, `hono/jsx`, `serveStatic`, query-after-fragment) — `rg` finds no use of any of them.
- **Tests:** typecheck clean; all regression suites pass after the upgrade (§6).

## 3. Medium / low

| ID | Severity | Finding | Evidence | Fix / status | Test |
|---|---|---|---|---|---|
| M1 | Medium | Payment-provider errors returned to the browser | `startPayment` passed the payment provider's response text to the client | Logged server-side; client gets a generic message. `startPayment` refuses already-paid orders; `refreshPayment` only moves unpaid → paid after the provider (now eWAY) confirms server-side | `sec.py admin`: generic message with an invalid key; `refreshPayment cannot set paid` |
| M2 | Medium | Header/email injection via CR/LF in names | contact, crew-deals, shipping-quote name/company fields went into email subjects | `singleLine()` strips control characters incl. CR/LF | `sec.py`: payloads stored as plain text, CR/LF stripped |
| M3 | Medium | No security headers on API responses | none set | `/api/*`: `nosniff`, `X-Frame-Options: DENY`, CSP `default-src 'none'; frame-ancestors 'none'`, `Referrer-Policy`, CORP `same-site`, `Cache-Control: no-store` | `sec.py` header checks; live preview shows them |
| M4 | Medium | **Page** responses (HTML/JS/images) have no CSP, HSTS, frame-ancestors or nosniff | live preview `GET /` returns none of them; the template server serves `dist` directly and its file is not editable | **Open — set at the edge (§5).** HTTP → HTTPS 301 already happens on the preview | header check only |
| M5 | Medium | Client price/total tampering | — | Not vulnerable: the server re-prices every line from the catalogue (unit price, embroidery fee, bundle minimums, shipping) and ignores client totals; status/payment fields are not accepted | `sec.py`: price fields ignored, qty 0/-1/1000/1.5 rejected, unknown product/variant/colour/size rejected, embroidery fee recomputed, server totals, status not settable |
| M6 | Medium | Supplier SKU/cost data exposure | — | Not exposed: catalogue, quote, order and success responses contain no supplier code/cost fields | `sec.py`: catalogue and order responses checked |
| M7 | Low | Rate limits are in-memory | `lib/rate-limit.ts`, Better Auth memory store | Reset on restart, not shared across instances (pm2 runs one). Fine for launch; move to a shared store if scaled out | — |
| M8 | Low | Bearer session token kept in `localStorage` by the managed-auth client | package design (`@runablehq/managed-auth`) | Not changed. Any XSS would expose it, so the page CSP (M4) matters | — |
| M9 | Low | Better Auth 1.6.19 advisories (1 critical, 3 high) | `bun audit` | **Not exploitable here:** they need the Magic Link, email-OTP, OAuth Proxy or device-authorization plugins, none of which are configured (`auth.ts` plugins: managed auth, account link, expo). Upgrade to ≥ 1.7.7 when the managed-auth package supports it | plugin list reviewed |
| M10 | Low | oRPC 1.14.7 CORS plugin reflects request `Vary` | `bun audit` | Only matters behind a cache keyed on `Vary`; patch to 1.14.8 in the next dependency pass | — |
| M11 | Low | Production PDF fetches site images via the request origin if not on disk | `production-pdf.ts` `siteAsset` fallback | Admin-only, fixed path list, disk first; acceptable | — |
| M12 | Low | Supplier PDF embeds a 7-day signed link to the original logo | by design | Anyone the PDF is forwarded to can download the logo for 7 days | — |
| M13 | Low | Saved designs: long strings / unbounded reorder arrays | — | Max lengths on slug/colour/size; `reorder` ids int, ≤ 200 | `sec.py` cross-user design tests |

**Dependency audit (`bun audit`, whole monorepo):** 253 (5 critical, 109 high, 112 moderate, 27 low) before → 225 (5 critical, 107 high, 88 moderate, 25 low) after. Full output: `review/s5/audit-post.txt` (scratch, not shipped). The remaining criticals are better-auth (M9, not applicable), and `shell-quote`, `tar`, `tinypool` in mobile/dev/build tooling that does not run in the web server. Most remaining highs are in Expo/React Native, Electron, Vite dev server and jsdom (test tooling). In the web runtime: `sharp` (libvips advisories) only processes the site's own garment photos, never customer uploads; `@aws-sdk` → `fast-xml-parser` (moderate, XML *builder* only). A routine dependency update is still recommended (§8).

## 4. Not applicable

- **SQL injection:** all queries use Drizzle's parameterised builder; no raw SQL with user input. Tested: SQLi payloads stored as plain text, `orders` table intact.
- **Magic link / email OTP / OAuth proxy / device login:** not enabled (see M9).
- **Payment webhook forgery:** there is no webhook endpoint; payment state is pulled from eWAY by `refreshPayment` (`GET /AccessCode/{code}`) with the server's API key and password. The browser's return parameters are only a hint of which code to check.
- **Card data:** never touches this server (hosted provider checkout). PCI scope is the provider's.
- **Server-side rendering XSS:** the site is a client-rendered React app; user text is rendered as text, never as HTML.

## 5. External configuration needed before launch

1. **Payments:** eWAY (Responsive Shared Page) is integrated and tested against the eWAY **sandbox** only (§10). Before launch: put the live key pair in `EWAY_API_KEY`/`EWAY_PASSWORD`, set `EWAY_ENVIRONMENT=production`, set `WEBSITE_URL` to the public domain, and place one small real order.
2. **Email (SMTP/Resend):** not configured — contact form returns 503 and quote/order notifications are not sent. Add credentials, then re-test the forms and the CR/LF protection on real emails.
3. **Edge headers (Cloudflare or host) for page responses:** `Strict-Transport-Security: max-age=31536000; includeSubDomains`, `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `frame-ancestors`/`X-Frame-Options`, and a CSP. A CSP must allow the managed-auth sign-in popup, analytics (`r.lilstts.com`, `collector.onedollarstats.com`), object storage (`*.t3.storage.dev`) and the payment provider. Roll it out in report-only mode first. Keep "Always use HTTPS" on.
4. **Admin accounts:** sign in once with Google as `buildwithisrael25@gmail.com` to get admin back (C1). Keep `ADMIN_EMAILS` to people who sign in with Google/Apple. There is **no MFA** for admins beyond what Google/Apple provide.
5. **Secrets:** if the `.env` file was ever shared, emailed or committed anywhere, rotate `BETTER_AUTH_SECRET`, the database token, storage keys and any API keys. Set `TRUSTED_ORIGINS` only if another front-end domain needs access (it is in `.env.template`, empty).
6. **Object storage:** confirm the bucket is private (no public listing/reads) and add a lifecycle rule for abandoned `logos/` uploads if wanted. Uploads are type-checked but **not malware-scanned**.
7. **Source control:** the project has no git repository (`fatal: not a git repository`), so commit history could not be checked for leaked secrets. Put it in a private repo with `.env` ignored.
8. **Monitoring/backups:** turn on database backups (Turso) and error/uptime monitoring.

## 6. Tests passed

All against the dev server on port 4200 unless marked "live" (public preview through Cloudflare).

| Suite | Result | Covers |
|---|---|---|
| `sec.py main` (security) | 90/90 | API headers; CSRF/origin incl. `Origin: null`; CORS grants only for trusted origins; price/qty/variant/colour/size/embroidery tampering; status not settable; supplier fields hidden; order token/IDOR on get/refresh/startPayment; cross-user orders and designs; admin + PDF 401/403; upload size/type/magic bytes/SVG/keys/deletion; XSS/SQLi as plain text; CR/LF stripped; honeypot; too-fast; contact, crew-deals, sign-in 429 |
| `sec.py admin` | 9/9 | Unverified listed email denied; verified admin works; generic payment error |
| `s4/new.py` (shipping quotes, new garments, admin quotes) | 31/31 | regression |
| `s3/flow.py` (cart → checkout → success, zone override) | 38/38 | regression; success page with token |
| `r8/studio.py` (studio, logo upload, placements, saved kit) | 28/28 | regression; browser logo upload via verify |
| `r8/bundle.py` (bundles) | 52/52 | regression |
| `s3/mobile.py` (small-screen cart/checkout) | 6/6 | regression |
| `r7/audit.py` (layout overflow audit) | 0 flagged | regression |
| `s3/api.py` (API contract) | 40/40 | regression after the dependency upgrade |
| Live: origin checks | pass | foreign Origin 403 on RPC and auth; own Origin passes; foreign-Origin `get-session` carries no CORS grant |
| Live: rate limits with spoofed IP headers | pass | sign-in 429 after 10, contact 429 after 5 despite rotating `x-forwarded-for`/`x-real-ip`; client `cf-connecting-ip` rejected by Cloudflare |
| Live: session cookie flags | pass | `__Secure-`, `HttpOnly`, `Secure`, `SameSite=Lax` |
| Typecheck / lint / build | pass | `tsc --noEmit` clean, `bun run lint` 0 errors, `bun run build` succeeds |
| Secrets scan of shipped source | pass | no `.env` values, `sk_live`, AWS keys or private keys outside `.env` |

## 7. Tests failed or not performed

- **Failed and fixed during the audit:**
  - The new mobile-scheme CORS test failed and exposed a real bug in this audit's own change: trailing-slash normalisation turned `runable-tradief-i9apr9c://` into `runable-tradief-i9apr9c:`, so the app scheme was not in the trusted list. Fixed (only `http(s)` origins are normalised); test passes.
  - One `sec.py` check was a false positive (it matched `"source":"supplier"`, an image-source label); the regex was corrected. "Rejected upload deleted" failed once because a deleted object was briefly still readable from storage; the test now allows a few seconds and passes (direct check: 404 immediately after delete).
  - Final runs: `s3/flow.py` 38/38 after the CORS narrowing; `sec.py main` 90/90 after the scheme fix (the last code change), plus typecheck, lint and build.
- **Not performed:**
  - Live payments — eWAY was tested in the sandbox only (§10). Refunds are not implemented in the site (done in MYeWAY).
  - Real email delivery (no SMTP) — header injection was tested on stored data, not on sent mail.
  - Google/Apple sign-in end-to-end (needs a real account interactively); account linking was reviewed, not re-tested.
  - Load/DoS testing, and multi-instance behaviour of the rate limits.
  - Malware scanning of uploads (none implemented).
  - Mobile and desktop apps beyond the shared API checks.
  - Third-party penetration test.
  - Git history secret scan (no repository).

## 8. Remaining risks and next steps

1. Do §5 items 1–3 before taking real orders; re-run `sec.py` and the flow suites afterwards.
2. Add the page CSP at the edge (report-only first), then enforce. It is the main defence for the `localStorage` token (M8).
3. Dependency pass: better-auth ≥ 1.7.7 (with a compatible managed-auth), hono ≥ 4.13.11, `@orpc/*` ≥ 1.14.8, then re-run every suite.
4. If the site runs on more than one instance, move rate limits to a shared store.
5. Consider admin MFA and an audit log for admin order views/PDF downloads.
6. Re-audit after any new feature that takes user input or files.

Test scripts used (not shipped; kept in `/home/user/review`): `s5/sec.py`, `s4/new.py`, `s3/flow.py`, `s3/api.py`, `s3/mobile.py`, `r8/studio.py`, `r8/bundle.py`, `r7/audit.py`. Test data created during the audit was removed from the database afterwards; a few test logo files remain under `logos/` in storage.

## 9. Addendum: Hostinger (Node.js) deployment

A Node.js build for Hostinger Business "Web App" hosting has been added: `packages/web/scripts/node-server.ts`, bundled by `scripts/build-hostinger.ts`. Deployment steps are in `scripts/README-HOSTINGER.md`. Security points:

- **Page headers:** `node-server.ts` sets `X-Content-Type-Options: nosniff`, `Referrer-Policy: strict-origin-when-cross-origin`, `X-Frame-Options: SAMEORIGIN`, and a restrictive `Permissions-Policy` on pages. It also sends HSTS when the request arrived over HTTPS. §5 item 3 is therefore partly covered on Hostinger. A CSP is still not set.
- **Client IP for rate limits:** `CLIENT_IP_SOURCE` controls where the client IP comes from:
  - `forwarded` (the default) takes the right-most `X-Forwarded-For` entry.
  - `cloudflare` trusts `CF-Connecting-IP`. Use it only when the domain is proxied by Cloudflare.
  - `socket` uses the socket address.

  In every mode, client-supplied `x-real-ip` is overwritten, and `cf-connecting-ip` is dropped unless the mode is `cloudflare`. Behaviour behind Hostinger's own proxy has **not been verified**.
- **Static files:** files are served only from `dist/`. `../` and encoded traversal attempts return the SPA page, never other files. `.env` is never included in the package. If it is placed next to `server.mjs`, it sits outside `dist/` and is not served.
- **Startup:** the server refuses to start without `DATABASE_URL`, `BETTER_AUTH_SECRET` and `WEBSITE_URL`.
- **Tested under Node 22.23** from the unzipped package with `npm install` and `npm start`. Results: `sec.py main` 90/90, `sec.py admin` 9/9, `s3/api.py` 40/40, `s3/flow.py` 38/38 (including admin PDFs), `r8/studio.py` 28/28 and `r8/bundle.py` 52/52.
- **Not tested:** managed Google/Apple sign-in on a non-Runable domain.

## 10. Addendum: eWAY card payments (session 18, replaces Stripe)

Stripe Checkout was removed. Payments now use the **eWAY Rapid API Responsive Shared Page**: `src/api/lib/eway.ts` (gateway client) and `src/api/lib/order-payment.ts` (order logic).

- **Credentials:** `EWAY_API_KEY`, `EWAY_PASSWORD` and `EWAY_ENVIRONMENT` (`sandbox` | `production`) live only in the root `.env` / hPanel. They are read only on the server, sent only as an HTTP Basic header to eWAY, and never logged or returned. A secrets scan of the built `dist/` and the Hostinger package finds none of them. The Client Side Encryption key is not used, because cards are typed on eWAY's own page and never touch this server.
- **Order validation:** `orders.create` re-prices every line on the server. This includes the polo fabric/colour rule (`assertColourOffered`). The eWAY amount is always the server's stored `orders.total`, never a browser value.
- **Verification:** an order becomes `paid` only after the server calls `GET /AccessCode/{code}` itself and eWAY reports `TransactionStatus: true`, with an amount equal to the order total and an `InvoiceNumber` equal to the order reference. The code must also be one that this server issued for this order (`orders.payment_attempts`). The return URL's `AccessCode` is only a hint of which code to check.
  - The update is conditional (`where payment_status = 'unpaid'`), so concurrent refreshes cannot double-process an order, and the paid notification is sent once.
  - A paid order is never downgraded.
- **No duplicate payments:**
  - `startPayment` returns `paid` without opening a new page when the order is already paid, or when an earlier attempt has since been approved.
  - Attempts are capped at 8.
- **No duplicate orders:** the checkout sends a per-cart `checkoutKey` (unique column). A repeated submit returns the same order (`reused`). The same key with different contents is refused (409).
- **Errors:** gateway failures are logged as status plus eWAY error codes only. The browser gets "We couldn't start the card payment…". Declines show eWAY's reason in words, for example D4406 → "The card was declined — check the card number, expiry and CVN, or try another card."
- **Access:** `startPayment`, `refreshPayment` and `paymentStatus` need the order token, the signed-in owner or an admin (H1 unchanged). Wrong token → 404. `publicOrder()` also strips `paymentAttempts` and `checkoutKey`. There is a separate rate limit, `order-payment-check`.

**Tests against the real eWAY sandbox** (session 18):

| Suite | Result | Covers |
|---|---|---|
| `s6/pay.py` | 25/25 | Approved payment → paid, transaction id stored and shown; repeat refresh idempotent; `startPayment` on a paid order opens nothing; real decline (D4406, expired card) → unpaid, reason shown, retry opens a second attempt; foreign approved code, garbage code, malformed code and wrong token cannot mark an order paid; cancel → cancelled, unpaid; duplicate submit → same order, conflicting duplicate → 409, one DB row |
| `sec.py admin` | 10/10 | Rewritten for eWAY. With an invalid `EWAY_PASSWORD` (eWAY 401), `startPayment` returns 500 with the generic message and no key, password or provider text, and the order stays unpaid with no access code |
| `s3/flow.py`, `r8/studio.py`, `r8/bundle.py` | 38/38, 28/28, 52/52 | The full browser checkout now pays on the eWAY sandbox page with the test card, then the success page verifies the payment server-side |

**Not tested:** live (production) credentials and a real card, refunds (done in MYeWAY, not in the site), paid-order email delivery (dev has no SMTP; the code path logs "mailer not configured"), and the eWAY return to a custom domain (tested on the Runable preview URL only).

The sandbox account approves every amount, so the "cents" decline rule did not apply. Declines were produced with an expired card.
