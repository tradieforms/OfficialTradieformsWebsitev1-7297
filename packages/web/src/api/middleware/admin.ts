import { ORPCError } from "@orpc/server";
import { authed } from "./auth";
import { isAdmin } from "../lib/admin";

/** Admin-only procedures: a signed-in, email-verified user whose email is in ADMIN_EMAILS. */
export const adminOnly = authed.use(async ({ context, next }) => {
  if (!isAdmin(context.user)) throw new ORPCError("FORBIDDEN", { message: "Admins only." });
  return next({ context });
});
