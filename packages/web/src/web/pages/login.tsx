import { useState } from "react";
import { Link, useLocation, useSearch } from "wouter";
import { AlertCircle, ArrowRight, Loader2 } from "lucide-react";
import { authClient, authErrorMessage } from "../lib/auth";
import { PageIntro } from "../components/layout";
import { cn } from "../lib/utils";
import { AppleIcon, GoogleIcon, MicrosoftIcon } from "../components/provider-icons";

type Mode = "signin" | "signup";

const PROVIDERS = [
  { id: "google" as const, label: "Google", Icon: GoogleIcon },
  { id: "apple" as const, label: "Apple", Icon: AppleIcon },
  { id: "microsoft" as const, label: "Microsoft", Icon: MicrosoftIcon },
];

export default function LoginPage() {
  const [, navigate] = useLocation();
  const search = useSearch();
  const next = new URLSearchParams(search).get("next") ?? "/account";

  const [mode, setMode] = useState<Mode>("signin");
  const [form, setForm] = useState({ name: "", email: "", password: "" });
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState<string | null>(null);

  const { data: session } = authClient.useSession();

  const done = () => navigate(next);

  const onPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (mode === "signup" && form.name.trim().length < 2) {
      setError("Tell us your name so we can label your saved designs.");
      return;
    }
    if (form.password.length < 8) {
      setError("Passwords need at least 8 characters.");
      return;
    }
    setPending("password");
    try {
      const result =
        mode === "signin"
          ? await authClient.signIn.email({ email: form.email, password: form.password })
          : await authClient.signUp.email({
              email: form.email,
              password: form.password,
              name: form.name.trim(),
            });
      if (result.error) {
        setError(result.error.message ?? "That didn't work. Check your details and try again.");
        return;
      }
      done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  };

  const onProvider = async (provider: (typeof PROVIDERS)[number]["id"]) => {
    setError(null);
    setPending(provider);
    try {
      const result = await authClient.managedAuth.signIn({ provider });
      const message = authErrorMessage(result?.error ?? undefined);
      if (message) setError(message);
      else done();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong. Try again.");
    } finally {
      setPending(null);
    }
  };

  return (
    <>
      <PageIntro
        title={
          session?.user ? (
            <>
              You&rsquo;re signed in.
              <br />
              Welcome back.
            </>
          ) : (
            <>
              Save your kit.
              <br />
              Reorder it later.
            </>
          )
        }
        intro="An account keeps your saved designs — product, colour, size, logo and placement — so the crew can reorder the same gear without redoing the mockup."
      />

      <section className="bg-white py-[clamp(3.5rem,7vw,6rem)]">
        <div className="tf-shell grid gap-12 lg:grid-cols-[1fr_1fr] lg:gap-20">
          <div className="border border-tf-line p-7 md:p-9">
            {session?.user ? (
              <div>
                <h2 className="tf-display text-[1.5rem] text-tf-ink">
                  {session.user.name ?? session.user.email}
                </h2>
                <p className="mt-2 text-[0.9rem] text-tf-steel">Signed in as {session.user.email}</p>
                <div className="mt-7 flex flex-wrap gap-3">
                  <Link to="/account" className="btn-base btn-primary">
                    My account <ArrowRight className="size-4" aria-hidden />
                  </Link>
                  <button
                    type="button"
                    className="btn-base btn-secondary text-tf-navy hover:text-tf-navy"
                    onClick={async () => {
                      await authClient.signOut();
                      navigate("/");
                    }}
                  >
                    <span>Sign out</span>
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex gap-1 border border-tf-line p-1">
                  {(["signin", "signup"] as Mode[]).map((m) => (
                    <button
                      key={m}
                      type="button"
                      aria-pressed={mode === m}
                      onClick={() => {
                        setMode(m);
                        setError(null);
                      }}
                      className={cn(
                        "flex-1 px-4 py-2.5 font-display text-[0.84rem] font-bold tracking-[0.04em] transition-colors",
                        mode === m ? "bg-tf-navy text-white" : "text-tf-navy hover:bg-tf-paper",
                      )}
                    >
                      {m === "signin" ? "Sign in" : "Create account"}
                    </button>
                  ))}
                </div>

                <form onSubmit={onPassword} noValidate className="mt-7">
                  {mode === "signup" ? (
                    <label className="block">
                      <span className="tf-eyebrow block text-tf-steel">Name</span>
                      <input
                        value={form.name}
                        onChange={(e) => setForm((p) => ({ ...p, name: e.target.value }))}
                        aria-label="Name"
                        autoComplete="name"
                        className="tf-input mt-2"
                      />
                    </label>
                  ) : null}

                  <label className={cn("block", mode === "signup" && "mt-5")}>
                    <span className="tf-eyebrow block text-tf-steel">Email</span>
                    <input
                      value={form.email}
                      onChange={(e) => setForm((p) => ({ ...p, email: e.target.value }))}
                      aria-label="Email"
                      type="email"
                      autoComplete="email"
                      required
                      className="tf-input mt-2"
                    />
                  </label>

                  <label className="mt-5 block">
                    <span className="tf-eyebrow block text-tf-steel">Password</span>
                    <input
                      value={form.password}
                      onChange={(e) => setForm((p) => ({ ...p, password: e.target.value }))}
                      aria-label="Password"
                      type="password"
                      autoComplete={mode === "signin" ? "current-password" : "new-password"}
                      required
                      minLength={8}
                      className="tf-input mt-2"
                    />
                    <span className="mt-1.5 block text-[0.78rem] text-tf-steel">
                      At least 8 characters.
                    </span>
                  </label>

                  {error ? (
                    <p className="mt-5 flex items-start gap-2 border border-tf-orange/50 bg-tf-orange/5 px-4 py-3 text-[0.86rem] text-tf-ink">
                      <AlertCircle className="mt-0.5 size-4 shrink-0 text-tf-rust" aria-hidden />
                      {error}
                    </p>
                  ) : null}

                  <button
                    type="submit"
                    className="btn-base btn-primary mt-7 w-full"
                    disabled={pending === "password"}
                  >
                    {pending === "password" ? (
                      <>
                        <Loader2 className="size-4 animate-spin" aria-hidden /> Working…
                      </>
                    ) : mode === "signin" ? (
                      "Sign in"
                    ) : (
                      "Create account"
                    )}
                  </button>
                </form>

                <div className="my-7 flex items-center gap-4">
                  <span className="h-[1px] flex-1 bg-tf-line" aria-hidden />
                  <span className="tf-eyebrow text-tf-steel">or</span>
                  <span className="h-[1px] flex-1 bg-tf-line" aria-hidden />
                </div>

                <div className="grid gap-2">
                  {PROVIDERS.map((p) => (
                    <button
                      key={p.id}
                      type="button"
                      className="btn-base btn-secondary text-tf-navy hover:text-tf-navy"
                      disabled={Boolean(pending)}
                      onClick={() => onProvider(p.id)}
                    >
                      {pending === p.id ? (
                        <Loader2 className="size-5 shrink-0 animate-spin" aria-hidden />
                      ) : (
                        <p.Icon className="size-5 shrink-0" />
                      )}
                      <span>Continue with {p.label}</span>
                    </button>
                  ))}
                </div>
              </>
            )}
          </div>

          <div>
            <h2 className="tf-display text-[clamp(1.4rem,3vw,2rem)] text-tf-ink">
              What an account gets you
            </h2>
            <ul className="mt-7 divide-y divide-tf-line border-y border-tf-line">
              {[
                {
                  title: "Saved designs",
                  body: "Every configuration you save — garment, colour, size, logo and its fixed print spots — is stored as editable settings, never a flat image.",
                },
                {
                  title: "Use this design",
                  body: "Reopen a saved design and the studio loads exactly what you saved. Change the colour and your logo stays where you put it.",
                },
                {
                  title: "Order history",
                  body: "Every order you place while signed in is listed against your account with its reference number.",
                },
              ].map((item) => (
                <li key={item.title} className="py-6">
                  <h3 className="font-display text-[0.95rem] font-bold tracking-[0.02em] text-tf-navy uppercase">
                    {item.title}
                  </h3>
                  <p className="mt-2 text-[0.92rem] leading-relaxed text-tf-steel">{item.body}</p>
                </li>
              ))}
            </ul>
            <p className="mt-7 text-[0.85rem] leading-relaxed text-tf-steel">
              You can build a kit and check out without an account — you just won&apos;t be able to
              reopen the mockup later.
            </p>
          </div>
        </div>
      </section>
    </>
  );
}
