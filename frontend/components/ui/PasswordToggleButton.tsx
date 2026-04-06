type Props = {
  shown: boolean;
  onToggle: () => void;
  variant?: "page" | "modal";
  label?: string;
};

export default function PasswordToggleButton({
  shown,
  onToggle,
  variant = "page",
  label = "password",
}: Props) {
  const cls =
    variant === "modal"
      ? "absolute right-3 top-1/2 -translate-y-1/2 text-xs text-white/60 transition hover:text-white"
      : "absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 transition hover:text-gray-200";
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cls}
      aria-label={shown ? `Hide ${label}` : `Show ${label}`}
    >
      {shown ? (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M3 3l18 18" />
          <path d="M10.58 10.58A2 2 0 0012 14a2 2 0 001.42-.58" />
          <path d="M9.88 5.09A10.94 10.94 0 0112 5c5.5 0 9.5 4.5 10 5-.24.29-1.34 1.56-3.1 2.85" />
          <path d="M6.61 6.61C4.36 8.09 2.74 10 2 10.98 2.5 11.62 6.5 16 12 16c1.61 0 3.09-.38 4.39-1.01" />
        </svg>
      ) : (
        <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="1.8">
          <path d="M2 12s4-7 10-7 10 7 10 7-4 7-10 7-10-7-10-7z" />
          <circle cx="12" cy="12" r="3" />
        </svg>
      )}
    </button>
  );
}
