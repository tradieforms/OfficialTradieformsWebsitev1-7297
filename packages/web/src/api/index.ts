import type { RouterClient } from "@orpc/server";
import { Hono } from "hono";
import { apiSecurityHeaders, corsAllowList, originGuard } from "./lib/security-headers";
import { createApp } from "./__core/app";
import { auth } from "./auth";
import { admin } from "./routes/admin";
import { productionPdfRoute } from "./lib/production-pdf-download";
import { catalogue } from "./routes/catalogue";
import { contact } from "./routes/contact";
import { designs } from "./routes/designs";
import { newsletter } from "./routes/newsletter";
import { orders } from "./routes/orders";
import { ping } from "./routes/ping";
import { shippingQuotes } from "./routes/shipping-quotes";
import { upload } from "./routes/upload";

export const router = {
  ping,
  admin,
  catalogue,
  designs,
  orders,
  shippingQuotes,
  contact,
  newsletter,
  upload,
};

export type AppRouter = typeof router;
/** Typed client for the router — used by the web and mobile api clients. */
export type AppRouterClient = RouterClient<AppRouter>;

const app = createApp(router);

// Better Auth handler (session + managed Google/Apple/Microsoft exchange).
app.on(["GET", "POST"], "/api/auth/*", (c) => auth.handler(c.req.raw));

// Supplier production sheet — a binary file download, so a plain GET route (admin only).
app.get("/api/admin/orders/:reference/production.pdf", productionPdfRoute);

// Outer mount: security headers on every /api response, CORS grants only for trusted
// origins, and an Origin check on writes — applied around the template app
// (CORS → oRPC → auth → plain routes).
const root = new Hono();
root.use("/api/*", apiSecurityHeaders);
root.use("/api/*", corsAllowList);
root.use("/api/*", originGuard);
root.route("/", app);

export default root;
