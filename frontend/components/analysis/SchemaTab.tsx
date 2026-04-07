import { AnalysisSchema } from "@/lib/analysisTypes";

type SchemaTabProps = {
  schema: AnalysisSchema;
};

export default function SchemaTab({ schema }: SchemaTabProps) {
  const collectColumns = (typeName: string) =>
    schema.columns.filter((column) => column.inferred_type === typeName).map((column) => column.name);

  const groups = [
    {
      title: "Identifiers",
      detail: "Likely row keys or one-value-per-record fields.",
      columns: schema.identifier_columns,
      tone: "#ffb079",
    },
    {
      title: "Target candidates",
      detail: "Fields that look plausible for supervised learning.",
      columns: schema.target_candidates,
      tone: "#8bf1a8",
    },
    {
      title: "Numeric fields",
      detail: "Measures and counts used in summaries, charts, and many models.",
      columns: collectColumns("numeric"),
      tone: "#7ad6ff",
    },
    {
      title: "Categorical fields",
      detail: "Discrete values such as plan, status, region, or segment labels.",
      columns: collectColumns("categorical"),
      tone: "#ffd76d",
    },
  ];

  return (
    <section className="analysis-tab-surface space-y-4">
      <article className="border-b border-white/6 pb-4">
        <div className="flex flex-wrap items-center gap-2">
          {Object.entries(schema.type_counts || {}).map(([label, count]) => (
            <span key={label} className="rounded-lg border border-white/10 px-3 py-1 text-xs uppercase tracking-[0.14em] text-white/68">
              {label}: {count}
            </span>
          ))}
        </div>

        <div className="mt-4 grid gap-3 lg:grid-cols-2 xl:grid-cols-4">
          {groups.map((group) => (
            <div key={group.title} className="border-b border-white/6 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{group.title}</p>
                <span className="rounded-lg px-3 py-1 text-[11px]" style={{ backgroundColor: `${group.tone}22`, color: group.tone }}>
                  {group.columns.length}
                </span>
              </div>
              <p className="mt-2 text-sm leading-6 text-white/62">{group.detail}</p>
              <div className="mt-3 flex flex-wrap gap-2">
                {group.columns.slice(0, 6).map((column) => (
                  <span key={`${group.title}-${column}`} className="rounded-lg border border-white/12 bg-white/[0.03] px-3 py-1 text-xs text-white/75">
                    {column}
                  </span>
                ))}
                {group.columns.length === 0 ? <span className="text-xs text-white/48">None detected.</span> : null}
                {group.columns.length > 6 ? <span className="text-xs text-white/48">+{group.columns.length - 6} more</span> : null}
              </div>
            </div>
          ))}
        </div>
      </article>

      {/* Tablet+: full column detail table */}
      <article className="tablet-up border-b border-white/6 pb-4">
        <div className="mt-1 overflow-x-auto">
          <table className="desktop-data-table min-w-full border-separate border-spacing-y-2 text-sm text-white/80">
            <thead>
              <tr>
                {[
                  "Column",
                  "Type",
                  "Role",
                  "Missing %",
                  "Unique %",
                  "Sample values",
                ].map((heading) => (
                  <th key={heading} className="px-3 pb-2 text-left text-xs uppercase tracking-[0.2em] text-white/40">
                    {heading}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {schema.columns.map((column) => (
                <tr key={column.name} className="bg-black/15">
                  <td className="rounded-l-xl px-3 py-3 font-medium text-white">{column.name}</td>
                  <td className="px-3 py-3">{column.inferred_type}</td>
                  <td className="px-3 py-3">{column.likely_role}</td>
                  <td className="px-3 py-3">{(column.missing_pct * 100).toFixed(1)}%</td>
                  <td className="px-3 py-3">{(column.unique_pct * 100).toFixed(1)}%</td>
                  <td className="rounded-r-xl px-3 py-3 text-white/60">{column.sample_values.join(", ") || "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </article>

      {/* Phone: compact column cards (replaces the wide table) */}
      <div className="phone-only space-y-2">
        {schema.columns.map((column) => (
          <div key={column.name} className="mobile-col-card">
            <div className="mobile-col-card-header">
              <span className="mobile-col-card-name">{column.name}</span>
              <span className="mobile-col-card-type">{column.inferred_type}</span>
            </div>
            <p className="mobile-col-card-meta">
              {column.likely_role} · {(column.missing_pct * 100).toFixed(1)}% missing · {(column.unique_pct * 100).toFixed(1)}% unique
            </p>
            {column.sample_values.length > 0 ? (
              <p className="mobile-col-card-samples">{column.sample_values.slice(0, 3).join(", ")}</p>
            ) : null}
          </div>
        ))}
      </div>
    </section>
  );
}