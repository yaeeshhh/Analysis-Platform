"use client";

import { type ReactNode, useEffect, useRef, useState } from "react";
import DataQualityTab from "@/components/analysis/DataQualityTab";
import InsightsTab from "@/components/analysis/InsightsTab";
import MLTab from "@/components/analysis/MLTab";
import OverviewTab from "@/components/analysis/OverviewTab";
import RelationshipsTab from "@/components/analysis/RelationshipsTab";
import SchemaTab from "@/components/analysis/SchemaTab";
import StatisticsTab from "@/components/analysis/StatisticsTab";
import VisualisationsTab from "@/components/analysis/VisualisationsTab";
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

type PopupCardSubtab = { section: string; label: string; tab?: PopupSectionId };
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
    description: "AI summary, findings, posture, type mix, next steps, and raw data.",
    icon: "📊",
    defaultTab: "overview",
    subtabs: [
      { section: "what-the-data-says", label: "Data says" },
      { section: "dataset-posture", label: "Posture" },
      { section: "type-mix", label: "Type mix" },
      { section: "findings", label: "Findings", tab: "insights" },
      { section: "what-to-do-next", label: "Next steps", tab: "insights" },
      { section: "raw-data", label: "Raw data" },
    ],
  },
  {
    key: "data-health",
    label: "Data Health",
    description: "Missing values, quality recommendations, numeric and categorical summaries.",
    icon: "🩺",
    defaultTab: "quality",
    subtabs: [
      { section: "missingness", label: "Missing" },
      { section: "recommendations", label: "Fixes" },
      { section: "numeric-summary", label: "Numeric", tab: "statistics" },
      { section: "categorical-summary", label: "Categorical", tab: "statistics" },
    ],
  },
  {
    key: "schema",
    label: "Schema",
    description: "Column types, roles, correlations, skew, dominant categories, and signals.",
    icon: "🗂️",
    defaultTab: "schema",
    subtabs: [
      { section: "__all__", label: "Fields" },
      { section: "strongest-relationships", label: "Correlations", tab: "relationships" },
      { section: "skewed-numeric-fields", label: "Skew", tab: "relationships" },
      { section: "dominant-categories", label: "Dominant", tab: "relationships" },
      { section: "modeling-signals", label: "Signals", tab: "relationships" },
    ],
  },
  {
    key: "charts",
    label: "Charts",
    description: "Missingness, distributions, categories, boxplots, heatmap, scatter, and drift.",
    icon: "📈",
    defaultTab: "visualisations",
    subtabs: [
      { section: "missingness", label: "Missing" },
      { section: "distribution", label: "Distrib." },
      { section: "top-categories", label: "Top cats" },
      { section: "boxplot-summary", label: "Box" },
      { section: "correlation-heatmap", label: "Heat" },
      { section: "pairwise-scatter", label: "Scatter" },
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

function SectionFrame({ id, title, note, children }: { id: string; title: string; note: string; children: ReactNode }) {
  return (
    <section id={`history-popup-${id}`} className="history-popup-section popup-section-target">
      <div className="history-popup-section-header">
        <div>
          <h3 className="history-popup-section-title">{title}</h3>
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
          {/* ── Header ── */}
          <div className="history-popup-header-card">
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
                onRunUnsupervised={onRunUnsupervised}
                onRunSupervised={onRunSupervised}
                onDeleteExperiment={onDeleteExperiment}
              />
            </div>
          ) : null}

          {/* ── Tablet/Desktop: long scroll with section frames ── */}
          {!loading && !error && report && ready ? (
            <div className="history-popup-content tablet-up">
              <SectionFrame id="overview" title="Overview" note="Dataset posture, summary, and preview rows.">
                <OverviewTab
                  overview={report.overview}
                  schema={report.schema}
                  quality={report.quality}
                  insights={report.insights}
                />
              </SectionFrame>

              <SectionFrame id="insights" title="Insights" note="Plain-language findings and recommended next steps.">
                <InsightsTab insights={report.insights} />
              </SectionFrame>

              <SectionFrame id="schema" title="Schema" note="Column roles, inferred types, and field inventory.">
                <SchemaTab schema={report.schema} />
              </SectionFrame>

              <SectionFrame id="quality" title="Data Quality" note="Missingness, duplicates, and cleanup direction.">
                <DataQualityTab overview={report.overview} quality={report.quality} />
              </SectionFrame>

              <SectionFrame id="statistics" title="Statistics" note="Numeric and categorical summaries for key columns.">
                <StatisticsTab statistics={report.statistics} />
              </SectionFrame>

              <SectionFrame id="relationships" title="Relationships" note="Correlation signals, skew, and modeling cues.">
                <RelationshipsTab schema={report.schema} statistics={report.statistics} />
              </SectionFrame>

              <SectionFrame id="visualisations" title="Charts" note="Distribution views, heatmap signals, and drift checks.">
                <VisualisationsTab visualisations={report.visualisations} />
              </SectionFrame>

              <SectionFrame id="ml" title="ML Lab" note="Saved benchmarks, downloads, and experiment details.">
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
  onRunUnsupervised: (nClusters: number) => Promise<UnsupervisedResult>;
  onRunSupervised: (targetColumn: string) => Promise<SupervisedResult>;
  onDeleteExperiment: (experiment: MlExperimentSummary) => Promise<void>;
};

function PopupMobileCards({ report, onRunUnsupervised, onRunSupervised, onDeleteExperiment }: PopupMobileCardsProps) {
  const [openCard, setOpenCard] = useState<string | null>(null);
  const [activeSubIdx, setActiveSubIdx] = useState<number>(0);

  function handleOpenCard(card: PopupCard) {
    setOpenCard(card.key);
    setActiveSubIdx(0);
  }

  function handleBack() {
    setOpenCard(null);
    setActiveSubIdx(0);
  }

  function renderContent(): ReactNode {
    if (!openCard) return null;
    const card = popupCards.find((c) => c.key === openCard);
    if (!card) return null;
    const sub = card.subtabs?.[activeSubIdx];
    const tab = sub?.tab ?? card.defaultTab;
    const section = sub?.section === "__all__" ? null : (sub?.section ?? null);

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
    return (
      <div className="history-popup-mobile-detail">
        <button type="button" onClick={handleBack} className="mobile-analysis-back-btn">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="15 18 9 12 15 6"/></svg>
          All sections
        </button>

        <div className="mobile-analysis-detail-header">
          <span className="mobile-analysis-detail-icon">{currentCard.icon}</span>
          <div>
            <h2 className="mobile-analysis-detail-title">{currentCard.label}</h2>
            <p className="mobile-analysis-detail-desc">{currentCard.description}</p>
          </div>
        </div>

        {currentCard.subtabs && currentCard.subtabs.length > 1 ? (
          <div className="mobile-analysis-tab-pills">
            {currentCard.subtabs.map((sub, idx) => (
              <button
                key={sub.section}
                type="button"
                onClick={() => setActiveSubIdx(idx)}
                className={`mobile-analysis-tab-pill${activeSubIdx === idx ? " mobile-analysis-tab-pill-active" : ""}`}
              >
                {sub.label}
              </button>
            ))}
          </div>
        ) : null}

        <section className="mobile-screen-panel mobile-analysis-content-panel analysis-mobile-focus-content">
          {renderContent()}
        </section>
      </div>
    );
  }

  return (
    <div className="mobile-analysis-card-list">
      {popupCards.map((card) => (
        <button
          key={card.key}
          type="button"
          onClick={() => handleOpenCard(card)}
          className="mobile-analysis-card"
        >
          <span className="mobile-analysis-card-icon">{card.icon}</span>
          <div className="mobile-analysis-card-text">
            <p className="mobile-analysis-card-label">{card.label}</p>
            <p className="mobile-analysis-card-desc">{card.description}</p>
          </div>
          <svg className="mobile-analysis-card-chevron" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><polyline points="9 18 15 12 9 6"/></svg>
        </button>
      ))}
    </div>
  );
}