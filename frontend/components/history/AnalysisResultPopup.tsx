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
  { id: "overview", label: "Overview", note: "Posture, findings, and sample rows" },
  { id: "insights", label: "Insights", note: "Summary, findings, and next steps" },
  { id: "schema", label: "Schema", note: "Types, roles, and column inventory" },
  { id: "quality", label: "Data Quality", note: "Missingness, duplicates, and fixes" },
  { id: "statistics", label: "Statistics", note: "Numeric and categorical summaries" },
  { id: "relationships", label: "Relationships", note: "Correlations, skew, and targets" },
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
          <span className="desktop-kicker">{title}</span>
          <h3 className="history-popup-section-title">{title}</h3>
        </div>
        <p className="history-popup-section-note">{note}</p>
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
    const section = document.getElementById(`history-popup-${sectionId}`);
    section?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  if (!open) {
    return null;
  }

  return (
    <div
      className="fixed inset-0 z-[135] bg-[#04090d]/82 p-4 backdrop-blur-md"
      onMouseDown={onClose}
    >
      <div
        className="mx-auto flex h-full w-full max-w-[1540px] flex-col overflow-hidden rounded-[34px] border border-white/10 bg-[#09131d]/96 shadow-[0_32px_110px_rgba(0,0,0,0.52)]"
        onMouseDown={(event) => event.stopPropagation()}
      >
        <div className="border-b border-white/10 px-6 py-5">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div className="min-w-0 flex-1">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Archived report</p>
              <h2 className="mt-2 break-words font-[family:var(--font-display)] text-3xl text-white">
                {report ? report.overview.dataset_name : "Saved run details"}
              </h2>
              <p className="mt-2 max-w-4xl text-sm leading-6 text-white/64">
                View the full saved report here without replacing the current analysis.
              </p>
            </div>

            <div className="flex flex-wrap gap-3">
              {report ? (
                <button
                  type="button"
                  onClick={onDownloadReport}
                  className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82"
                >
                  Download report
                </button>
              ) : null}
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]"
              >
                Close run
              </button>
            </div>
          </div>

          {report ? (
            <div className="history-popup-stat-grid">
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Saved</p>
                <p className="mt-2 text-sm font-medium text-white">{savedAt ? formatDate(savedAt) : "Saved run"}</p>
              </div>
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Rows</p>
                <p className="mt-2 text-sm font-medium text-white">{report.overview.row_count.toLocaleString()}</p>
              </div>
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Columns</p>
                <p className="mt-2 text-sm font-medium text-white">{report.overview.column_count.toLocaleString()}</p>
              </div>
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Quality score</p>
                <p className="mt-2 text-sm font-medium text-white">{calculateQualityScore(report.overview, report.quality).toFixed(1)}</p>
              </div>
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">Readiness</p>
                <p className="mt-2 text-sm font-medium text-white">
                  {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                </p>
              </div>
              <div className="history-popup-stat-card">
                <p className="text-xs uppercase tracking-[0.16em] text-white/42">ML runs</p>
                <p className="mt-2 text-sm font-medium text-white">{report.ml_experiments.length}</p>
              </div>
            </div>
          ) : null}

          {report && ready ? (
            <div className="mt-4 overflow-x-auto overflow-y-visible pb-2 pt-1 tablet-up xl:hidden">
              <div className="analysis-subnav-surface">
                <div className="analysis-subnav-track">
                  {sections.map((section) => (
                    <button
                      type="button"
                      key={section.id}
                      onClick={() => handleScrollToSection(section.id)}
                      className={`analysis-subnav-link ${
                        activeSectionId === section.id ? "analysis-subnav-link-active" : ""
                      }`}
                    >
                      {section.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>

        <div ref={scrollContainerRef} className="flex-1 overflow-y-auto px-6 py-6">
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
            <div className="history-popup-layout">
              <aside className="history-popup-sidebar tablet-up">
                <div className="history-popup-sidecard">
                  <span className="desktop-kicker">Navigator</span>
                  <h3 className="history-popup-sidecard-title">Move through the saved report without replacing the active analysis.</h3>
                  <div className="history-popup-nav">
                    {sections.map((section) => (
                      <button
                        type="button"
                        key={`side-${section.id}`}
                        onClick={() => handleScrollToSection(section.id)}
                        className={`history-popup-nav-link ${activeSectionId === section.id ? "history-popup-nav-link-active" : ""}`}
                      >
                        <span className="history-popup-nav-link-label">{section.label}</span>
                        <span className="history-popup-nav-link-note">{section.note}</span>
                      </button>
                    ))}
                  </div>
                </div>

                <div className="history-popup-sidecard">
                  <span className="desktop-kicker">Snapshot</span>
                  <div className="mt-4 flex flex-wrap gap-2">
                    <span className="desktop-badge" data-tone={report.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                      <span className="desktop-status-dot" />
                      {report.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                    </span>
                    <span className="desktop-badge" data-tone="purple">
                      {report.ml_experiments.length} ML run{report.ml_experiments.length === 1 ? "" : "s"}
                    </span>
                  </div>
                  <div className="history-popup-sidegrid">
                    <div className="history-popup-sidecell">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/42">Dataset</p>
                      <p className="mt-2 text-sm font-medium text-white">{report.overview.dataset_name}</p>
                    </div>
                    <div className="history-popup-sidecell">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/42">Saved</p>
                      <p className="mt-2 text-sm font-medium text-white">{savedAt ? formatDate(savedAt) : "Saved run"}</p>
                    </div>
                    <div className="history-popup-sidecell">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/42">Rows</p>
                      <p className="mt-2 text-sm font-medium text-white">{report.overview.row_count.toLocaleString()}</p>
                    </div>
                    <div className="history-popup-sidecell">
                      <p className="text-xs uppercase tracking-[0.16em] text-white/42">Columns</p>
                      <p className="mt-2 text-sm font-medium text-white">{report.overview.column_count.toLocaleString()}</p>
                    </div>
                  </div>
                </div>
              </aside>

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
                    initialUnsupervised={report.ml_results.unsupervised}
                    initialSupervised={report.ml_results.supervised}
                    onRunUnsupervised={onRunUnsupervised}
                    onRunSupervised={onRunSupervised}
                    onDeleteExperiment={onDeleteExperiment}
                  />
                </SectionFrame>
              </div>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}