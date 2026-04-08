"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  ResponsiveContainer,
  Scatter,
  ScatterChart,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { AnalysisVisualisations } from "@/lib/analysisTypes";
import { getVisualGuides, getVisualNarratives, getVisualStory } from "@/lib/analysisDerived";

type VisualisationsTabProps = {
  visualisations: AnalysisVisualisations;
  mobileSection?: string | string[] | null;
};

const chartPalette = ["#7ad6ff", "#9db8ff", "#8bf1a8", "#bfb8ff", "#d7b7ff"];
const defaultChartInitialDimension = { width: 520, height: 288 };
const chartTick = { fill: "rgba(255,255,255,0.6)", fontSize: 11 };
const verticalChartMargin = { top: 12, right: 18, bottom: 12, left: 12 };

function truncateLabel(value: string, maxLength = 18) {
  const text = value.trim();
  if (text.length <= maxLength) return text;
  return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
}

function formatAxisNumber(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) {
    return new Intl.NumberFormat(undefined, {
      notation: "compact",
      maximumFractionDigits: 1,
    }).format(value);
  }
  if (Math.abs(value) >= 10 || Number.isInteger(value)) {
    return new Intl.NumberFormat(undefined, {
      maximumFractionDigits: 0,
    }).format(value);
  }
  return new Intl.NumberFormat(undefined, {
    maximumFractionDigits: 2,
  }).format(value);
}

function formatRangeValue(value: number) {
  if (!Number.isFinite(value)) return "0";
  if (Math.abs(value) >= 1000) return formatAxisNumber(value);
  if (Math.abs(value) >= 10) return value.toFixed(1).replace(/\.0$/, "");
  return value.toFixed(2).replace(/0+$/, "").replace(/\.$/, "");
}

function formatRangeLabel(start: number, end: number) {
  return `${formatRangeValue(start)}-${formatRangeValue(end)}`;
}

function ChartGuide({
  description,
  reason,
}: {
  description: string;
  reason: string;
}) {
  return (
    <div className="mt-4 grid gap-3 sm:grid-cols-2">
      <div className="rounded-[18px] border border-white/10 bg-black/10 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-white/42">About this chart</p>
        <p className="mt-2 text-sm leading-6 text-white/64">{description}</p>
      </div>
      <div className="rounded-[18px] border border-white/10 bg-black/10 p-4">
        <p className="text-xs uppercase tracking-[0.16em] text-white/42">Significance</p>
        <p className="mt-2 text-sm leading-6 text-white/64">{reason}</p>
      </div>
    </div>
  );
}

export default function VisualisationsTab({ visualisations, mobileSection }: VisualisationsTabProps) {
  const story = getVisualStory(visualisations);
  const narratives = getVisualNarratives(visualisations);
  const guides = getVisualGuides(visualisations);
  const missingness = story.missingColumns.slice(0, 8);
  const histogram = story.histogram;
  const categories = story.category;
  const boxplots = story.boxplots;
  const heatmap = story.correlationCells;
  const pairwiseScatter = story.pairwiseScatter;
  const driftChecks = story.driftChecks;
  const heatmapColumns = Array.from(new Set(heatmap.map((item) => item.x)));
  const heatmapPreview = heatmap.filter((item) => item.x !== item.y).slice(0, 3);
  // I keep a short axis label and a full tooltip label so crowded bins still stay readable.
  const histogramData = histogram
    ? histogram.bins.map((bin) => ({
        label: formatRangeLabel(bin.start, bin.end),
        fullLabel: `${formatRangeValue(bin.start)} to ${formatRangeValue(bin.end)}`,
        count: bin.count,
      }))
    : [];
  const histogramPreview = [...histogramData].sort((left, right) => right.count - left.count).slice(0, 3);

  const show = (section: string) => !mobileSection || (Array.isArray(mobileSection) ? mobileSection.includes(section) : mobileSection === section);

  return (
    <section className="analysis-tab-surface grid gap-4 lg:grid-cols-2">
      {show("missingness") ? (
      <details className="mobile-accordion min-w-0" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Missingness</span>
            <p className="mobile-accordion-hint">Columns with the highest missing-value share</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {missingness.slice(0, 3).map((item) => (
                <div key={item.column} className="analysis-accordion-summary-row">
                  <strong>{truncateLabel(item.column, 18)}</strong>
                  <span>{item.missing_count.toLocaleString()} rows missing · {item.missing_pct.toFixed(1)}%</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">Columns with the highest missing share</h3>
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.missingness}</p>
        <ChartGuide
          description={guides.missingness.description}
          reason={guides.missingness.reason}
        />
        <div className="analysis-chart-frame mt-5 h-72 min-w-0 overflow-hidden">
          <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
            <BarChart data={missingness} layout="vertical" margin={verticalChartMargin}>
              <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
              <XAxis
                type="number"
                tick={chartTick}
                tickFormatter={(value) => `${Number(value).toFixed(0)}%`}
              />
              <YAxis
                type="category"
                dataKey="column"
                width={148}
                tick={chartTick}
                tickFormatter={(value: string) => truncateLabel(String(value), 22)}
              />
              <Tooltip
                cursor={{ fill: "rgba(255,255,255,0.05)" }}
                labelFormatter={(label) => String(label)}
                formatter={(value) => [`${Number(value).toFixed(1)}%`, "Missing share"]}
              />
              <Bar dataKey="missing_pct" radius={[0, 8, 8, 0]} minPointSize={8}>
                {missingness.map((entry, index) => (
                  <Cell key={entry.column} fill={chartPalette[index % chartPalette.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
        </div>
      </details>
      ) : null}

      {show("distribution") ? (
      <details className="mobile-accordion min-w-0" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Distribution</span>
            <p className="mobile-accordion-hint">Value distribution histogram for the most numeric-dense column</p>
            {histogramPreview.length > 0 ? (
              <div className="phone-only analysis-accordion-summary-preview">
                {histogramPreview.map((bin) => (
                  <div key={`${bin.fullLabel}-${bin.count}`} className="analysis-accordion-summary-row">
                    <strong>{truncateLabel(bin.fullLabel, 20)}</strong>
                    <span>{bin.count.toLocaleString()} rows in {histogram?.column || "the selected histogram"}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="phone-only analysis-accordion-summary-muted">No histogram preview is available for this run.</p>
            )}
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">{histogram ? `${histogram.column} histogram` : "No numeric histogram available"}</h3>
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.histogram}</p>
        <ChartGuide
          description={guides.histogram.description}
          reason={guides.histogram.reason}
        />
        <div className="analysis-chart-frame mt-5 h-72 min-w-0 overflow-visible">
          {histogram ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
              <BarChart data={histogramData} margin={{ top: 12, right: 12, bottom: 44, left: 8 }}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" vertical={false} />
                <XAxis
                  dataKey="label"
                  tick={chartTick}
                  interval={0}
                  angle={-32}
                  textAnchor="end"
                  height={56}
                  tickMargin={10}
                />
                <YAxis tick={chartTick} tickFormatter={(value) => formatAxisNumber(Number(value))} />
                <Tooltip
                  cursor={{ fill: "rgba(255,255,255,0.05)" }}
                  labelFormatter={(_, payload) => String(payload?.[0]?.payload?.fullLabel || "")}
                />
                <Bar dataKey="count" fill="#9db8ff" radius={[8, 8, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
              No numeric data available for histogram output.
            </div>
          )}
        </div>
        </div>
      </details>
      ) : null}

      {show("top-categories") ? (
      <details className="mobile-accordion min-w-0 lg:col-span-2" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Top categories</span>
            <p className="mobile-accordion-hint">Most frequent category values for the highest-cardinality column</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {categories?.values.slice(0, 3).map((item) => (
                <div key={item.label} className="analysis-accordion-summary-row">
                  <strong>{truncateLabel(item.label, 18)}</strong>
                  <span>{item.count.toLocaleString()} rows</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <h3 className="mt-2 font-[family:var(--font-display)] text-xl text-white">{categories ? `${categories.column} category distribution` : "No categorical chart available"}</h3>
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.category}</p>
        <ChartGuide
          description={guides.category.description}
          reason={guides.category.reason}
        />
        <div className="analysis-chart-frame mt-5 h-80 min-w-0 overflow-hidden">
          {categories ? (
            <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
              <BarChart data={categories.values} layout="vertical" margin={verticalChartMargin}>
                <CartesianGrid stroke="rgba(255,255,255,0.08)" horizontal={false} />
                <XAxis type="number" tick={chartTick} tickFormatter={(value) => formatAxisNumber(Number(value))} />
                <YAxis
                  type="category"
                  dataKey="label"
                  width={160}
                  tick={chartTick}
                  tickFormatter={(value: string) => truncateLabel(String(value), 24)}
                />
                <Tooltip cursor={{ fill: "rgba(255,255,255,0.05)" }} labelFormatter={(label) => String(label)} />
                <Bar dataKey="count" radius={[0, 8, 8, 0]} minPointSize={8}>
                  {categories.values.map((entry, index) => (
                    <Cell key={entry.label} fill={chartPalette[index % chartPalette.length]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="flex h-full items-center justify-center border border-dashed border-white/8 text-sm text-white/48">
              No categorical data available for category distribution output.
            </div>
          )}
        </div>
        </div>
      </details>
      ) : null}

      {show("boxplot-summary") ? (
      <details className="mobile-accordion" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#d7b7ff]">Boxplot summary</span>
            <p className="mobile-accordion-hint">Quartiles, median, and outlier counts for each numeric column</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {boxplots.slice(0, 3).map((item) => (
                <div key={item.column} className="analysis-accordion-summary-row">
                  <strong>{item.column}</strong>
                  <span>median {item.median.toFixed(2)} · {item.outlier_count} outliers</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.boxplots}</p>
        <ChartGuide
          description={guides.boxplots.description}
          reason={guides.boxplots.reason}
        />
        <div className="mt-4 space-y-3">
          {boxplots.map((item) => (
            <div key={item.column} className="border-b border-white/6 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{item.column}</p>
                <span className="text-xs text-white/50">{item.outlier_count} outliers</span>
              </div>
              <p className="mt-2 text-sm text-white/60">
                min {item.min.toFixed(2)} • q1 {item.q1.toFixed(2)} • median {item.median.toFixed(2)} • q3 {item.q3.toFixed(2)} • max {item.max.toFixed(2)}
              </p>
            </div>
          ))}
          {boxplots.length === 0 ? <p className="text-sm text-white/50">No boxplot-ready numeric fields detected.</p> : null}
        </div>
        </div>
      </details>
      ) : null}

      {show("correlation-heatmap") ? (
      <details className="mobile-accordion min-w-0" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Correlation heatmap</span>
            <p className="mobile-accordion-hint">Pearson correlations between all numeric column pairs</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {heatmapPreview.slice(0, 3).map((item) => (
                <div key={`${item.x}-${item.y}`} className="analysis-accordion-summary-row">
                  <strong>{truncateLabel(`${item.x} ↔ ${item.y}`, 22)}</strong>
                  <span>{item.value.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.correlationHeatmap}</p>
        <ChartGuide
          description={guides.correlationHeatmap.description}
          reason={guides.correlationHeatmap.reason}
        />
        <div className="mt-4 overflow-x-auto">
          {heatmapColumns.length > 1 ? (
            <div className="min-w-max space-y-2">
              <div className="grid gap-2" style={{ gridTemplateColumns: `128px repeat(${heatmapColumns.length}, minmax(76px, 1fr))` }}>
                <div />
                {heatmapColumns.map((column) => (
                  <div key={column} title={column} className="px-1 text-center text-[10px] leading-tight text-white/42">
                    <span className="mx-auto block max-w-[76px] truncate">{column}</span>
                  </div>
                ))}
                {heatmapColumns.map((row) => (
                  <div
                    key={row}
                    className="contents"
                  >
                    <div title={row} className="flex items-center pr-2 text-[10px] leading-tight text-white/42">
                      <span className="block max-w-[120px] truncate">{row}</span>
                    </div>
                    {heatmapColumns.map((column) => {
                      const cell = heatmap.find((item) => item.x === row && item.y === column);
                      const value = Number(cell?.value || 0);
                      const opacity = Math.min(Math.abs(value), 1);
                      const background = value >= 0 ? `rgba(122,214,255,${opacity})` : `rgba(255,140,140,${opacity})`;
                      const color = opacity >= 0.45 ? "#08131e" : "rgba(255,255,255,0.92)";
                      return (
                        <div
                          key={`${row}-${column}`}
                          className="flex h-11 items-center justify-center rounded-xl border border-white/8 text-[11px] font-medium"
                          style={{ background, color }}
                        >
                          {value.toFixed(2)}
                        </div>
                      );
                    })}
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <div className="py-5 text-sm text-white/48">
              Not enough numeric columns are available for a correlation heatmap.
            </div>
          )}
        </div>
        </div>
      </details>
      ) : null}

      {show("pairwise-scatter") ? (
      <details className="mobile-accordion min-w-0 lg:col-span-2" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Pairwise scatter</span>
            <p className="mobile-accordion-hint">Scatter plots for the most strongly correlated numeric pairs</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {pairwiseScatter.slice(0, 3).map((plot) => (
                <div key={`${plot.x}-${plot.y}`} className="analysis-accordion-summary-row">
                  <strong>{truncateLabel(`${plot.x} vs ${plot.y}`, 22)}</strong>
                  <span>corr {plot.correlation.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.pairwiseScatter}</p>
        <ChartGuide
          description={guides.pairwiseScatter.description}
          reason={guides.pairwiseScatter.reason}
        />
        <div className="mt-4 grid gap-4 lg:grid-cols-2">
          {pairwiseScatter.map((plot) => (
            <div key={`${plot.x}-${plot.y}`} className="min-w-0 border-b border-white/6 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{plot.x} vs {plot.y}</p>
                <span className="text-xs text-white/50">corr {plot.correlation.toFixed(3)}</span>
              </div>
              <div className="analysis-chart-frame mt-4 h-64 min-w-0 overflow-hidden">
                <ResponsiveContainer width="100%" height="100%" minWidth={0} initialDimension={defaultChartInitialDimension}>
                  <ScatterChart margin={{ top: 12, right: 18, bottom: 8, left: 8 }}>
                    <CartesianGrid stroke="rgba(255,255,255,0.08)" />
                    <XAxis
                      type="number"
                      dataKey="x"
                      tick={chartTick}
                      tickFormatter={(value) => formatAxisNumber(Number(value))}
                      name={plot.x}
                    />
                    <YAxis
                      type="number"
                      dataKey="y"
                      tick={chartTick}
                      tickFormatter={(value) => formatAxisNumber(Number(value))}
                      name={plot.y}
                    />
                    <Tooltip cursor={{ strokeDasharray: "3 3" }} />
                    <Scatter data={plot.points} fill="#7ad6ff" />
                  </ScatterChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))}
          {pairwiseScatter.length === 0 ? (
            <div className="py-6 text-sm text-white/48 lg:col-span-2">
              Not enough correlated numeric pairs were available to build scatter plots.
            </div>
          ) : null}
        </div>
        </div>
      </details>
      ) : null}

      {show("drift-checks") ? (
      <details className="mobile-accordion lg:col-span-2" open={!!mobileSection}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Drift checks</span>
            <p className="mobile-accordion-hint">Early-vs-late row slice comparison to flag distributional drift</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {driftChecks.slice(0, 3).map((item) => (
                <div key={`${item.kind}-${item.column}`} className="analysis-accordion-summary-row">
                  <strong>{item.column}</strong>
                  <span>change {item.change_score.toFixed(2)}</span>
                </div>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
        <p className="mt-3 text-sm leading-6 text-white/62">{narratives.driftChecks}</p>
        <ChartGuide
          description={guides.driftChecks.description}
          reason={guides.driftChecks.reason}
        />
        <div className="mt-4 grid gap-3 lg:grid-cols-2">
          {driftChecks.map((item) => (
            <div key={`${item.kind}-${item.column}`} className="border-b border-white/6 pb-3">
              <div className="flex items-center justify-between gap-3">
                <p className="font-medium text-white">{item.column}</p>
                <span className="text-xs text-white/50">change {item.change_score.toFixed(2)}</span>
              </div>
              {item.kind === "numeric" ? (
                <p className="mt-2 text-sm text-white/62">
                  {item.baseline_label}: {Number(item.baseline_value || 0).toFixed(2)} • {item.recent_label}: {Number(item.recent_value || 0).toFixed(2)} • delta {Number(item.delta_pct || 0).toFixed(1)}%
                </p>
              ) : (
                <p className="mt-2 text-sm text-white/62">
                  {item.baseline_label}: {item.baseline_top} ({Math.round(Number(item.baseline_share || 0) * 100)}%) • {item.recent_label}: {item.recent_top} ({Math.round(Number(item.recent_share || 0) * 100)}%)
                </p>
              )}
            </div>
          ))}
          {driftChecks.length === 0 ? (
            <div className="py-6 text-sm text-white/48 lg:col-span-2">
              There was not enough data to compare early and late slices of the dataset for drift.
            </div>
          ) : null}
        </div>
        </div>
      </details>
      ) : null}
    </section>
  );
}