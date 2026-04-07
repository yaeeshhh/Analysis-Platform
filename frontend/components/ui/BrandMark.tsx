type BrandMarkProps = {
  compact?: boolean;
  withCopy?: boolean;
};

export default function BrandMark({
  compact = false,
  withCopy = true,
}: BrandMarkProps) {
  const iconSize = compact ? "h-10 w-10" : "h-14 w-14";

  return (
    <div className="flex items-center gap-3">
      <div
        className={`${iconSize} relative overflow-hidden rounded-[18px] border border-white/15 bg-[radial-gradient(circle_at_top,_rgba(255,255,255,0.24),_transparent_56%),linear-gradient(145deg,_rgba(17,39,59,0.96),_rgba(8,19,30,0.86))] shadow-[0_18px_48px_rgba(0,0,0,0.32)]`}
      >
        <div className="absolute inset-[5px] rounded-[14px] border border-white/10 bg-[linear-gradient(155deg,_rgba(122,214,255,0.22),_rgba(191,184,255,0.12)_55%,_rgba(255,255,255,0.06))]" />
        <div className="absolute left-2.5 top-2.5 h-1.5 w-1.5 rounded-full bg-[#7ad6ff] shadow-[0_0_18px_rgba(122,214,255,0.65)]" />
        <div className="absolute bottom-2.5 right-2.5 h-2 w-2 rounded-full bg-[#bfb8ff] shadow-[0_0_20px_rgba(191,184,255,0.55)]" />
        <div className="absolute inset-x-2.5 bottom-3 flex items-end gap-1.5">
          <span className="h-2.5 flex-1 rounded-full bg-[#7ad6ff]/70" />
          <span className="h-5 flex-1 rounded-full bg-white/80" />
          <span className="h-8 flex-1 rounded-full bg-[#bfb8ff]/80" />
        </div>
      </div>

      {withCopy ? (
        <div className="min-w-0">
          <p className="font-[family:var(--font-display)] text-sm font-semibold uppercase tracking-[0.24em] text-white/90">
            Analysis Studio
          </p>
          <p className="text-xs text-white/55">
            Upload, profile, visualize, and model tabular data on demand.
          </p>
        </div>
      ) : null}
    </div>
  );
}