import { randomBytes } from "node:crypto";
import { z } from "zod";
import {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { ORPCError } from "@orpc/server";
import { base } from "../__core/app";
import { BUCKET, s3 } from "../lib/s3";
import { enforceLimit } from "../lib/rate-limit";
import { logoKeyInput } from "../lib/logo-key";
import { LOGO_MAX_BYTES, LOGO_TYPES, type LogoType, sniffLogo } from "../lib/logo-sniff";

/** Signed read URLs live long enough for a studio session; logos are re-signed on page load. */
const READ_TTL_SECONDS = 2 * 60 * 60;

/**
 * Customer logo uploads — the browser PUTs straight to object storage with a presigned URL.
 *
 * 1. presign: type allow-list, size required (≤ 5 MB) and bound into the signature
 *    (Content-Length + Content-Type), random object name under `logos/`.
 * 2. verify: the server reads the stored object back, checks its real size and its first
 *    bytes against the declared type (PNG/JPEG/WEBP signatures; SVG must be a plain SVG
 *    with no scripts, event handlers, external references or embedded HTML). Anything that
 *    fails is deleted from storage.
 * 3. signGet: short-lived read URLs, only for keys under `logos/`.
 */
export const upload = {
  presign: base
    .input(
      z.object({
        filename: z.string().min(1).max(160),
        contentType: z.string().max(60),
        size: z.number().int().positive().max(LOGO_MAX_BYTES),
      }),
    )
    .handler(async ({ input, context }) => {
      enforceLimit("logo-upload", context.headers);
      if (!LOGO_TYPES.includes(input.contentType as LogoType)) {
        throw new ORPCError("BAD_REQUEST", {
          message: "Logos must be a PNG, JPG, WEBP or SVG file.",
        });
      }

      const safe = input.filename.replace(/[^a-zA-Z0-9._-]/g, "_").replace(/\.{2,}/g, "_").slice(-80);
      const key = `logos/${randomBytes(12).toString("hex")}-${safe.replace(/^[^A-Za-z0-9]+/, "") || "logo"}`;

      const url = await getSignedUrl(
        s3,
        new PutObjectCommand({
          Bucket: BUCKET,
          Key: key,
          ContentType: input.contentType,
          ContentLength: input.size,
        }),
        { expiresIn: 600, signableHeaders: new Set(["content-type", "content-length"]) },
      );

      return { url, key };
    }),

  /** Checks the uploaded object really is the image it claims to be; deletes it if not. */
  verify: base.input(z.object({ key: logoKeyInput })).handler(async ({ input, context }) => {
    enforceLimit("logo-upload", context.headers);
    const reject = async (message: string) => {
      await s3.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: input.key })).catch(() => {});
      throw new ORPCError("BAD_REQUEST", { message });
    };

    let head;
    try {
      head = await s3.send(new HeadObjectCommand({ Bucket: BUCKET, Key: input.key }));
    } catch {
      throw new ORPCError("NOT_FOUND", { message: "That upload wasn't found. Upload the logo again." });
    }
    const size = head.ContentLength ?? 0;
    if (size <= 0) return reject("That file is empty.");
    if (size > LOGO_MAX_BYTES) return reject("That file is over the 5 MB limit. Export a smaller PNG or an SVG.");
    const declared = (head.ContentType ?? "").split(";")[0]!.trim().toLowerCase();
    if (!LOGO_TYPES.includes(declared as LogoType))
      return reject("Logos must be a PNG, JPG, WEBP or SVG file.");

    // SVG is text and is inspected in full (≤ 5 MB); raster formats only need the header.
    const obj = await s3.send(
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: input.key,
        Range: declared === "image/svg+xml" ? undefined : "bytes=0-63",
      }),
    );
    const bytes = await obj.Body!.transformToByteArray();
    const problem = sniffLogo(declared as LogoType, bytes);
    if (problem) return reject(problem);
    return { ok: true as const, key: input.key, contentType: declared, size };
  }),

  /** Presigned read URL for a stored logo (logos/ prefix only). */
  signGet: base.input(z.object({ key: logoKeyInput })).handler(async ({ input, context }) => {
    enforceLimit("logo-sign", context.headers);
    const url = await getSignedUrl(
      s3,
      new GetObjectCommand({
        Bucket: BUCKET,
        Key: input.key,
        ResponseContentDisposition: "inline",
        ResponseCacheControl: "private, max-age=3600",
      }),
      { expiresIn: READ_TTL_SECONDS },
    );
    return { url };
  }),
};
