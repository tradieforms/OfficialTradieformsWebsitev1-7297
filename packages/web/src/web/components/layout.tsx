import { useEffect } from "react";
import { useLocation } from "wouter";
import { SiteHeader } from "./site-header";
import { SiteFooter } from "./site-footer";

export function Layout({ children }: { children: React.ReactNode }) {
  const [location] = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "auto" });
  }, [location]);

  return (
    <div className="flex min-h-screen flex-col">
      <SiteHeader />
      <main id="main" className="flex-1">
        {children}
      </main>
      <SiteFooter />
    </div>
  );
}

interface PageIntroProps {
  title: React.ReactNode;
  intro?: React.ReactNode;
  children?: React.ReactNode;
}

export function PageIntro({ title, intro, children }: PageIntroProps) {
  return (
    <section className="tf-grit border-b border-tf-line-dark bg-tf-navy text-white">
      <div className="tf-shell grid gap-8 py-14 md:grid-cols-[1.35fr_1fr] md:items-end md:py-20">
        <div>
          <h1 className="tf-display text-[clamp(2.2rem,6vw,4.2rem)] text-white">{title}</h1>
        </div>
        <div className="md:pb-2">
          {intro ? <p className="max-w-md text-[1.02rem] leading-relaxed text-white/70">{intro}</p> : null}
          {children}
        </div>
      </div>
    </section>
  );
}
