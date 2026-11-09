import nodemailer, { type Transporter } from "nodemailer";

/**
 * Server-side email delivery. Runs only inside the API — nothing here is bundled for the browser,
 * and no credential ever reaches the client.
 *
 * Two transports, picked by which credentials are present in the root .env:
 *
 * 1. SMTP (preferred). Uses an existing mailbox at the domain's current email host — for
 *    tradieforms.com that's Hostinger, so no new account and no DNS changes are needed.
 *      SMTP_HOST   e.g. smtp.hostinger.com
 *      SMTP_PORT   465 (implicit TLS, default) or 587 (STARTTLS)
 *      SMTP_USER   full mailbox address, e.g. info@tradieforms.com
 *      SMTP_PASS   that mailbox's password
 *
 * 2. Resend HTTP API (optional alternative), used only when SMTP isn't configured.
 *      RESEND_API_KEY   needs the sending domain verified in Resend (DKIM/SPF records).
 *
 * Shared:
 *   EMAIL_FROM   sender. Defaults to SMTP_USER. Hostinger only lets a mailbox send as itself,
 *                so keep it on the SMTP_USER address (a display name is fine:
 *                "TradieForms Website <info@tradieforms.com>").
 *   EMAIL_TO     business inbox. Defaults to info@tradieforms.com.
 *
 * SMTP_INSECURE_TLS=1 skips certificate checks. Local testing against a self-signed capture
 * server only — never set it in production.
 */

export const BUSINESS_INBOX = process.env.EMAIL_TO?.trim() || "info@tradieforms.com";

export class MailerNotConfigured extends Error {
  constructor() {
    super("Email delivery is not configured on the server (set SMTP_HOST/SMTP_USER/SMTP_PASS, or RESEND_API_KEY).");
    this.name = "MailerNotConfigured";
  }
}

export interface MailInput {
  to: string | string[];
  subject: string;
  text: string;
  html: string;
  replyTo?: string;
}

const env = (k: string) => process.env[k]?.trim() || "";

function smtpConfig() {
  const host = env("SMTP_HOST");
  const user = env("SMTP_USER");
  const pass = process.env.SMTP_PASS ?? "";
  if (!host || !user || !pass) return null;
  const port = Number(env("SMTP_PORT")) || 465;
  return { host, port, user, pass };
}

let cached: { key: string; transport: Transporter } | null = null;
function smtpTransport(cfg: NonNullable<ReturnType<typeof smtpConfig>>) {
  const key = `${cfg.host}:${cfg.port}:${cfg.user}:${cfg.pass}`;
  if (cached?.key !== key) {
    cached = {
      key,
      transport: nodemailer.createTransport({
        host: cfg.host,
        port: cfg.port,
        secure: cfg.port === 465, // 465 = implicit TLS; 587 upgrades with STARTTLS
        requireTLS: cfg.port !== 465,
        auth: { user: cfg.user, pass: cfg.pass },
        connectionTimeout: 15_000,
        greetingTimeout: 15_000,
        socketTimeout: 20_000,
        tls: env("SMTP_INSECURE_TLS") === "1" ? { rejectUnauthorized: false } : undefined,
      }),
    };
  }
  return cached.transport;
}

/** Sends one email. Resolves with the provider message id, or throws — never fakes success. */
export async function sendMail(input: MailInput): Promise<{ id: string; via: "smtp" | "resend" }> {
  const to = Array.isArray(input.to) ? input.to : [input.to];

  const smtp = smtpConfig();
  if (smtp) {
    const from = env("EMAIL_FROM") || `TradieForms Website <${smtp.user}>`;
    try {
      const info = await smtpTransport(smtp).sendMail({
        from,
        to,
        subject: input.subject,
        text: input.text,
        html: input.html,
        replyTo: input.replyTo,
      });
      if (!info.accepted?.length) throw new Error("no recipients were accepted");
      return { id: info.messageId, via: "smtp" };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(`SMTP server rejected the message (${msg}).`);
    }
  }

  const key = env("RESEND_API_KEY");
  if (!key) throw new MailerNotConfigured();
  const from = env("EMAIL_FROM") || "TradieForms Website <onboarding@resend.dev>";
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from,
      to,
      subject: input.subject,
      text: input.text,
      html: input.html,
      reply_to: input.replyTo,
    }),
    signal: AbortSignal.timeout(15_000),
  });
  const body = (await res.json().catch(() => null)) as { id?: string; message?: string } | null;
  if (!res.ok || !body?.id) {
    throw new Error(`Email provider rejected the message (${res.status}${body?.message ? `: ${body.message}` : ""}).`);
  }
  return { id: body.id, via: "resend" };
}

const ESC: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };
export const escapeHtml = (s: string) => s.replace(/[&<>"']/g, (c) => ESC[c]);

/** A simple branded notification: a title plus label/value rows (values may be multi-line). */
export function notificationEmail(title: string, rows: [string, string | null | undefined][]) {
  const filled = rows.filter((r): r is [string, string] => Boolean(r[1]?.trim()));
  const text = [title, "", ...filled.map(([k, v]) => `${k}:\n${v}\n`)].join("\n");
  const html = `<!doctype html><html><body style="margin:0;background:#f4f2ee;font-family:Arial,Helvetica,sans-serif;color:#14181f">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:24px 12px">
<table role="presentation" width="600" cellpadding="0" cellspacing="0" style="max-width:600px;width:100%;background:#ffffff;border:1px solid #dcd8cf">
<tr><td style="background:#0B2A5B;padding:18px 24px;color:#FFC72C;font-weight:bold;font-size:18px;letter-spacing:.5px">TRADIEFORMS</td></tr>
<tr><td style="padding:24px"><h1 style="margin:0 0 16px;font-size:20px;color:#0B2A5B">${escapeHtml(title)}</h1>
${filled
  .map(
    ([k, v]) =>
      `<p style="margin:0 0 4px;font-size:12px;text-transform:uppercase;letter-spacing:1px;color:#5b6472">${escapeHtml(k)}</p>
<p style="margin:0 0 16px;font-size:15px;line-height:1.5;white-space:pre-wrap">${escapeHtml(v)}</p>`,
  )
  .join("\n")}
</td></tr></table></td></tr></table></body></html>`;
  return { text, html };
}
