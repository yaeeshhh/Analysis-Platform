type Props = {
  barClassName: string;
  progressPercent: number;
  show: boolean;
  message?: string | null;
  showMessage?: boolean;
  textClassName?: string;
  barMarginTop?: boolean;
  smallText?: boolean;
};

export default function PasswordStrengthBar({
  barClassName,
  progressPercent,
  show,
  message,
  showMessage,
  textClassName,
  barMarginTop = false,
  smallText = false,
}: Props) {
  if (!show) return null;
  return (
    <>
      <div className={`${barMarginTop ? "mt-2 " : ""}h-1.5 w-full overflow-hidden rounded-full bg-white/10`}>
        <div
          className={`h-full rounded-full transition-all duration-300 ${barClassName}`}
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      {showMessage && message && (
        <p className={smallText ? `text-[11px] leading-5 ${textClassName ?? ""}` : `mt-1 text-xs ${textClassName ?? ""}`}>
          {message}
        </p>
      )}
    </>
  );
}
