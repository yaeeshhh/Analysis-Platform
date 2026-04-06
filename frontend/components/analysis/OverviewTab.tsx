import { AnalysisInsights, AnalysisOverview, AnalysisQuality, AnalysisSchema } from "@/lib/analysisTypes";
import { getDatasetPosture, getTypeMix } from "@/lib/analysisDerived";

type OverviewTabProps = {
  overview: AnalysisOverview;
  schema: AnalysisSchema;
  quality: AnalysisQuality;
  insights: AnalysisInsights;
};

function formatPreviewValue(value: unknown) {
  if (value === null || value === undefined || value === "") return "-";
  if (typeof value === "number") return Number.isInteger(value) ? value.toString() : value.toFixed(4);
  return String(value);
}

export default function OverviewTab({ overview, schema, quality, insights }: OverviewTabProps) {
  const previewColumns = Object.keys(overview.preview_rows?.[0] ?? {});
  const headlineFindings = insights.findings.slice(0, 3);
  const stats = [
    { label: "Rows", value: overview.row_count.toLocaleString() },
    { label: "Columns", value: overview.column_count.toLocaleString() },
    { label: "Encoding", value: overview.encoding || "unknown" },
    { label: "Missing cells", value: overview.total_missing_values.toLocaleString() },
  ];
  const typeMix = getTypeMix(schema);
  const posture = getDatasetPosture(overview, schema, quality, insights);

  return (
    <section className="space-y-4">
      <div className="grid gap-4 lg:grid-cols-[1.05fr_0.95fr]">
        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">What the data says</span>
              <p className="mobile-accordion-hint">AI-generated summary and top findings for this dataset</p>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <p className="mt-3 text-base leading-7 text-white/82">{insights.summary}</p>
            {headlineFindings.length > 0 ? (
              <div className="mt-4 space-y-3">
                {headlineFindings.map((finding) => (
                  <div key={finding} className="border-b border-white/6 pb-3 text-sm leading-6 text-white/72">
                    {finding}
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        </details>

        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Dataset posture</span>
              <p className="mobile-accordion-hint">Shape, size, type mix, and structural character of the dataset</p>
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
      </div>

      <div className="grid gap-4 md:grid-cols-4">
        {stats.map((stat) => (
          <article key={stat.label} className="border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">{stat.label}</p>
            <p className="mt-2 font-[family:var(--font-display)] text-3xl text-white">{stat.value}</p>
          </article>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-[0.9fr_1.1fr]">
        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Type mix</span>
              <p className="mobile-accordion-hint">Proportion of numeric, categorical, and other column types</p>
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

        <details className="mobile-accordion">
          <summary>
            <div className="min-w-0">
              <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Reading order</span>
              <p className="mobile-accordion-hint">Recommended tab order from plain-language summary through to ML Lab</p>
            </div>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mt-4 grid gap-3 sm:grid-cols-2">
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Overview and Insights</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Start here to understand the dataset in plain language before moving into technical detail.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Schema and Quality</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Use these tabs to validate types, roles, missingness, and cleanup work before trusting conclusions.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">Statistics and Relationships</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Move here when you want detailed summaries, patterns, and stronger structural signals.</p>
            </div>
            <div className="border-b border-white/6 pb-3">
              <p className="text-sm font-medium text-white">ML Lab</p>
              <p className="mt-2 text-sm leading-6 text-white/62">Use ML last, after the data looks clean enough and the target or exploration goal is clear.</p>
            </div>
            </div>
          </div>
        </details>
      </div>

      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Raw data</span>
            <p className="mobile-accordion-hint">First 20 rows of the uploaded dataset</p>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">First 20 rows</h3>
        <div className="mt-4 overflow-x-auto">
          <table className="min-w-full border-separate border-spacing-y-2 text-sm text-white/80">
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
    </section>
  );
}