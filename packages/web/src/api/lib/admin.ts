/**
 * Admin access for internal tools (supplier production sheets, order list, quote requests).
 *
 * An admin is a signed-in user whose email is listed in ADMIN_EMAILS (comma separated, root
 * .env) AND whose email ownership has been verified. Email + password sign-up does not verify
 * ownership (no email is sent), so without the verified check anyone could register a listed
 * address that has no account yet and become an admin. An address becomes verified when its
 * owner signs in once with Google/Apple (Runable managed auth) — see lib/managed-auth-link.ts.
 * With ADMIN_EMAILS empty, nobody is an admin.
 */
export function adminEmails(): string[] {
  return (process.env.ADMIN_EMAILS ?? "")
    .split(",")
    .map((e: string) => e.trim().toLowerCase())
    .filter(Boolean);
}

export interface AdminCandidate {
  email?: string | null;
  emailVerified?: boolean | null;
}

/** True only for a listed email that the identity provider has verified. */
export function isAdmin(user: AdminCandidate | null | undefined): boolean {
  if (!user?.email || user.emailVerified !== true) return false;
  return adminEmails().includes(user.email.trim().toLowerCase());
}

/** Listed in ADMIN_EMAILS but not yet verified — used only to show a helpful message. */
export function isPendingAdmin(user: AdminCandidate | null | undefined): boolean {
  if (!user?.email || user.emailVerified === true) return false;
  return adminEmails().includes(user.email.trim().toLowerCase());
}
