import type { ReactNode } from "react";
import BackToTopButton from "@/components/ui/BackToTopButton";
import BrandMark from "@/components/ui/BrandMark";
import { commitMobileTextFieldAndCloseKeyboard } from "@/lib/helpers";

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
        <div className="auth-shell-copy" style={{ position: "relative", overflow: "hidden" }}>
          {/* Motif — particle field */}
          <svg viewBox="0 0 300 175" style={{ position: "absolute", top: 0, right: 0, width: 220, height: 130, opacity: 0.07, pointerEvents: "none" }} aria-hidden="true">
            <circle cx="30" cy="40" r="2" fill="#8fd3c1"/><circle cx="80" cy="20" r="1.5" fill="#8fd3c1"/>
            <circle cx="140" cy="55" r="2.5" fill="#f2c38b"/><circle cx="200" cy="30" r="1.5" fill="#8fd3c1"/>
            <circle cx="250" cy="70" r="2" fill="#f2c38b"/><circle cx="60" cy="90" r="1.5" fill="#8fd3c1"/>
            <circle cx="170" cy="100" r="2" fill="#f2c38b"/><circle cx="110" cy="130" r="1.5" fill="#8fd3c1"/>
            <circle cx="220" cy="120" r="2" fill="#8fd3c1"/><circle cx="270" cy="140" r="1.5" fill="#f2c38b"/>
            <circle cx="45" cy="150" r="2" fill="#f2c38b"/><circle cx="160" cy="160" r="1.5" fill="#8fd3c1"/>
            <line x1="30" y1="40" x2="80" y2="20" stroke="#8fd3c1" strokeWidth="0.5"/>
            <line x1="80" y1="20" x2="140" y2="55" stroke="#8fd3c1" strokeWidth="0.5"/>
            <line x1="140" y1="55" x2="200" y2="30" stroke="#f2c38b" strokeWidth="0.5"/>
            <line x1="200" y1="30" x2="250" y2="70" stroke="#8fd3c1" strokeWidth="0.5"/>
            <line x1="60" y1="90" x2="170" y2="100" stroke="#f2c38b" strokeWidth="0.5"/>
            <line x1="110" y1="130" x2="220" y2="120" stroke="#8fd3c1" strokeWidth="0.5"/>
          </svg>
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

        <div className="auth-panel" onKeyDownCapture={commitMobileTextFieldAndCloseKeyboard}>{children}</div>
      </div>

      <BackToTopButton />
    </div>
  );
}