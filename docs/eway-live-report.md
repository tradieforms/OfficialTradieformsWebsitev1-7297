# eWAY LIVE Verification: Tradie Forms

Date: 2026-11-08 · App: `tradief-ahy55rn` · Integration: eWAY Rapid API, Responsive Shared Page (unchanged)

**Result: LIVE CONFIGURED and LIVE API VERIFIED.** The app authenticates against eWAY's production API and opens real LIVE hosted payment pages showing the correct order total.
The full live payment flow (a real approved card transaction) has **not** been run. That needs your authorisation.
No charge was made at any point. No card was ever submitted.

History of this check:
1. On the first run, `EWAY_ENVIRONMENT=Live` silently resolved to sandbox (a code bug, now fixed), and `EWAY_API_KEY` held the `epk-` Public API Key.
2. On the second run, the key was correct but `EWAY_PASSWORD` was the masked `******`.
3. On the third run, with both secrets updated, authentication passes.

---

## A. LIVE Secrets Verification

| Item | Result |
|---|---|
| Required API key (`EWAY_API_KEY`) | **Present.** It is in the Rapid API Key format (70 characters) and is accessible to the server runtime. |
| Required API password (`EWAY_PASSWORD`) | **Present.** It is accessible to the server runtime, and eWAY accepts the key/password pair. |
| Client Side Encryption key | **Not required.** Cards are entered on eWAY's hosted page (`secure.ewaypayments.com`), and the code never reads a CSE key. |
| Environment variable names | **Correct.** The code reads `EWAY_API_KEY`, `EWAY_PASSWORD` and `EWAY_ENVIRONMENT`, and those exact names are set. |

No secret values were printed, logged or returned. Every check used length or format only.

## B. Environment Verification

| Item | Result |
|---|---|
| eWAY environment | **LIVE.** `EWAY_ENVIRONMENT=Live` resolves to `production`, and the running server reports `environment: "production"`. |
| Production endpoint | **Correct:** `https://api.ewaypayments.com`. The hosted pages are on `https://secure.ewaypayments.com`. |
| LIVE credentials loaded successfully | **Yes.** `orders.paymentStatus` returns `configured: true, environment: "production", missing: []`. The same credentials are **rejected by sandbox** (HTTP 401), which confirms they are LIVE credentials. |
| Silent sandbox fallback | **Removed.** An unrecognised `EWAY_ENVIRONMENT` value now disables payments instead of using sandbox (see E). |

## C. API Connectivity

| Item | Result |
|---|---|
| Production endpoint reachable | **Yes.** |
| Authentication successful | **Yes.** A read-only AccessCode lookup returns HTTP 200. Creating a Shared Page AccessCode for a labelled `TEST-AUTHCHECK` invoice succeeds. |
| Payment request configuration valid | **Yes.** eWAY accepted the app's real request and returned a LIVE hosted page. The request contains AUD, the amount in cents (the server-computed total), `InvoiceNumber` = order reference, a unique `InvoiceReference` per attempt, and redirect/cancel URLs set to `WEBSITE_URL/checkout/success`. |

## D. Checkout Verification

I ran the app's own checkout against LIVE eWAY using a dedicated test order (`TF-JVKXNF8Q20`, "TEST-AUTHCHECK do not fulfil", $95.98). It stopped before card entry and was deleted afterwards. Script: `/home/user/qa/eway_live_flow.py`, result 11/11 passed.

| Item | Result |
|---|---|
| Correct order amount | **Verified.** The order total equals the server quote (products + shipping), and a client-supplied `total: 1` was ignored. The LIVE eWAY hosted page displayed **$95.98** and the order reference. |
| Payment response verification | **Verified for the non-paid paths.** Three returns kept the order unpaid: (1) returning without paying, (2) returning with a forged AccessCode, (3) the cancel link. A redirect alone never marks an order paid. An *approved* response has only been reviewed in the code (approved + exact amount + invoice match). |
| Successful payment handling | **Not verified.** This needs a real approved transaction. The code review is correct: the conditional `markPaid` stores the eWAY transaction ID. |
| Failed payment handling | **Partly verified.** The cancelled and unattempted paths stay unpaid, and the page shows "Payment cancelled". A real bank *decline* hasn't been tested. The code maps it to a readable reason and never marks it paid. |
| Duplicate payment protection | **Verified (no-charge parts).** A repeat create with the same checkout key reused the same order, so no duplicate order was created. A retry re-checked the earlier attempt before opening a fresh page. The "already paid, so no second page" path needs a real paid order. |

The live check also confirmed:
- The order confirmation lookup returns the correct reference, total and status.
- The server log, API responses, checkout page and built `dist/` contain no secret values.
- The log records only status/error codes, never request bodies.

## E. Changes Made

1. **`packages/web/src/api/lib/eway.ts`: environment parsing (bug fix).**
   `ewayEnvironment()` only recognised `"production"`, so the value `"Live"` silently fell back to **sandbox**, sending live credentials to the sandbox gateway.
   - Added `parseEnvironment()`. It maps `production` or `live` (any case) to production, and `sandbox` or an empty value to sandbox.
   - Any other value now reports eWAY as not configured (`missing: ["EWAY_ENVIRONMENT"]`) instead of quietly using sandbox.
   - Nothing else in the integration was touched.
2. **`.env.template`: comment only.** It documents that `"live"` is accepted, and that `EWAY_API_KEY` is the Rapid API Key, not the `epk-` Public API Key.
3. **Dev server restarted** to load the updated Secrets.

Lint shows 0 errors and `bun run build` passes.

Not changed: the checkout, design, prices, shipping, cart, database structure and existing orders. The one pre-existing order (`TF-WT5YHENH6K`, 4 Nov, unpaid) was not touched. The only order created by this check was the labelled test order, and it has been deleted.

## F. Remaining Actions

**Status:**
1. **LIVE CONFIGURED: Yes.**
2. **LIVE API VERIFIED: Yes.**
3. **LIVE PAYMENT FLOW VERIFIED: No.** This still needs a controlled, authorised live transaction.

The integration is configured and API-verified. The complete live payment flow still requires an authorised transaction.

**Before / alongside going live:**
1. **Set `WEBSITE_URL` to the public https domain.** eWAY sends customers back to `WEBSITE_URL/checkout/success`, which currently points to the Runable preview URL.
2. **Configure email** (`SMTP_USER`/`SMTP_PASS` or `RESEND_API_KEY`, plus `EMAIL_FROM`). Otherwise paid-order notifications won't send.
3. **To reach LIVE PAYMENT FLOW VERIFIED**, authorise one controlled transaction using a card you control. I'd create a dedicated test order, then you pay it on the eWAY page. A small item works; you can refund it in MYeWAY afterwards. I would then confirm all of the following:
   - the order flips to paid with the eWAY transaction ID
   - the confirmation page is correct
   - a refresh or retry doesn't charge twice
   - the admin order and production PDF still work
