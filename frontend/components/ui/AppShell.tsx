"use client";

import { Suspense, useEffect, type CSSProperties, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import BackToTopButton from "@/components/ui/BackToTopButton";
import TopNav from "@/components/ui/TopNav";
import MobileHeader from "@/components/ui/MobileHeader";
import MobileNav from "@/components/ui/MobileNav";

type AppShellStat = {
  label: string;
  value: string;
  hint?: string;
};

type AppShellProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  mobileDescription?: ReactNode;
  stats?: AppShellStat[];
  actions?: ReactNode;
  titleTag?: "h1" | "div";
  children: ReactNode;
};

export default function AppShell({
  eyebrow,
  title,
  description,
  mobileDescription,
  stats = [],
  actions,
  titleTag = "h1",
  children,
}: AppShellProps) {
  const TitleTag = titleTag;
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 960) {
      return;
    }

    const previous = window.history.scrollRestoration;
    window.history.scrollRestoration = "manual";

    return () => {
      window.history.scrollRestoration = previous;
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined" || window.innerWidth >= 960) {
      return;
    }

    const frameId = window.requestAnimationFrame(() => {
      window.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });

    return () => {
      window.cancelAnimationFrame(frameId);
    };
  }, [pathname]);

  return (
    <main className="app-shell min-h-screen text-white">
      <MobileHeader eyebrow={eyebrow} title={title} />

      <div className="desktop-shell">
        <aside className="tablet-up desktop-sidebar" data-desktop-sidebar="true" data-collapsed="true" data-interactive="false">
          <Suspense fallback={<div className="desktop-sidebar-skeleton" />}>
            <TopNav />
          </Suspense>
        </aside>

        <div className="desktop-main">
          <div className="tablet-up desktop-page-shell">
            <header className="desktop-page-header">
              <div className="desktop-page-heading">
                <span className="desktop-page-eyebrow">{eyebrow}</span>
                <TitleTag className="desktop-page-title">{title}</TitleTag>
                <div className="desktop-page-description">{description}</div>
              </div>

              {actions ? <div className="desktop-page-actions">{actions}</div> : null}
            </header>

            {stats.length > 0 ? (
              <div className="desktop-page-stats">
                {stats.map((stat, index) => (
                  <article
                    key={`${stat.label}-${stat.value}`}
                    className="desktop-stat-card"
                    style={{ ["--desktop-stat-index" as string]: index } as CSSProperties}
                  >
                    <p className="desktop-stat-label">{stat.label}</p>
                    <p className="desktop-stat-value">{stat.value}</p>
                    {stat.hint ? <p className="desktop-stat-hint">{stat.hint}</p> : null}
                  </article>
                ))}
              </div>
            ) : null}
          </div>

          <section className="app-content-shell px-4 py-6 md:px-6 md:py-6 mobile-shell-body">
            <div className="mobile-page-label phone-only">
              <TitleTag className="sr-only">{title}</TitleTag>
              <div className="mobile-page-intro">
                <div className="mobile-page-description">{mobileDescription ?? description}</div>
                {actions ? <div className="mobile-page-actions">{actions}</div> : null}
              </div>
            </div>

            <div className="space-y-5 md:space-y-6">{children}</div>
          </section>
        </div>
      </div>

      <MobileNav />
      <BackToTopButton />
    </main>
  );
}