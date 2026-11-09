import { useMutation } from "@tanstack/react-query";
import { client } from "../lib/api";
import { type LogoAnalysis, analyseLogo, validateLogoFile } from "../lib/logo-file";
import { removeLogoBackground, transparentName } from "../lib/remove-background";

export interface UploadedLogo {
  key: string;
  url: string;
  name: string;
  analysis: LogoAnalysis | null;
  /** The file itself, kept in memory so the background can be removed without a re-download. */
  file: File;
}

/** Presign → PUT to object storage → signed read URL. The file is stored untouched. */
async function uploadLogoFile(file: File): Promise<UploadedLogo> {
  const invalid = validateLogoFile(file);
  if (invalid) throw new Error(invalid);
  const analysis = await analyseLogo(file);
  const { url, key } = await client.upload.presign({
    filename: file.name,
    contentType: file.type,
    size: file.size,
  });
  const res = await fetch(url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!res.ok) throw new Error("Upload failed — check the file and try again.");
  // The server re-reads the stored file and checks its real type/size (deletes it if bad).
  await client.upload.verify({ key });
  const { url: readUrl } = await client.upload.signGet({ key });
  return { key, url: readUrl, name: file.name, analysis, file };
}

/**
 * Uploads a logo straight to object storage with a presigned URL and returns
 * the stored key plus a signed read URL for display. The file is uploaded
 * untouched, so its transparency is preserved exactly.
 */
export function useLogoUpload() {
  return useMutation({ mutationFn: uploadLogoFile });
}

/**
 * "Remove background": makes a transparent PNG copy of the logo in the browser and
 * uploads it as a new file. The original stays in storage untouched (so Undo is instant).
 */
export function useRemoveLogoBackground() {
  return useMutation({
    mutationFn: async (input: {
      /** The original file when we still have it, otherwise its (signed) URL. */
      source: File | string;
      name: string;
      holes?: boolean;
    }): Promise<UploadedLogo & { removed: number }> => {
      const result = await removeLogoBackground(input.source, { holes: input.holes });
      const file = new File([result.blob], transparentName(input.name), { type: "image/png" });
      const uploaded = await uploadLogoFile(file);
      return { ...uploaded, removed: result.removed };
    },
  });
}
