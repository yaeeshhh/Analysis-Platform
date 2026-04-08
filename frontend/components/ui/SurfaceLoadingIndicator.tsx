type SurfaceLoadingIndicatorProps = {
  label: string;
  compact?: boolean;
  className?: string;
};

export default function SurfaceLoadingIndicator({
  label,
  compact = false,
  className = "",
}: SurfaceLoadingIndicatorProps) {
  const classNames = [
    "surface-loading",
    compact ? "surface-loading-compact" : "",
    className,
  ]
    .filter(Boolean)
    .join(" ");

  return (
    <div className={classNames} role="status" aria-live="polite">
      <span className="surface-loading-spinner" aria-hidden="true" />
      <span className="surface-loading-label">{label}</span>
    </div>
  );
}