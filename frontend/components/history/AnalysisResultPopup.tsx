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

            {report && ready ? (
              <div className="history-popup-jump">
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

          {!loading && !error && report && ready ? (
            <div className="history-popup-content">
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