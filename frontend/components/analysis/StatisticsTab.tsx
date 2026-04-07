import { AnalysisStatistics } from "@/lib/analysisTypes";

type StatisticsTabProps = {
  statistics: AnalysisStatistics;
};

function metric(value: number) {
  return Number.isInteger(value) ? value.toString() : value.toFixed(4);
}

export default function StatisticsTab({ statistics }: StatisticsTabProps) {
  return (
    <section className="analysis-tab-surface grid gap-4 lg:grid-cols-2">
      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Numeric summary</span>
            <p className="mobile-accordion-hint">Mean, median, std, quartiles and skew for each numeric column</p>
          </div>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {statistics.numeric_summary.slice(0, 8).map((item) => (
              <div key={item.column} className="border-b border-white/6 pb-3">
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

      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Categorical summary</span>
            <p className="mobile-accordion-hint">Top values and unique counts for each text or category column</p>
          </div>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {statistics.categorical_summary.slice(0, 8).map((item) => (
              <div key={item.column} className="border-b border-white/6 pb-3">
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