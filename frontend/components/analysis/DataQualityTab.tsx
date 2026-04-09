import { calculateQualityScore } from "@/lib/analysisDerived";
import { AnalysisOverview, AnalysisQuality } from "@/lib/analysisTypes";
import { useDesktopAccordionsExpanded } from "@/lib/useDesktopAccordionsExpanded";

type DataQualityTabProps = {
  overview: AnalysisOverview;
  quality: AnalysisQuality;
  mobileSection?: string | string[] | null;
};

export default function DataQualityTab({ overview, quality, mobileSection }: DataQualityTabProps) {
  const displayQualityScore = calculateQualityScore(overview, quality);
  const cards = [
    { label: "Quality score", value: displayQualityScore.toFixed(1) },
    { label: "Duplicates", value: quality.duplicate_row_count.toLocaleString() },
    { label: "Constant columns", value: quality.constant_columns.length.toString() },
    { label: "Outlier columns", value: quality.outlier_columns.length.toString() },
  ];

  const show = (section: string) => !mobileSection || (Array.isArray(mobileSection) ? mobileSection.includes(section) : mobileSection === section);
  const accordionOpen = useDesktopAccordionsExpanded() || mobileSection !== undefined;

  return (
    <section className="analysis-tab-surface space-y-4">
      {!mobileSection ? (
      <>
      <div className="dq-summary-grid grid gap-4 md:grid-cols-4">
        {cards.map((card) => (
          <article key={card.label} className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{card.label}</p>
            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">{card.value}</p>
          </article>
        ))}
      </div>

      <article className="border-b border-white/6 pb-3 text-sm leading-6 text-white/68">
        Quality score is a weighted estimate of overall dataset health. It drops for severe missingness, duplicate rows,
        constant or near-constant fields, parsing issues, strong correlations, and widespread outlier-heavy columns.
        Higher scores indicate cleaner data.
      </article>
      </>
      ) : null}

      <div className="grid gap-4 lg:grid-cols-2">
        {show("missingness") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Missingness</span>
              <p className="mobile-accordion-hint">How many values are missing per column, shown as a percentage and fill bar</p>
              <div className="phone-only analysis-accordion-summary-preview">
                {quality.missing_by_column.slice(0, 3).map((item) => (
                  <div key={item.column} className="analysis-accordion-summary-row">
                    <strong>{item.column}</strong>
                    <span>{item.missing_count.toLocaleString()} missing · {(item.missing_pct * 100).toFixed(1)}% of rows</span>
                  </div>
                ))}
                {quality.missing_by_column.length === 0 ? (
                  <p className="analysis-accordion-summary-text">No missing-value hotspots were detected in the saved scan.</p>
                ) : null}
              </div>
            </div>
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
        ) : null}

        {show("recommendations") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Recommendations</span>
              <p className="mobile-accordion-hint">Suggested actions to clean and improve overall dataset quality</p>
              <div className="phone-only analysis-accordion-summary-preview">
                {quality.recommendations.slice(0, 3).map((item) => (
                  <p key={item} className="analysis-accordion-summary-text">{item}</p>
                ))}
                <div className="analysis-accordion-summary-chip-list">
                  <span className="analysis-accordion-summary-chip">{quality.duplicate_row_count.toLocaleString()} duplicates</span>
                  <span className="analysis-accordion-summary-chip">{quality.constant_columns.length} constant columns</span>
                  <span className="analysis-accordion-summary-chip">{quality.outlier_columns.length} outlier-heavy fields</span>
                </div>
              </div>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <ul className="mt-4 space-y-3 text-sm leading-6 text-white/76">
              {quality.recommendations.map((item) => (
                <li key={item} className="border-b border-white/6 pb-3">
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </details>
        ) : null}
      </div>
    </section>
  );
}