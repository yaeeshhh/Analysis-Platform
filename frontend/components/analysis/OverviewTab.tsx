import { AnalysisInsights, AnalysisOverview, AnalysisQuality, AnalysisSchema } from "@/lib/analysisTypes";
import { getDatasetPosture, getTypeMix } from "@/lib/analysisDerived";
import { useDesktopAccordionsExpanded } from "@/lib/useDesktopAccordionsExpanded";

type OverviewTabProps = {
  overview: AnalysisOverview;
  schema: AnalysisSchema;
  quality: AnalysisQuality;
  insights: AnalysisInsights;
  mobileSection?: string | string[] | null;
};

function formatPreviewValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  return String(value);
}

function truncatePreview(text: string, limit = 96) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export default function OverviewTab({ overview, schema, quality, insights, mobileSection }: OverviewTabProps) {
  const previewColumns = Object.keys(overview.preview_rows?.[0] ?? {});
  const stats = [
    { label: "Rows", value: overview.row_count.toLocaleString() },
    { label: "Columns", value: overview.column_count.toLocaleString() },
    { label: "Encoding", value: overview.encoding || "unknown" },
    { label: "Missing cells", value: overview.total_missing_values.toLocaleString() },
  ];
  const typeMix = getTypeMix(schema);
  const posture = getDatasetPosture(overview, schema, quality, insights);

  const show = (section: string) => !mobileSection || (Array.isArray(mobileSection) ? mobileSection.includes(section) : mobileSection === section);
  const accordionOpen = useDesktopAccordionsExpanded() || mobileSection !== undefined;

  return (
    <section className="analysis-tab-surface space-y-4">
      {show("what-the-data-says") || show("dataset-posture") ? (
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        {show("what-the-data-says") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">What the data says</span>
              <p className="mobile-accordion-hint">Plain-language summary of what your data shows</p>
              <div className="phone-only analysis-accordion-summary-preview">
                <p className="analysis-accordion-summary-text">{truncatePreview(insights.summary, 110)}</p>
              </div>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <p className="mt-3 text-base leading-7 text-white/82">{insights.summary}</p>
          </div>
        </details>
        ) : null}

        {show("dataset-posture") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Dataset posture</span>
              <p className="mobile-accordion-hint">Size, shape, and column types at a glance</p>
              <div className="phone-only analysis-accordion-summary-preview">
                {posture.slice(0, 3).map((item) => (
                  <div key={item.title} className="analysis-accordion-summary-row">
                    <strong>{item.title}</strong>
                    <span>{truncatePreview(item.detail, 84)}</span>
                  </div>
                ))}
              </div>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
              {posture.map((item) => (
                <div key={item.title} className="border-b border-white/6 pb-3">
                  <p className="text-sm font-medium text-white">{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                </div>
              ))}
            </div>
          </div>
        </details>
        ) : null}
      </div>
      ) : null}

      {!mobileSection ? (
      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{stat.label}</p>
            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">{stat.value}</p>
          </article>
        ))}
      </div>
      ) : null}

      {show("type-mix") || show("reading-order") ? (
      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        {show("type-mix") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Type mix</span>
              <p className="mobile-accordion-hint">How the columns break down by type</p>
              <div className="phone-only analysis-accordion-summary-preview">
                {typeMix.slice(0, 3).map((item) => (
                  <div key={item.label} className="analysis-accordion-summary-row">
                    <strong>{item.label}</strong>
                    <span>{item.count} columns · {item.pct.toFixed(1)}% of profiled fields</span>
                  </div>
                ))}
              </div>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 space-y-3">
              {typeMix.map((item) => (
                <div key={item.label}>
                  <div className="flex items-center justify-between gap-3 text-sm text-white/78">
                    <span>{item.label}</span>
                    <span>{item.count} columns</span>
                  </div>
                  <div className="mt-2 h-2 rounded-full bg-white/8">
                    <div className="h-2 rounded-full bg-[#7ad6ff]" style={{ width: `${Math.min(item.pct, 100)}%` }} />
                  </div>
                </div>
              ))}
            </div>
          </div>
        </details>
        ) : null}

        {show("reading-order") ? (
        <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Reading order</span>
              <p className="mobile-accordion-hint">Where to start and how to work through the report</p>
              <div className="phone-only analysis-accordion-summary-chip-list">
                {[
                  "Overview first",
                  "Validate schema",
                  "Check quality",
                  "Use ML last",
                ].map((item) => (
                  <span key={item} className="analysis-accordion-summary-chip">{item}</span>
                ))}
              </div>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Overview and Insights</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Start here for the quick summary before diving deeper.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Schema and Quality</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Check column types, missing values, and cleanup flags before drawing conclusions.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Statistics and Relationships</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Go here for deeper patterns, correlations, and numeric detail.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">ML Lab</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Try ML once the data looks clean and you know what you want to predict or explore.</p>
            </div>
            </div>
          </div>
        </details>
        ) : null}
      </div>
      ) : null}

      {show("raw-data") ? (
  <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Raw data</span>
            <p className="mobile-accordion-hint">First 20 rows of the uploaded dataset</p>
            <p className="phone-only analysis-accordion-summary-text">
              {overview.preview_rows.length} sampled rows · {previewColumns.length} visible columns in the raw-data preview.
            </p>
            <div className="phone-only analysis-accordion-summary-chip-list">
              {previewColumns.slice(0, 4).map((column) => (
                <span key={column} className="analysis-accordion-summary-chip">{column}</span>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">First 20 rows</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="analysis-preview-table desktop-data-table min-w-full border-separate border-spacing-y-2 text-sm text-white/80">
            <thead>
              <tr>
                {previewColumns.map((column) => (
                  <th key={column} className="px-3 pb-2 text-left text-xs uppercase tracking-[0.2em] text-white/40">
                    {column}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {overview.preview_rows.map((row, index) => (
                <tr key={index} className="bg-black/15">
                  {previewColumns.map((column) => (
                    <td key={column} className="max-w-[220px] truncate rounded-xl px-3 py-2 align-top text-white/76">
                      {formatPreviewValue(row[column])}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        </div>
      </details>
      ) : null}
    </section>
  );
}