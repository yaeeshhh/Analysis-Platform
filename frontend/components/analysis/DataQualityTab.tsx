import { calculateQualityScore } from "@/lib/analysisDerived";
import { AnalysisOverview, AnalysisQuality } from "@/lib/analysisTypes";

type DataQualityTabProps = {
  overview: AnalysisOverview;
  quality: AnalysisQuality;
};

export default function DataQualityTab({ overview, quality }: DataQualityTabProps) {
  const displayQualityScore = calculateQualityScore(overview, quality);
  const cards = [
    { label: "Quality score", value: displayQualityScore.toFixed(1) },
    { label: "Duplicates", value: quality.duplicate_row_count.toLocaleString() },
    { label: "Constant columns", value: quality.constant_columns.length.toString() },
    { label: "Outlier columns", value: quality.outlier_columns.length.toString() },
  ];

  return (
    <section className="space-y-4">
      <div className="dq-summary-grid grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{card.label}</p>
            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">{card.value}</p>
          </article>
        ))}
      </div>

      <article className="rounded-[24px] border border-white/10 bg-white/[0.04] p-4 text-sm leading-6 text-white/68">
        Quality score is a weighted estimate of overall dataset health. It drops for severe missingness, duplicate rows,
        constant or near-constant fields, parsing issues, strong correlations, and widespread outlier-heavy columns.
        Higher scores indicate cleaner data.
      </article>

      <div className="grid gap-4 lg:grid-cols-2">
        <details className="mobile-accordion" open>
          <summary>
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Missingness</span>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 space-y-3">
              {quality.missing_by_column.slice(0, 10).map((item) => (
                <div key={item.column}>
                  <div className="flex items-center justify-between gap-3 text-sm text-white/80">
                    <span>{item.column}</span>
                    <span>{(item.missing_pct * 100).toFixed(1)}%</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/8">
                    <div
                      className="h-2 rounded-full bg-[#7ad6ff]"
                      style={{ width: `${Math.min(item.missing_pct * 100, 100)}%` }}
                    />
                  </div>
                </div>
              ))}
              {quality.missing_by_column.length === 0 ? (
                <p className="text-sm text-white/55">No missing values detected.</p>
              ) : null}
            </div>
          </div>
        </details>

        <details className="mobile-accordion" open>
          <summary>
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Recommendations</span>
          </summary>
          <div className="mobile-accordion-body">
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/76">
              {quality.recommendations.map((item) => (
                <li key={item} className="rounded-2xl border border-white/10 bg-black/10 px-4 py-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </details>
      </div>
    </section>
  );
}