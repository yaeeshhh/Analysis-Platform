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
          <Suspense fallback={<div className="mb-6 h-16 rounded-[28px] border border-white/8 bg-white/[0.03]" />}>
            <TopNav />
          </Suspense>
        </div>

        {/* Desktop hero — hidden on phone, visible on tablet+ */}
        <div className={`page-hero tablet-up mb-6 ${stats.length > 0 ? "page-hero-with-stats" : ""}`}>
          <div className="page-hero-copy">
            <span className="hero-pill">{eyebrow}</span>
            <TitleTag className="page-title">{title}</TitleTag>
            <div className="page-description">{description}</div>
            {actions ? <div className="page-actions">{actions}</div> : null}
          </div>

          {stats.length > 0 ? (
            <div className="page-stat-grid">
              {stats.map((stat) => (
                <div key={`${stat.label}-${stat.value}`} className="page-stat-card">
                  <p className="page-stat-label">{stat.label}</p>
                  <p className="page-stat-value">{stat.value}</p>
                  {stat.hint ? <p className="page-stat-hint">{stat.hint}</p> : null}
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