import { ORPCError } from "@orpc/server";
import { eq } from "drizzle-orm";
import { z } from "zod";
import { base } from "../__core/app";
import { db } from "../database";
import * as schema from "../database/schema";
import { BUSINESS_INBOX, MailerNotConfigured, notificationEmail, sendMail } from "../lib/mailer";
import { checkSpam, singleLine, spamFields } from "../lib/spam-guard";

/**
 * Contact enquiries. Every submission is stored first, then emailed to the business inbox.
 * Success is only returned once the email provider has accepted the message; if delivery
 * fails the visitor gets an error (the stored copy is kept for the team, marked "failed").
 */
export const contact = {
  submit: base
    .input(
      z.object({
        name: z.string().trim().min(2, "Tell us your name").max(120).transform(singleLine),
        email: z.string().trim().email("Enter a valid email address").max(200),
        company: z.string().trim().max(120).transform(singleLine).optional().nullable(),
        phone: z
          .string()
          .trim()
          .max(40)
          .regex(/^[+\d\s()-]*$/, "Enter a valid phone number")
          .optional()
          .nullable(),
        message: z.string().trim().min(10, "Give us a bit more detail").max(4000),
        ...spamFields,
      }),
    )
    .handler(async ({ input, context }) => {
      if (checkSpam("contact", context.headers, input)) {
        // Automated submission: drop it without telling the bot anything useful.
        return { id: 0, receivedAt: new Date(), delivered: true as const };
      }

      const email = input.email.toLowerCase();
      const [row] = await db
        .insert(schema.contactMessages)
        .values({
          name: input.name,
          email,
          company: input.company || null,
          phone: input.phone || null,
          message: input.message,
        })
        .returning({ id: schema.contactMessages.id, createdAt: schema.contactMessages.createdAt });

      const { text, html } = notificationEmail(`New website enquiry #${row.id}`, [
        ["Name", input.name],
        ["Email", email],
        ["Phone", input.phone],
        ["Company", input.company],
        ["Message", input.message],
        ["Received", row.createdAt.toLocaleString("en-AU", { timeZone: "Australia/Sydney" })],
      ]);

      try {
        await sendMail({
          to: BUSINESS_INBOX,
          subject: `Website enquiry #${row.id} — ${input.name}`,
          text,
          html,
          replyTo: email,
        });
      } catch (err) {
        const reason = err instanceof Error ? err.message : String(err);
        await db
          .update(schema.contactMessages)
          .set({ deliveryStatus: "failed", deliveryError: reason.slice(0, 500) })
          .where(eq(schema.contactMessages.id, row.id));
        console.error("[contact] delivery failed", row.id, reason);
        throw new ORPCError("SERVICE_UNAVAILABLE", {
          message:
            err instanceof MailerNotConfigured
              ? "our email service isn't set up yet, so your message wasn't sent"
              : "our email service didn't accept the message",
        });
      }

      await db
        .update(schema.contactMessages)
        .set({ deliveryStatus: "sent" })
        .where(eq(schema.contactMessages.id, row.id));
      return { id: row.id, receivedAt: row.createdAt, delivered: true as const };
    }),
};
