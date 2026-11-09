import { useEffect, useState } from "react";
import { client } from "./api";

/**
 * Signs stored logo keys for display. Keys that fail to sign map to `null`
 * so callers can tell "missing" apart from "still loading" (undefined).
 */
export function useSignedLogos(keys: (string | null | undefined)[]) {
  const [urls, setUrls] = useState<Record<string, string | null>>({});
  const wanted = Array.from(new Set(keys.filter((k): k is string => Boolean(k))));
  const pending = wanted.filter((k) => !(k in urls));
  const pendingKey = pending.join("|");

  useEffect(() => {
    if (!pendingKey) return;
    let cancelled = false;
    (async () => {
      const next: Record<string, string | null> = {};
      for (const key of pendingKey.split("|")) {
        try {
          next[key] = (await client.upload.signGet({ key })).url;
        } catch {
          next[key] = null;
        }
      }
      if (!cancelled) setUrls((prev) => ({ ...prev, ...next }));
    })();
    return () => {
      cancelled = true;
    };
  }, [pendingKey]);

  return urls;
}
