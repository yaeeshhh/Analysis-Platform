"use client";

import { lazy, type ReactNode, Suspense, useEffect, useRef, useState } from "react";
const DataQualityTab = lazy(() => import("@/components/analysis/DataQualityTab"));
const InsightsTab = lazy(() => import("@/components/analysis/InsightsTab"));
const MLTab = lazy(() => import("@/components/analysis/MLTab"));
const OverviewTab = lazy(() => import("@/components/analysis/OverviewTab"));
const RelationshipsTab = lazy(() => import("@/components/analysis/RelationshipsTab"));
const SchemaTab = lazy(() => import("@/components/analysis/SchemaTab"));
const StatisticsTab = lazy(() => import("@/components/analysis/StatisticsTab"));
const VisualisationsTab = lazy(() => import("@/components/analysis/VisualisationsTab"));
import BackToTopButton from "@/components/ui/BackToTopButton";
import { calculateQualityScore } from "@/lib/analysisDerived";
import { AnalysisReport, MlExperimentSummary, SupervisedResult, UnsupervisedResult } from "@/lib/analysisTypes";
import { formatDate } from "@/lib/helpers";

type AnalysisResultPopupProps = {
  open: boolean;
  loading: boolean;
  error: string;
  report: AnalysisReport | null;
  savedAt?: string;
  onClose: () => void;
  onDownloadReport: () => void;
  onRunUnsupervised: (nClusters: number) => Promise<UnsupervisedResult>;
  onRunSupervised: (targetColumn: string) => Promise<SupervisedResult>;
  onDeleteExperiment: (experiment: MlExperimentSummary) => Promise<void>;
};

const sections = [
  { id: "overview", label: "Summary", note: "Posture, findings, and sample rows" },
  { id: "insights", label: "Findings", note: "Summary, findings, and next steps" },
  { id: "schema", label: "Fields", note: "Types, roles, and column inventory" },
  { id: "quality", label: "Quality", note: "Missingness, duplicates, and fixes" },
  { id: "statistics", label: "Statistics", note: "Numeric and categorical summaries" },
  { id: "relationships", label: "Patterns", note: "Correlations, skew, and targets" },
  { id: "visualisations", label: "Charts", note: "Distribution, heatmap, and drift views" },
  { id: "ml", label: "ML Lab", note: "Saved experiments and benchmark outputs" },
] as const;

type PopupSectionId = (typeof sections)[number]["id"];

type PopupCardSubtab = { section: string | string[]; label: string; tab?: PopupSectionId };
type PopupCard = {
  key: string;
  label: string;
  description: string;
  icon: string;
  defaultTab: PopupSectionId;
  subtabs?: PopupCardSubtab[];
};

const popupCards: PopupCard[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Findings, dataset profile, next steps, and raw data preview.",
    icon: "📊",
    defaultTab: "overview",
    subtabs: [
      { section: ["dataset-posture", "type-mix"], label: "Profile" },
      { section: "what-to-do-next", label: "Next steps", tab: "insights" },
      { section: "raw-data", label: "Raw data" },
    ],
  },
  {
    key: "data-health",
    label: "Data Health",
    description: "Missing values, recommendations, numeric and categorical summaries.",
    icon: "🩺",
    defaultTab: "quality",
    subtabs: [
      { section: ["missingness", "recommendations"], label: "Quality" },
      { section: ["numeric-summary", "categorical-summary"], label: "Statistics", tab: "statistics" },
    ],
  },
  {
    key: "schema",
    label: "Schema",
    description: "Column inventory, correlations, skew, dominance, and modeling signals.",
    icon: "🗂️",
    defaultTab: "schema",
    subtabs: [
      { section: "__all__", label: "Fields" },
      { section: ["strongest-relationships", "skewed-numeric-fields", "dominant-categories", "modeling-signals"], label: "Patterns", tab: "relationships" },
    ],
  },
  {
    key: "charts",
    label: "Charts",
    description: "Missingness, distributions, categories, correlations, and drift.",
    icon: "📈",
    defaultTab: "visualisations",
    subtabs: [
      { section: "missingness", label: "Missing" },
      { section: ["distribution", "boxplot-summary"], label: "Distributions" },
      { section: "top-categories", label: "Categories" },
      { section: ["correlation-heatmap", "pairwise-scatter"], label: "Correlations" },
      { section: "drift-checks", label: "Drift" },
    ],
  },
  {
    key: "ml",
    label: "ML Lab",
    description: "Saved experiments and benchmark outputs.",
    icon: "🧪",
    defaultTab: "ml",
  },
];

function hasRenderableReport(report: AnalysisReport | null) {
  return Boolean(
    report &&
      (report.overview.row_count > 0 ||
        report.overview.column_count > 0 ||
        report.schema.columns.length > 0 ||
        report.statistics.numeric_summary.length > 0 ||
        report.statistics.categorical_summary.length > 0)
  );
}

function SectionFrame({ id, title, note, accent, children }: { id: string; title: string; note: string; accent?: string; children: ReactNode }) {
  return (
    <section
      id={`history-popup-${id}`}
      className="history-popup-section popup-section-target desktop-tab-accent-wrapper"
      style={accent ? { "--analysis-card-accent": accent, "--analysis-card-border": `${accent}33` } as React.CSSProperties : undefined}
    >
      <div className="history-popup-section-header">
        <div>
          <h3 className="history-popup-section-title" style={accent ? { color: `color-mix(in srgb, ${accent} 68%, white)` } : undefined}>{title}</h3>
          <p className="history-popup-section-note">{note}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

export default function AnalysisResultPopup({
  open,
  loading,
  error,
  report,
  savedAt,
  onClose,
  onDownloadReport,
  onRunUnsupervised,
  onRunSupervised,
  onDeleteExperiment,
}: AnalysisResultPopupProps) {
  const [activeSectionId, setActiveSectionId] = useState<PopupSectionId>("overview");
  const [mobileCardOpen, setMobileCardOpen] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement | null>(null);

  const ready = hasRenderableReport(report);

  useEffect(() => {
    if (!open || !ready) return;

    const container = scrollContainerRef.current;
    if (!container) return;

    const sectionElements = sections
      .map((section) => document.getElementById(`history-popup-${section.id}`))
      .filter((section): section is HTMLElement => !!section);

    const updateActiveSection = () => {
      const containerTop = container.getBoundingClientRect().top;
      let nextSectionId: PopupSectionId = sections[0].id;

      for (const section of sectionElements) {
        const rect = section.getBoundingClientRect();
        if (rect.top - containerTop <= 148) {
          nextSectionId = section.id.replace("history-popup-", "") as PopupSectionId;
        } else {
          break;
        }
      }

      setActiveSectionId((current) => (current === nextSectionId ? current : nextSectionId));
    };

    const frame = window.requestAnimationFrame(updateActiveSection);
    container.addEventListener("scroll", updateActiveSection, { passive: true });
    window.addEventListener("resize", updateActiveSection);

    return () => {
      window.cancelAnimationFrame(frame);
      container.removeEventListener("scroll", updateActiveSection);
      window.removeEventListener("resize", updateActiveSection);
    };
  }, [open, ready, report?.analysis_id]);

  function handleScrollToSection(sectionId: PopupSectionId) {
    setActiveSectionId(sectionId);
    const container = scrollContainerRef.current;
    const section = document.getElementById(`history-popup-${sectionId}`);
    if (!section) {
      return;
    }

    if (!container) {
      section.scrollIntoView({ behavior: "smooth", block: "start" });
      return;
    }

    const containerRect = container.getBoundingClientRect();
    const sectionRect = section.getBoundingClientRect();
    const nextTop = container.scrollTop + (sectionRect.top - containerRect.top) - 12;

    container.scrollTo({ top: Math.max(0, nextTop), behavior: "smooth" });
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[135] bg-[#04090d]/82 backdrop-blur-md history-popup-overlay"
      onMouseDown={onClose}
    >
      <div
        className="history-popup-container"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div ref={scrollContainerRef} className="history-popup-scroll">
          {/* ── Header (hidden when a mobile card is open) ── */}
          <div className={`history-popup-header-card${mobileCardOpen ? " history-popup-header-hidden" : ""}`}>
            <div className="history-popup-header-row">
              <div className="history-popup-header-info">
                <p className="history-popup-header-kicker">Archived report</p>
                <h2 className="history-popup-header-title">
                  {report ? report.overview.dataset_name : "Saved run details"}
                </h2>
              </div>
              <div className="history-popup-header-actions">
                {report ? (
                  <button
                    type="button"
                    onClick={onDownloadReport}
                    className="history-popup-btn history-popup-btn-secondary"
                  >
                    Download
                  </button>
                ) : null}
                <button
                  type="button"
                  onClick={onClose}
                  className="history-popup-btn history-popup-btn-close"
                >
                  Close
                </button>
              </div>
            </div>

            {report ? (
              <div className="history-popup-stat-grid">
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">Saved</p>
                  <p className="history-popup-stat-value">{savedAt ? formatDate(savedAt) : "—"}</p>
                </div>
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">Rows</p>
                  <p className="history-popup-stat-value">{report.overview.row_count.toLocaleString()}</p>
                </div>
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">Columns</p>
                  <p className="history-popup-stat-value">{report.overview.column_count.toLocaleString()}</p>
                </div>
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">Quality</p>
                  <p className="history-popup-stat-value">{calculateQualityScore(report.overview, report.quality).toFixed(1)}</p>
                </div>
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">Readiness</p>
                  <p className="history-popup-stat-value">{report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}</p>
                </div>
                <div className="history-popup-stat-card">
                  <p className="history-popup-stat-label">ML runs</p>
                  <p className="history-popup-stat-value">{report.ml_experiments.length}</p>
                </div>
              </div>
            ) : null}

            {/* Desktop/tablet: Jump to section dropdown */}
            {report && ready ? (
              <div className="history-popup-jump tablet-up">
                <label className="history-popup-select-shell">
                  <span className="history-popup-select-label">Jump to section</span>
                  <select
                    value={activeSectionId}
                    onChange={(event) => handleScrollToSection(event.target.value as PopupSectionId)}
                    className="history-popup-select"
                  >
                    {sections.map((section) => (
                      <option key={`select-${section.id}`} value={section.id}>
                        {section.label}
                      </option>
                    ))}
                  </select>
                </label>
              </div>
            ) : null}
          </div>

          {loading ? (
            <div className="py-10 text-center text-sm text-white/55">
              Loading saved run details...
            </div>
          ) : null}

          {!loading && error ? (
            <div className="border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffe1e1]">
              {error}
            </div>
          ) : null}

          {!loading && !error && !report ? (
            <div className="py-10 text-center text-sm text-white/48">
              Pick a saved run from History to open the popup.
            </div>
          ) : null}

          {!loading && !error && report && !ready ? (
            <div className="border-l-2 border-[#ffb079]/40 pl-4 text-sm text-[#ffe7d7]">
              <p className="font-semibold text-white">This saved run is missing part of the report.</p>
              <p className="mt-2 leading-6 text-white/72">
                The history popup loaded the record, but the full section stack is not available for this run. Download the saved report to view the readable text summary.
              </p>
            </div>
          ) : null}

          {/* ── Phone: card-based navigation ── */}
          {!loading && !error && report && ready ? (
            <div className="phone-only">
              <PopupMobileCards
                key={report.analysis_id}
                report={report}
                onCardOpenChange={setMobileCardOpen}
                onRunUnsupervised={onRunUnsupervised}
                onRunSupervised={onRunSupervised}
                onDeleteExperiment={onDeleteExperiment}
              />
            </div>
          ) : null}

          {/* ── Tablet/Desktop: long scroll with section frames ── */}
          {!loading && !error && report && ready ? (
            <div className="history-popup-content tablet-up">
              <Suspense fallback={<div className="py-12 text-center text-sm text-white/40">Loading tab…</div>}>
              <SectionFrame id="overview" title="Overview" note="Dataset posture, summary, and preview rows." accent="#4f6ef7">
                <OverviewTab
                  overview={report.overview}
                  schema={report.schema}
                  quality={report.quality}
                  insights={report.insights}
                />
              </SectionFrame>

              <SectionFrame id="insights" title="Insights" note="Plain-language findings and recommended next steps." accent="#4f6ef7">
                <InsightsTab insights={report.insights} />
              </SectionFrame>

              <SectionFrame id="schema" title="Schema" note="Column roles, inferred types, and field inventory." accent="#a78bfa">
                <SchemaTab schema={report.schema} />
              </SectionFrame>

              <SectionFrame id="quality" title="Data Quality" note="Missingness, duplicates, and cleanup direction." accent="#22c55e">
                <DataQualityTab overview={report.overview} quality={report.quality} />
              </SectionFrame>

              <SectionFrame id="statistics" title="Statistics" note="Numeric and categorical summaries for key columns." accent="#22c55e">
                <StatisticsTab statistics={report.statistics} />
              </SectionFrame>

              <SectionFrame id="relationships" title="Relationships" note="Correlation signals, skew, and modeling cues." accent="#f59e0b">
                <RelationshipsTab schema={report.schema} statistics={report.statistics} />
              </SectionFrame>

              <SectionFrame id="visualisations" title="Charts" note="Distribution views, heatmap signals, and drift checks." accent="#f59e0b">
                <VisualisationsTab visualisations={report.visualisations} />
              </SectionFrame>

              <SectionFrame id="ml" title="ML Lab" note="Saved benchmarks, downloads, and experiment details." accent="#f43f5e">
                <MLTab
                  key={`${report.analysis_id}:${report.ml_experiments.map((experiment) => experiment.id).join("|")}`}
                  analysisId={report.analysis_id}
                  capabilities={report.ml_capabilities}
                  experiments={report.ml_experiments || []}
                  readiness={report.insights.modeling_readiness}
                  initialUnsupervised={report.ml_results.unsupervised}
                  initialSupervised={report.ml_results.supervised}
                  onRunUnsupervised={onRunUnsupervised}
                  onRunSupervised={onRunSupervised}
                  onDeleteExperiment={onDeleteExperiment}
                />
              </SectionFrame>
              </Suspense>
            </div>
          ) : null}
        </div>
      </div>

      <div
        onMouseDown={(event) => event.stopPropagation()}
        onClick={(event) => event.stopPropagation()}
      >
        <BackToTopButton
          scrollContainerRef={scrollContainerRef}
          threshold={320}
          className="bottom-5 right-5 z-[145] sm:bottom-6 sm:right-6"
        />
      </div>
    </div>
  );
}

/* ── Sub-component for mobile card navigation (state resets via key) ── */

type PopupMobileCardsProps = {
  report: AnalysisReport;
  onCardOpenChange: (isOpen: boolean) => void;
  onRunUnsupervised: (nClusters: number) => Promise<UnsupervisedResult>;
  onRunSupervised: (targetColumn: string) => Promise<SupervisedResult>;
  onDeleteExperiment: (experiment: MlExperimentSummary) => Promise<void>;
};

/* ── Shared SVG card covers (popup reuses the same art) ── */
const popupCardCovers: Record<string, React.ReactElement> = {
  overview: (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="130" fill="#1a1f36"/>
      <circle cx="260" cy="16" r="65" fill="#2d3f8a" opacity="0.5"/>
      {/* diagonal-split motif */}
      <polygon points="0,0 200,0 0,130" fill="#4f6ef7" opacity="0.06"/>
      <polygon points="300,130 100,130 300,0" fill="#06b6d4" opacity="0.04"/>
      <line x1="0" y1="130" x2="300" y2="0" stroke="#4f6ef7" strokeWidth="0.8" opacity="0.15"/>
      <rect x="24" y="36" width="52" height="32" rx="5" fill="#4f6ef7" opacity="0.9"/>
      <rect x="84" y="36" width="80" height="32" rx="5" fill="#4f6ef7" opacity="0.5"/>
      <rect x="172" y="36" width="104" height="32" rx="5" fill="#4f6ef7" opacity="0.25"/>
      <rect x="24" y="76" width="252" height="9" rx="3" fill="#4f6ef7" opacity="0.2"/>
      <rect x="24" y="93" width="190" height="9" rx="3" fill="#4f6ef7" opacity="0.14"/>
      <text x="24" y="120" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9">Overview</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(165,184,255,0.6)" letterSpacing="2">SUMMARY · METRICS</text>
    </svg>
  ),
  "data-health": (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="130" fill="#0d3b2e"/>
      <circle cx="270" cy="16" r="65" fill="#145a42" opacity="0.5"/>
      {/* radial-lines motif */}
      <line x1="240" y1="82" x2="240" y2="18" stroke="#22c55e" strokeWidth="0.8" opacity="0.12"/>
      <line x1="240" y1="82" x2="280" y2="45" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <line x1="240" y1="82" x2="288" y2="82" stroke="#22c55e" strokeWidth="0.8" opacity="0.08"/>
      <line x1="240" y1="82" x2="280" y2="120" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <line x1="240" y1="82" x2="200" y2="45" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
      <circle cx="240" cy="82" r="4" fill="#22c55e" opacity="0.15"/>
      <circle cx="240" cy="82" r="16" fill="none" stroke="#22c55e" strokeWidth="0.6" opacity="0.08"/>
      <polyline points="20,65 56,65 74,32 92,100 110,48 128,75 152,65 280,65" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
      <circle cx="74" cy="32" r="4" fill="#22c55e"/>
      <circle cx="92" cy="100" r="4" fill="#22c55e"/>
      <circle cx="110" cy="48" r="4" fill="#22c55e"/>
      <text x="24" y="120" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9">Data Health</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(134,239,172,0.6)" letterSpacing="2">QUALITY · NULLS</text>
    </svg>
  ),
  schema: (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="130" fill="#1e1535"/>
      {/* dot-grid motif */}
      <circle cx="220" cy="36" r="1.5" fill="#a78bfa" opacity="0.18"/>
      <circle cx="236" cy="36" r="1.5" fill="#a78bfa" opacity="0.14"/>
      <circle cx="252" cy="36" r="2" fill="#a78bfa" opacity="0.25"/>
      <circle cx="268" cy="36" r="1.5" fill="#a78bfa" opacity="0.12"/>
      <circle cx="220" cy="52" r="2" fill="#a78bfa" opacity="0.22"/>
      <circle cx="236" cy="52" r="1.5" fill="#a78bfa" opacity="0.16"/>
      <circle cx="252" cy="52" r="1.5" fill="#a78bfa" opacity="0.2"/>
      <circle cx="268" cy="52" r="2" fill="#a78bfa" opacity="0.28"/>
      <circle cx="220" cy="68" r="1.5" fill="#a78bfa" opacity="0.14"/>
      <circle cx="236" cy="68" r="2" fill="#a78bfa" opacity="0.2"/>
      <circle cx="252" cy="68" r="1.5" fill="#a78bfa" opacity="0.16"/>
      <circle cx="268" cy="68" r="1.5" fill="#a78bfa" opacity="0.1"/>
      <rect x="24" y="30" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.9"/>
      <rect x="24" y="48" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.45"/>
      <rect x="24" y="66" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.3"/>
      <rect x="24" y="84" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.18"/>
      <line x1="108" y1="30" x2="108" y2="94" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
      <line x1="192" y1="30" x2="192" y2="94" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
      <text x="24" y="118" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9">Schema</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(196,181,253,0.6)" letterSpacing="2">COLUMNS · TYPES</text>
    </svg>
  ),
  charts: (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="130" fill="#2d1a00"/>
      <circle cx="262" cy="14" r="64" fill="#4a2c00" opacity="0.5"/>
      {/* scatter-plot trend motif */}
      <circle cx="248" cy="30" r="2.5" fill="#f59e0b" opacity="0.18"/>
      <circle cx="260" cy="38" r="3" fill="#f59e0b" opacity="0.22"/>
      <circle cx="272" cy="24" r="2" fill="#f59e0b" opacity="0.15"/>
      <circle cx="256" cy="48" r="2" fill="#f59e0b" opacity="0.12"/>
      <line x1="242" y1="54" x2="280" y2="20" stroke="#fcd34d" strokeWidth="0.8" opacity="0.15" strokeDasharray="3,3"/>
      <rect x="24" y="74" width="28" height="36" rx="3" fill="#f59e0b" opacity="0.4"/>
      <rect x="60" y="56" width="28" height="54" rx="3" fill="#f59e0b" opacity="0.6"/>
      <rect x="96" y="38" width="28" height="72" rx="3" fill="#f59e0b" opacity="0.85"/>
      <rect x="132" y="50" width="28" height="60" rx="3" fill="#f59e0b" opacity="0.7"/>
      <rect x="168" y="62" width="28" height="48" rx="3" fill="#f59e0b" opacity="0.5"/>
      <line x1="14" y1="110" x2="276" y2="110" stroke="#f59e0b" strokeWidth="1" opacity="0.2"/>
      <text x="24" y="122" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9">Charts</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,211,77,0.6)" letterSpacing="2">VISUALISE · EXPLORE</text>
    </svg>
  ),
  ml: (
    <svg viewBox="0 0 300 130" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
      <rect width="300" height="130" fill="#2d0a1a"/>
      <circle cx="260" cy="14" r="66" fill="#4a0f28" opacity="0.5"/>
      {/* ring-gauge motif */}
      <circle cx="248" cy="98" r="20" fill="none" stroke="#f43f5e" strokeWidth="3" strokeDasharray="63 63" strokeDashoffset="16" strokeLinecap="round" opacity="0.22"/>
      <circle cx="248" cy="98" r="12" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="38 38" strokeDashoffset="10" strokeLinecap="round" opacity="0.14"/>
      <circle cx="248" cy="98" r="4" fill="#f43f5e" opacity="0.1"/>
      <circle cx="44" cy="36" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="44" cy="65" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="44" cy="94" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="110" cy="28" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="110" cy="57" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="110" cy="86" r="9" fill="#f43f5e" opacity="0.65"/>
      <circle cx="176" cy="36" r="9" fill="#f43f5e" opacity="0.5"/>
      <circle cx="176" cy="65" r="9" fill="#f43f5e" opacity="0.5"/>
      <circle cx="242" cy="50" r="9" fill="#f43f5e" opacity="0.9"/>
      <circle cx="242" cy="79" r="9" fill="#f43f5e" opacity="0.9"/>
      <line x1="53" y1="36" x2="101" y2="28" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="53" y1="65" x2="101" y2="57" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="119" y1="57" x2="167" y2="65" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
      <line x1="185" y1="65" x2="233" y2="50" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
      <text x="24" y="118" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9">ML Lab</text>
      <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,164,175,0.6)" letterSpacing="2">TRAIN · PREDICT</text>
    </svg>
  ),
};

const popupCardAccents: Record<string, string> = {
  "overview": "#4f6ef7",
  "data-health": "#22c55e",
  "schema": "#a78bfa",
  "charts": "#f59e0b",
  "ml": "#f43f5e",
};

function PopupMobileCards({ report, onCardOpenChange, onRunUnsupervised, onRunSupervised, onDeleteExperiment }: PopupMobileCardsProps) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(0);

  function handleOpenCard(card: PopupCard) {
    setOpenCard(card.key);
    setActiveSubIdx(0);
    onCardOpenChange(true);
  }

  function handleBack() {
    setOpenCard(null);
    setActiveSubIdx(0);
    onCardOpenChange(false);
  }

  function renderContent(): ReactNode {
    if (!openCard) return null;
    const card = popupCards.find((c) => c.key === openCard);
    if (!card) return null;
    const sub = card.subtabs?.[activeSubIdx];
    const tab = sub?.tab ?? card.defaultTab;
    const rawSection = sub?.section ?? null;
    const section = rawSection === "__all__" ? null : rawSection;

    switch (tab) {
      case "overview":
        return <OverviewTab overview={report.overview} schema={report.schema} quality={report.quality} insights={report.insights} mobileSection={section} />;
      case "insights":
        return <InsightsTab insights={report.insights} mobileSection={section} />;
      case "schema":
        return <SchemaTab schema={report.schema} />;
      case "quality":
        return <DataQualityTab overview={report.overview} quality={report.quality} mobileSection={section} />;
      case "statistics":
        return <StatisticsTab statistics={report.statistics} mobileSection={section} />;
      case "relationships":
        return <RelationshipsTab schema={report.schema} statistics={report.statistics} mobileSection={section} />;
      case "visualisations":
        return <VisualisationsTab visualisations={report.visualisations} mobileSection={section} />;
      case "ml":
        return (
          <MLTab
            key={`popup-mobile-${report.analysis_id}:${report.ml_experiments.map((e) => e.id).join("|")}`}
            analysisId={report.analysis_id}
            capabilities={report.ml_capabilities}
            experiments={report.ml_experiments || []}
            readiness={report.insights.modeling_readiness}
            initialUnsupervised={report.ml_results.unsupervised}
            initialSupervised={report.ml_results.supervised}
            onRunUnsupervised={onRunUnsupervised}
            onRunSupervised={onRunSupervised}
            onDeleteExperiment={onDeleteExperiment}
          />
        );
      default:
        return null;
    }
  }

  const currentCard = popupCards.find((c) => c.key === openCard);

  if (openCard && currentCard) {
    const accent = popupCardAccents[currentCard.key] ?? "#4f6ef7";
    return (
      <div className="history-popup-mobile-detail mobile-analysis-fullpage">
        <div className="mobile-analysis-fullpage-topbar">
          <button type="button" onClick={handleBack} className="mobile-analysis-back-btn-inline">
            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
            Back
          </button>
        </div>

        <div
          className="mobile-analysis-detail-cover"
          style={{ "--analysis-card-accent": accent, "--analysis-card-border": `${accent}44` } as React.CSSProperties}
        >
          {popupCardCovers[currentCard.key]}
        </div>

        {/* Subtab dropdown below the card, styled with the card accent */}
        {currentCard.subtabs && currentCard.subtabs.length > 1 ? (
          <div
            className="mobile-analysis-detail-dropdown"
            style={{ "--analysis-card-accent": accent } as React.CSSProperties}
          >
            <select
              value={activeSubIdx}
              onChange={(e) => setActiveSubIdx(Number(e.target.value))}
            >
              {currentCard.subtabs.map((sub, idx) => (
                <option key={sub.label} value={idx}>
                  {sub.label}
                </option>
              ))}
            </select>
          </div>
        ) : null}

        <section
          className="mobile-screen-panel mobile-analysis-content-panel analysis-mobile-focus-content"
          style={{ "--analysis-card-accent": accent, "--analysis-card-border": `${accent}33` } as React.CSSProperties}
        >
          <Suspense fallback={<div className="py-8 text-center text-sm text-white/40">Loading…</div>}>
            {renderContent()}
          </Suspense>
        </section>
      </div>
    );
  }

  return (
    <div className="mobile-analysis-svg-grid">
      {popupCards.map((card) => {
        const accent = popupCardAccents[card.key] ?? "#4f6ef7";
        return (
          <button
            key={card.key}
            type="button"
            onClick={() => handleOpenCard(card)}
            className="mobile-analysis-svg-card"
            style={{ "--analysis-card-accent": accent } as React.CSSProperties}
          >
            {popupCardCovers[card.key]}
            <span className="mobile-analysis-svg-card-tap">Tap to open</span>
          </button>
        );
      })}
    </div>
  );
}