type BrandMarkProps = {
  compact?: boolean;
  withCopy?: boolean;
  withTagline?: boolean;
  className?: string;
};

export default function BrandMark({
  compact = false,
  withCopy = true,
  withTagline = true,
  className = "",
}: BrandMarkProps) {
  const gapClassName = compact ? "gap-2.5" : "gap-3";

  return (
    <span className={`brandmark-root inline-flex shrink-0 items-center ${gapClassName} ${className}`.trim()}>
      <span aria-label="Analysis Studio logo" className="inline-flex shrink-0 items-center justify-center" role="img">
        <svg
          viewBox="0 0 512 512"
          className="h-11 w-11 shrink-0"
          fill="none"
          xmlns="http://www.w3.org/2000/svg"
        >
          <rect x="18" y="18" width="476" height="476" rx="72" fill="#202643" stroke="#5673FF" strokeWidth="8" />
          <rect x="34" y="34" width="444" height="444" rx="60" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />
          <rect x="110" y="248" width="60" height="128" rx="12" fill="#4357B5" />
          <rect x="196" y="184" width="60" height="192" rx="12" fill="#4D63D8" />
          <rect x="282" y="118" width="60" height="258" rx="12" fill="#5776FF" />
          <rect x="368" y="208" width="60" height="168" rx="12" fill="#4357B5" />
          <path d="M140 222L226 160L312 114L398 184" stroke="#B7C5FF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
          <circle cx="140" cy="222" r="12" fill="#B7C5FF" />
          <circle cx="226" cy="160" r="12" fill="#B7C5FF" />
          <circle cx="312" cy="114" r="12" fill="#B7C5FF" />
          <circle cx="398" cy="184" r="12" fill="#B7C5FF" />
        </svg>
      </span>

      {withCopy ? (
        <span className="min-w-0">
          <span className="block font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.24em] text-white/90">
            Analysis Studio
          </span>
          {withTagline ? (
            <span className="block text-xs text-white/55">
              Data, insights, and model workflows for tabular analysis.
            </span>
          ) : null}
        </span>
      ) : null}
    </span>
  );
}