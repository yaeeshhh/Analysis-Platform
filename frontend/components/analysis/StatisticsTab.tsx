import { AnalysisStatistics } from "@/lib/analysisTypes";

type StatisticsTabProps = {
  statistics: AnalysisStatistics;
};

function metric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}

export default function StatisticsTab({ statistics }: StatisticsTabProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-2">
      <details className="mobile-accordion" open>
        <summary>
          <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Numeric summary</span>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {statistics.numeric_summary.slice(0, 8).map((item) => (
              <div key={item.column} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.column}</p>
                  <span className="text-xs text-white/45">skew {metric(item.skew)}</span>
                </div>
                <p className="mt-2 text-sm text-white/65">
                  mean {metric(item.mean)} • median {metric(item.median)} • std {metric(item.std)}
                </p>
                <p className="mt-1 text-sm text-white/55">
                  min {metric(item.min)} • q1 {metric(item.q1)} • q3 {metric(item.q3)} • max {metric(item.max)}
                </p>
              </div>
            ))}
          </div>
        </div>
      </details>

      <details className="mobile-accordion" open>
        <summary>
          <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Categorical summary</span>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {statistics.categorical_summary.slice(0, 8).map((item) => (
              <div key={item.column} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.column}</p>
                  <span className="text-xs text-white/45">{item.unique_count} unique</span>
                </div>
                <p className="mt-2 text-sm text-white/60">
                  {item.top_values
                    .slice(0, 4)
                    .map((value) => `${value.value} (${(value.pct * 100).toFixed(1)}%)`)
                    .join(" • ")}
                </p>
              </div>
            ))}
          </div>
        </div>
      </details>
    </section>
  );
}