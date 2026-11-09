import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { BUSINESS_INBOX, MailerNotConfigured, notificationEmail, sendMail } from "../lib/mailer";
import { checkSpam, singleLine, spamFields } from "../lib/spam-guard";

/**
 * "Get crew deals" signup. Stored, then emailed to the business inbox. Only reports success
 * once the email provider has accepted the notification.
 */
export const newsletter = {
  subscribe: base
    .input(
      z.object({
        email: z.string().trim().email("Enter a valid email address").max(200),
        name: z.string().trim().max(120).transform(singleLine).optional().nullable(),
        ...spamFields,
      }),
    )
    .handler(async ({ input, context }) => {
      if (checkSpam("crew-deals", context.headers, input)) {
        return { email: input.email, alreadySubscribed: false };
      }
      const email = input.email.toLowerCase();
      const name = input.name?.trim() || null;

      const existing = await db
        .select({ id: schema.subscribers.id, status: schema.subscribers.deliveryStatus })
        .from(schema.subscribers)
        .where(eq(schema.subscribers.email, email))
        .get();
      const alreadySubscribed = existing?.status === "sent";
      if (!existing) await db.insert(schema.subscribers).values({ email, name });
      else if (name) await db.update(schema.subscribers).set({ name }).where(eq(schema.subscribers.email, email));

      if (!alreadySubscribed) {
        const { text, html } = notificationEmail("New Get Crew Deals signup", [
          ["Name", name],
          ["Email", email],
          ["Signed up", new Date().toLocaleString("en-AU", { timeZone: "Australia/Sydney" })],
        ]);
        try {
          await sendMail({
            to: BUSINESS_INBOX,
            subject: `Crew deals signup — ${name ?? email}`,
            text,
            html,
            replyTo: email,
          });
        } catch (err) {
          const reason = err instanceof Error ? err.message : String(err);
          await db
            .update(schema.subscribers)
            .set({ deliveryStatus: "failed", deliveryError: reason.slice(0, 500) })
            .where(eq(schema.subscribers.email, email));
          console.error("[crew-deals] delivery failed", email, reason);
          throw new ORPCError("SERVICE_UNAVAILABLE", {
            message:
              err instanceof MailerNotConfigured
                ? "Our email service isn't set up yet, so your signup wasn't sent. Email info@tradieforms.com instead."
                : "Our email service didn't accept the signup. Try again shortly, or email info@tradieforms.com.",
          });
        }
        await db
          .update(schema.subscribers)
          .set({ deliveryStatus: "sent", deliveryError: null })
          .where(eq(schema.subscribers.email, email));
      }
      return { email, alreadySubscribed };
    }),
};
