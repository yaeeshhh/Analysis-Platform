type BrandMarkProps = {
  compact?: boolean;
  withCopy?: boolean;
  className?: string;
};

export default function BrandMark({
  compact = false,
  withCopy = true,
  className = "",
}: BrandMarkProps) {
  const showWordmark = !compact && withCopy;
  const sizeClassName = compact
    ? "h-11 w-11"
    : showWordmark
      ? "h-[10.75rem] w-[10.75rem] sm:h-[11.5rem] sm:w-[11.5rem]"
      : "h-14 w-14";

  return (
    <span
      aria-label="Analysis Studio logo"
      className={`brandmark-root inline-flex shrink-0 items-center justify-center ${className}`.trim()}
      role="img"
    >
      <svg
        viewBox="0 0 512 512"
        className={sizeClassName}
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
      >
        <rect x="18" y="18" width="476" height="476" rx="72" fill="#202643" stroke="#5673FF" strokeWidth="8" />
        <rect x="34" y="34" width="444" height="444" rx="60" stroke="rgba(255,255,255,0.08)" strokeWidth="2" />

        {showWordmark ? (
          <>
            <rect x="128" y="228" width="52" height="104" rx="11" fill="#4357B5" />
            <rect x="200" y="172" width="52" height="160" rx="11" fill="#4D63D8" />
            <rect x="272" y="116" width="52" height="216" rx="11" fill="#5776FF" />
            <rect x="344" y="200" width="52" height="132" rx="11" fill="#4357B5" />
            <path d="M154 214L226 160L298 114L370 176" stroke="#B7C5FF" strokeWidth="10" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="154" cy="214" r="10" fill="#B7C5FF" />
            <circle cx="226" cy="160" r="10" fill="#B7C5FF" />
            <circle cx="298" cy="114" r="10" fill="#B7C5FF" />
            <circle cx="370" cy="176" r="10" fill="#B7C5FF" />
            <text
              x="256"
              y="392"
              fill="#F5F7FF"
              fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fontSize="46"
              fontWeight="700"
              letterSpacing="-2.4"
              textAnchor="middle"
            >
              Analysis Studio
            </text>
            <text
              x="256"
              y="435"
              fill="#CBD3E6"
              fontFamily="system-ui, -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif"
              fontSize="18"
              fontWeight="600"
              letterSpacing="7.5"
              textAnchor="middle"
            >
              DATA · INSIGHTS · CLARITY
            </text>
          </>
        ) : (
          <>
            <rect x="110" y="248" width="60" height="128" rx="12" fill="#4357B5" />
            <rect x="196" y="184" width="60" height="192" rx="12" fill="#4D63D8" />
            <rect x="282" y="118" width="60" height="258" rx="12" fill="#5776FF" />
            <rect x="368" y="208" width="60" height="168" rx="12" fill="#4357B5" />
            <path d="M140 222L226 160L312 114L398 184" stroke="#B7C5FF" strokeWidth="12" strokeLinecap="round" strokeLinejoin="round" />
            <circle cx="140" cy="222" r="12" fill="#B7C5FF" />
            <circle cx="226" cy="160" r="12" fill="#B7C5FF" />
            <circle cx="312" cy="114" r="12" fill="#B7C5FF" />
            <circle cx="398" cy="184" r="12" fill="#B7C5FF" />
          </>
        )}
      </svg>
    </span>
  );
}