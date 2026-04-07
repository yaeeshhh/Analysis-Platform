import type { ReactNode } from "react";
import BackToTopButton from "@/components/ui/BackToTopButton";
import BrandMark from "@/components/ui/BrandMark";

type AuthShellSignal = {
  label: string;
  value: string;
};

type AuthShellProps = {
  eyebrow: string;
  title: ReactNode;
  description: ReactNode;
  signals?: AuthShellSignal[];
  children: ReactNode;
};

const DEFAULT_SIGNALS: AuthShellSignal[] = [
  { label: "Model", value: "Live scoring" },
  { label: "Flow", value: "Protected actions" },
  { label: "Mode", value: "Analysis-ready" },
];

export default function AuthShell({
  eyebrow,
  title,
  description,
  signals = DEFAULT_SIGNALS,
  children,
}: AuthShellProps) {
  return (
    <div className="auth-shell text-white">
      <div className="auth-shell-inner">
        <div className="auth-shell-copy">
          <BrandMark />
          <span className="hero-pill mt-8 inline-flex">{eyebrow}</span>
          <h1 className="auth-title">{title}</h1>
          <p className="auth-description">{description}</p>

          <div className="auth-signal-grid">
            {signals.map((signal) => (
              <div key={`${signal.label}-${signal.value}`} className="auth-signal-card">
                <p className="page-stat-label">{signal.label}</p>
                <p className="mt-2 font-[family:var(--font-display)] text-lg font-semibold text-white">
                  {signal.value}
                </p>
              </div>
            ))}
          </div>
        </div>

        <div className="auth-panel">{children}</div>
      </div>

      <BackToTopButton />
    </div>
  );
}