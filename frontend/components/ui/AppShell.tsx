import { Suspense, type ReactNode } from "react";
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
  stats?: AppShellStat[];
  actions?: ReactNode;
  titleTag?: "h1" | "div";
  children: ReactNode;
};

export default function AppShell({
  eyebrow,
  title,
  description,
  stats = [],
  actions,
  titleTag = "h1",
  children,
}: AppShellProps) {
  const TitleTag = titleTag;

  return (
    <main className="app-shell min-h-screen text-white">
      {/* Mobile-only thin top header */}
      <MobileHeader />

      <section className="mx-auto max-w-7xl px-4 py-6 md:px-6 md:py-8 mobile-shell-body">
        {/* Desktop sticky nav — tablet+ only */}
        <div className="tablet-up">
          <Suspense fallback={<div className="h-12 border-b border-white/6" />}>
            <TopNav />
          </Suspense>
        </div>

        {/* Desktop hero — hidden on phone, visible on tablet+ */}
        <div className={`page-hero tablet-up mb-4 mt-6`}>
          <div className="page-hero-copy">
            <span className="hero-pill">{eyebrow}</span>
            <TitleTag className="page-title" style={{ fontSize: "clamp(1.3rem, 2.2vw, 1.8rem)" }}>{title}</TitleTag>
            <div className="page-description">{description}</div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </div>

          {stats.length > 0 ? (
            <div className="stat-row mt-4">
              {stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`} className="stat-row-item">
                  <p className="stat-row-value">{stat.value}</p>
                  <p className="stat-row-label">{stat.label}</p>
                </div>
              ))}
            </div>
          ) : null}
        </div>

        {/* Phone-only compact page label */}
        <div className="mobile-page-label phone-only">
          <span className="hero-pill">{eyebrow}</span>
          {actions ? <div className="page-actions mt-3">{actions}</div> : null}
        </div>

        <div className="space-y-4 md:space-y-6">{children}</div>
      </section>

      {/* Mobile-only fixed bottom navigation */}
      <MobileNav />
    </main>
  );
}