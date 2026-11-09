import { createAuthClient } from "better-auth/react";
import { managedAuthClient } from "@runablehq/managed-auth/client";

const config = {
  applicationId: import.meta.env.VITE_APPLICATION_ID,
  issuer: import.meta.env.VITE_RUNABLE_AUTH_ISSUER,
};

export const authClient = createAuthClient({
  baseURL: import.meta.env.VITE_WEBSITE_URL ?? window.location.origin,
  basePath: "/api/auth",
  plugins: [managedAuthClient(config)],
});

export function authErrorMessage(error: { code?: string; message?: string } | undefined) {
  if (!error) return null;
  if (error.code === "POPUP_CLOSED") return null;
  return error.message ?? "Something went wrong. Try again.";
}
