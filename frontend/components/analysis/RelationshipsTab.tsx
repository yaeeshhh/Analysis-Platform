import { AnalysisSchema, AnalysisStatistics } from "@/lib/analysisTypes";
import {
  formatPercent,
  getDominantCategories,
  getSkewedFields,
  getStrongestCorrelations,
} from "@/lib/analysisDerived";

type RelationshipsTabProps = {
  schema: AnalysisSchema;
  statistics: AnalysisStatistics;
};

export default function RelationshipsTab({ schema, statistics }: RelationshipsTabProps) {
  const correlations = getStrongestCorrelations(statistics);
  const skewedFields = getSkewedFields(statistics);
  const dominantCategories = getDominantCategories(statistics);

  return (
    <section className="analysis-tab-surface grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Strongest relationships</span>
            <p className="mobile-accordion-hint">Pairs of numeric columns with the highest linear correlation</p>
          </div>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {correlations.map((item) => (
              <div key={`${item.x}-${item.y}`} className="border-b border-white/6 pb-3">
                <div className="flex items-center justify-between gap-3">
                  <p className="font-medium text-white">{item.x} ↔ {item.y}</p>
                  <span className="text-xs text-white/50">corr {item.value.toFixed(3)}</span>
                </div>
                <div className="mt-3 h-2 rounded-full bg-white/8">
                  <div
                    className={`h-2 rounded-full ${item.value >= 0 ? "bg-[#7ad6ff]" : "bg-[#ff8c8c]"}`}
                    style={{ width: `${Math.min(Math.abs(item.value) * 100, 100)}%` }}
                  />
                </div>
              </div>
            ))}
            {correlations.length === 0 ? (
              <div className="py-5 text-sm text-white/48">
                Not enough numeric fields are available to surface strong correlation signals.
              </div>
            ) : null}
          </div>
        </div>
      </details>

      <div className="space-y-4">
        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Skewed numeric fields</span>
              <p className="mobile-accordion-hint">Columns with non-symmetric distributions that may need transformation</p>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 space-y-3">
              {skewedFields.map((item) => (
                <div key={item.column} className="border-b border-white/6 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.column}</p>
                    <span className="text-xs text-white/50">skew {item.skew.toFixed(2)}</span>
                  </div>
                  <p className="mt-2 text-sm text-white/62">
                    median {item.median.toFixed(2)} • q1 {item.q1.toFixed(2)} • q3 {item.q3.toFixed(2)}
                  </p>
                </div>
              ))}
              {skewedFields.length === 0 ? <p className="text-sm text-white/50">No heavily skewed numeric fields detected.</p> : null}
            </div>
          </div>
        </details>

        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Dominant categories</span>
              <p className="mobile-accordion-hint">Categorical columns where one value appears far more than others</p>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 space-y-3">
              {dominantCategories.map((item) => (
                <div key={item.column} className="border-b border-white/6 pb-3">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-medium text-white">{item.column}</p>
                    <span className="text-xs text-white/50">{item.unique_count} unique</span>
                  </div>
                  <p className="mt-2 text-sm text-white/62">
                    Most common: {item.top?.value} at {formatPercent(Number(item.top?.pct || 0) * 100)}
                  </p>
                </div>
              ))}
            </div>
          </div>
        </details>

        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#d7b7ff]">Modeling signals</span>
              <p className="mobile-accordion-hint">Inferred identifier and target columns for supervised modeling</p>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <p className="mt-3 text-sm leading-6 text-white/66">
              Identifier columns: {schema.identifier_columns.join(", ") || "none inferred"}
            </p>
            <p className="mt-2 text-sm leading-6 text-white/66">
              Target candidates: {schema.target_candidates.join(", ") || "none inferred"}
            </p>
          </div>
        </details>
      </div>
    </section>
  );
}