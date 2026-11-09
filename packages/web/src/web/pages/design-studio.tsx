import { useEffect, useState } from "react";
import { Link, useSearch } from "wouter";
import { AlertCircle, Loader2 } from "lucide-react";
import type { Product } from "../../shared/catalogue";
import { PageIntro } from "../components/layout";
import { DesignStudio } from "../components/studio/design-studio";
import { GuestDrafts } from "../components/studio/guest-drafts";
import { useCatalogue } from "../queries/catalogue";
import { useDesigns } from "../queries/designs";
import { client } from "../lib/api";
import { authClient } from "../lib/auth";
import { parseTransform, type RestoredDesign } from "../lib/design";
import { getDraft } from "../lib/drafts";
import { imageLoads } from "../lib/logo-file";
import { isStudioSelfUpdate } from "../lib/studio-url";

/** Signs a stored logo key and checks the file really loads. */
async function signLogo(key: string | null): Promise<{ url: string | null; missing: boolean }> {
  if (!key) return { url: null, missing: false };
  try {
    const { url } = await client.upload.signGet({ key });
    return (await imageLoads(url)) ? { url, missing: false } : { url: null, missing: true };
  } catch {
    return { url: null, missing: true };
  }
}

export default function DesignStudioPage() {
  const search = useSearch();
  const params = new URLSearchParams(search);
  const productParam = params.get("product");
  const colourParam = params.get("colour");
  const variantParam = params.get("variant");
  const designParam = params.get("design");
  const draftParam = params.get("draft");

  const catalogue = useCatalogue();
  const { data: session, isPending: sessionPending } = authClient.useSession();
  const designs = useDesigns();

  // Which saved thing (if any) the URL asked for, captured once on arrival so
  // the studio's own URL updates after saving don't trigger a re-restore.
  const [wanted] = useState(() =>
    designParam ? ({ kind: "design", id: designParam } as const) : draftParam ? ({ kind: "draft", id: draftParam } as const) : null,
  );
  // Remount the studio only for real navigation (e.g. a link to another
  // product), not when the studio rewrites its own URL after saving.
  const [studioKey, setStudioKey] = useState(() => `n-${search}`);
  useEffect(() => {
    if (isStudioSelfUpdate(search)) return;
    setStudioKey(`n-${search}`);
  }, [search]);
  const [restored, setRestored] = useState<RestoredDesign | null>(null);
  const [restoreError, setRestoreError] = useState<string | null>(null);
  const [restoring, setRestoring] = useState(Boolean(wanted));

  useEffect(() => {
    if (!wanted || !restoring) return;
    let cancelled = false;

    if (wanted.kind === "draft") {
      const draft = getDraft(wanted.id);
      if (!draft) {
        setRestoreError(
          "That draft isn't in this browser. Guest drafts are stored only on the device and browser that saved them.",
        );
        setRestoring(false);
        return;
      }
      (async () => {
        const logo = await signLogo(draft.logoKey);
        if (cancelled) return;
        setRestored({
          designId: null,
          draftId: draft.id,
          designName: draft.name,
          productSlug: draft.productSlug,
          variantId: draft.variantId ?? null,
          colourId: draft.colourId,
          size: draft.size,
          logoKey: logo.missing ? null : draft.logoKey,
          logoUrl: logo.url,
          logoName: draft.logoName,
          frontLogo: draft.frontLogo,
          backLogo: draft.backLogo,
          view: draft.view,
          logoMissing: logo.missing,
        });
        setRestoring(false);
      })();
      return () => {
        cancelled = true;
      };
    }

    // Account design: needs a session.
    if (sessionPending) return;
    if (!session?.user) {
      setRestoreError("Sign in with the account that saved this design to reopen it.");
      setRestoring(false);
      return;
    }
    const id = Number(wanted.id);
    if (!Number.isFinite(id)) {
      setRestoreError("That design link is not valid.");
      setRestoring(false);
      return;
    }
    if (designs.isLoading || !designs.isFetched) return;
    const row = designs.data?.find((d) => d.id === id);
    if (!row) {
      setRestoreError("We couldn't find that saved design on this account.");
      setRestoring(false);
      return;
    }
    (async () => {
      const logo = await signLogo(row.logoKey);
      if (cancelled) return;
      setRestored({
        designId: row.id,
        draftId: null,
        designName: row.name,
        productSlug: row.productSlug,
        variantId: row.variantId ?? null,
        colourId: row.colourId,
        size: row.size,
        logoKey: logo.missing ? null : row.logoKey,
        logoUrl: logo.url,
        logoName: row.logoName ?? null,
        frontLogo: parseTransform(row.frontLogo),
        backLogo: parseTransform(row.backLogo),
        view: row.activeView === "back" ? "back" : "front",
        logoMissing: logo.missing,
      });
      setRestoring(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [wanted, restoring, session, sessionPending, designs.data, designs.isLoading, designs.isFetched]);

  const products = (catalogue.data?.products ?? []) as Product[];
  const ready = !catalogue.isLoading && !restoring && products.length > 0;

  return (
    <>
      <PageIntro
        title="Put your logo on the kit."
        intro="Choose a garment, upload your logo and pick a fixed logo spot on the actual garment photo. No card details, no account needed to start — save a draft and come back to it."
      />

      <section className="bg-tf-paper py-10 md:py-14">
        <div className="tf-shell">
          {restoreError ? (
            <p
              role="alert"
              className="mb-6 flex max-w-3xl gap-2 border border-tf-orange/60 bg-white px-4 py-3 text-[0.9rem] text-tf-ink"
            >
              <AlertCircle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
              <span>
                {restoreError}{" "}
                {!session?.user && wanted?.kind === "design" ? (
                  <Link
                    to={`/login?next=${encodeURIComponent(`/design-studio?design=${wanted.id}`)}`}
                    className="font-semibold text-tf-navy underline"
                  >
                    Sign in
                  </Link>
                ) : null}{" "}
                You can start a new design below.
              </span>
            </p>
          ) : null}

          {restored ? (
            <output
              className="block mb-6 max-w-3xl border border-tf-navy/25 bg-white px-4 py-3 text-[0.9rem] text-tf-ink"
            >
              Reopened “{restored.designName}”
              {restored.designId != null ? " from your account" : " from this browser"} — product,
              colour, size{restored.logoMissing ? "" : ", logo"} and front/back placement are loaded and
              editable.
              {restored.logoMissing ? (
                <strong className="mt-1 block text-tf-rust">
                  The logo file for this design could not be loaded, so it has been left off. Upload it
                  again — the saved placement is kept.
                </strong>
              ) : null}
            </output>
          ) : null}

          {catalogue.isError ? (
            <p className="flex items-center gap-2 text-sm text-tf-rust">
              <AlertCircle className="size-4" aria-hidden /> The catalogue didn't load. Refresh to try
              again.
            </p>
          ) : !ready ? (
            <p className="flex items-center gap-3 py-16 text-sm text-tf-steel">
              <Loader2 className="size-4 animate-spin" aria-hidden />
              {restoring ? "Reopening your design…" : "Loading the range…"}
            </p>
          ) : (
            <DesignStudio
              key={restored ? `r-${restored.designId ?? restored.draftId}` : studioKey}
              products={products}
              initialProductSlug={productParam}
              initialColourId={colourParam}
              initialVariantId={variantParam}
              restored={restored}
            />
          )}

          {ready ? <GuestDrafts compact signedIn={Boolean(session?.user)} /> : null}
        </div>
      </section>
    </>
  );
}
