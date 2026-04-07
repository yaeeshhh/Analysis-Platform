"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { getAnalyses } from "@/lib/analysisApi";
import { AnalysisListItem } from "@/lib/analysisTypes";
import { isAnalysisStateStorageEvent } from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { resolveAuthenticatedUser } from "@/lib/session";
import type { User } from "@/lib/auth";

const workflowSteps = [
  {
    title: "Stage the file",
    detail: "Use Uploads to add or choose the dataset you want to work on, then move into Analysis when the report is ready to review.",
  },
  {
    title: "Read the explanation first",
    detail: "Overview and Insights should be the first read after every run because they summarize what changed, what looks risky, and what to inspect next.",
  },
  {
    title: "Use the technical tabs deliberately",
    detail: "Schema, Data Quality, Statistics, Relationships, and Charts explain why the summary looks the way it does and where cleanup should happen.",
  },
  {
    title: "Run ML last",
    detail: "Use the ML Lab after the target choice is clear and the dataset looks stable enough for modeling.",
  },
];

const destinationCards = [
  {
    title: "Uploads workspace",
    detail: "Operational page for uploading CSVs, selecting the current dataset, checking quick quality signals, and routing into Analysis Overview.",
    href: "/batch",
    cta: "Open uploads",
  },
  {
    title: "Analysis workspace",
    detail: "Full tabbed report with Overview, Insights, Schema, Quality, Statistics, Relationships, Charts, and the ML Lab once a dataset is selected.",
    href: "/analysis",
    cta: "Open analysis",
  },
  {
    title: "History library",
    detail: "Review older runs, search the archive, filter the list, and download reports when needed.",
    href: "/history",
    cta: "Open history",
  },
  {
    title: "Account",
    detail: "Manage login details, remembered sessions, and saved-upload cleanup tools.",
    href: "/account",
    cta: "Open account",
  },
];

const analysisTabCards = [
  {
    title: "Overview",
    detail: "High-level dataset posture, shape, density, and the first explanation of what the run is saying.",
  },
  {
    title: "Insights",
    detail: "Plain-language findings, modeling readiness, and the next actions worth taking after the upload.",
  },
  {
    title: "Schema",
    detail: "Column roles, inferred types, identifiers, targets, and field-level profiling.",
  },
  {
    title: "Data Quality",
    detail: "Missingness, duplicates, constants, correlations, outliers, and cleanup recommendations.",
  },
  {
    title: "Statistics",
    detail: "Numeric, categorical, and datetime summaries for the saved run.",
  },
  {
    title: "Relationships",
    detail: "Structural relationships and stronger pairwise signals that explain the dataset shape.",
  },
  {
    title: "Charts",
    detail: "Visual summaries with narrative explanations so the charts explain themselves instead of standing alone.",
  },
  {
    title: "ML Lab",
    detail: "Supervised and unsupervised experiment lanes with saved run cards, reopen actions, and downloadable outputs.",
  },
];

const historyFeatureCards = [
  {
    title: "Archive search",
    detail: "Find older runs by dataset name, saved summary, readiness posture, or whether ML experiments were attached to the run.",
  },
  {
    title: "In-place run review",
    detail: "Open the full saved Overview-to-ML result stack in a same-page popup so the current Analysis selection stays untouched.",
  },
  {
    title: "ML asset cleanup",
    detail: "Download saved ML reports and summaries or remove older experiments directly from the saved run when the archive needs pruning.",
  },
];

const featureMechanics = [
  {
    title: "Dataset intake",
    accent: "#7ad6ff",
    detail: "Upload CSVs, choose the active dataset, and check the first quality signals before opening the full report.",
    flow: "Start there, then open Analysis when you want the deeper report.",
  },
  {
    title: "Analysis report",
    accent: "#9db8ff",
    detail: "Start with the overview, then move into the deeper tabs when you want more detail.",
    flow: "Use the tabs to move from summary to tables, charts, and ML.",
  },
  {
    title: "Save history",
    accent: "#8bf1a8",
    detail: "Each dataset and ML scan is saved so you can reopen it later from History.",
    flow: "Keep the current dataset in Analysis, or open older runs separately from History.",
  },
  {
    title: "Charts and stories",
    accent: "#d7b7ff",
    detail: "Charts turn the report into quick visual checks for missingness, distributions, relationships, and drift.",
    flow: "Use Charts when you want the visuals behind the written summary.",
  },
  {
    title: "ML experiment lanes",
    accent: "#bfb8ff",
    detail: "Run supervised and unsupervised scans, then reopen saved experiments from the same dataset.",
    flow: "Downloads stay next to the active run, while older runs stay in the saved strips.",
  },
  {
    title: "Account cleanup",
    accent: "#f59ea7",
    detail: "Manage profile info, remembered login, saved runs, and deletion tools from one place.",
    flow: "Use the profile menu when you need account, uploads, or history shortcuts.",
  },
];

const desktopWorkflowPills = ["Upload", "Analyse", "Export"];

export default function DashboardPage() {
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [dashUser, setDashUser] = useState<User | null>(null);



  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);
      setError("");

      const user = await resolveAuthenticatedUser();
      if (!active) return;
      if (!user) {
        setDashUser(null);
        setAnalyses([]);
        setLoginRequired(false);
        setLoading(false);
        return;
      }

      setDashUser(user);
      setLoginRequired(false);

      try {
        setAnalyses(await getAnalyses());
      } catch (err: unknown) {
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      if (!active) return;
      void bootstrap();
    };

    const handleStorage = (event: StorageEvent) => {
      if (!active || !isAnalysisStateStorageEvent(event)) return;
      void bootstrap();
    };

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const latest = analyses[0] ?? null;
  const recentAnalyses = analyses.slice(0, 4);
  const mlReadyRuns = analyses.filter((item) => item.insights.modeling_readiness.is_ready).length;
  const totalExperiments = analyses.reduce((sum, item) => sum + item.experiment_count, 0);
  const activityItems = [
    analyses.length
      ? {
          title: `${analyses.length} saved run${analyses.length === 1 ? "" : "s"} in the workspace`,
          detail: `${mlReadyRuns} ${mlReadyRuns === 1 ? "run looks" : "runs look"} ready for optional ML.`,
        }
      : {
          title: "Workspace initialised",
          detail: "Upload the first dataset to start the archive and analysis flow.",
        },
    latest
      ? {
          title: `Latest dataset: ${latest.overview.dataset_name}`,
          detail: `Saved ${formatDate(latest.saved_at)} with ${latest.experiment_count} ML experiment${latest.experiment_count === 1 ? "" : "s"}.`,
        }
      : {
          title: "Awaiting first upload",
          detail: "Uploads will appear here once a CSV has been processed.",
        },
    totalExperiments
      ? {
          title: `${totalExperiments} ML experiment${totalExperiments === 1 ? "" : "s"} stored`,
          detail: "Reopen them from Analysis or History whenever you need the saved outputs.",
        }
      : {
          title: "No ML experiments yet",
          detail: "Run ML from the Analysis workspace after the dataset looks stable enough.",
        },
  ];
  const stats = [
    {
      label: "Saved runs",
      value: analyses.length.toLocaleString(),
      hint: latest ? latest.overview.dataset_name : "No saved analyses yet",
    },
    {
      label: "ML-ready runs",
      value: mlReadyRuns.toLocaleString(),
      hint: "Runs that look suitable for optional ML",
    },
    {
      label: "Saved ML runs",
      value: totalExperiments.toLocaleString(),
      hint: "Persisted across analysis history",
    },
  ];

  return (
    <>
      <AppShell
        eyebrow="Overview"
        title="Dashboard"
        description={dashUser?.full_name ? `Welcome back, ${dashUser.full_name}.` : "Good morning - your workspace is ready."}
        stats={stats}
      >
        {error ? (
          <div className="border-l-2 border-[#ff8c8c]/40 pl-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="py-10 text-center text-sm text-white/40">
            Loading dashboard...
          </div>
        ) : null}

        {!loading ? (
          <>
            {/* ─── Phone: inline content + tappable list → slides ─── */}
            <div className="phone-only space-y-4">
              {/* Quick stats strip */}
              <div className="mobile-inline-stats">
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{analyses.length}</span>
                  <span className="mobile-inline-stat-label">Saved runs</span>
                </div>
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{mlReadyRuns}</span>
                  <span className="mobile-inline-stat-label">ML-ready</span>
                </div>
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{totalExperiments}</span>
                  <span className="mobile-inline-stat-label">ML runs</span>
                </div>
              </div>

              {/* Latest run info */}
              {latest ? (
                <div className="border-b border-white/6 pb-4">
                  <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/42">Latest run</p>
                  <p className="mt-1 font-medium text-white">{latest.overview.dataset_name}</p>
                  <div className="mt-2 flex flex-wrap gap-2">
                    <span className="info-chip">
                      <span className="pulse-dot" />
                      {latest.overview.row_count?.toLocaleString() ?? "—"} rows
                    </span>
                    <span className="info-chip">{latest.overview.column_count ?? "—"} cols</span>
                    <span className="info-chip">{latest.insights.modeling_readiness.is_ready ? "ML Ready" : "EDA only"}</span>
                  </div>
                  <div className="mt-3 flex gap-2">
                    <ScrollIntentLink href={`/analysis?analysisId=${latest.id}`} className="flex-1 rounded-lg bg-[#ffb079] px-4 py-2.5 text-center text-sm font-semibold text-[#11273b]">
                      Open run
                    </ScrollIntentLink>
                    <ScrollIntentLink href="/batch" className="flex-1 rounded-lg border border-white/12 px-4 py-2.5 text-center text-sm text-white/70">
                      Uploads
                    </ScrollIntentLink>
                  </div>
                </div>
              ) : (
                <div className="border-b border-white/6 pb-4 text-center">
                  <p className="text-sm text-white/45">No saved analysis yet</p>
                  <ScrollIntentLink href="/batch" className="mt-2 inline-block rounded-lg bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b]">
                    Upload first dataset
                  </ScrollIntentLink>
                </div>
              )}

              {/* Quick links */}
              <div className="flex flex-wrap gap-2 pb-2">
                <ScrollIntentLink href="/batch" className="info-chip">Uploads →</ScrollIntentLink>
                <ScrollIntentLink href="/analysis" className="info-chip">Analysis →</ScrollIntentLink>
                <ScrollIntentLink href="/history" className="info-chip">History →</ScrollIntentLink>
                <ScrollIntentLink href="/account" className="info-chip">Account →</ScrollIntentLink>
              </div>

              {/* Feature highlights */}
              <div className="border-b border-white/6 pb-3">
                <p className="text-[0.65rem] font-bold uppercase tracking-wider text-white/42">How it works</p>
                <p className="mt-1.5 text-sm leading-6 text-white/55">
                  Upload a CSV in Uploads, review the report in Analysis, and check saved runs in History. ML experiments are optional and run after the dataset looks ready.
                </p>
              </div>

              {/* Section list for deeper drill-down */}
              <DashboardMobileSections analyses={analyses} latest={latest} totalExperiments={totalExperiments} />
            </div>

            <div className="tablet-up desktop-page-stack">
              <section className="desktop-hero-panel section-glow">
                <span className="desktop-kicker">Getting started</span>
                <h2 className="desktop-section-title">Navigate the studio from upload to model review</h2>
                <p className="desktop-section-text">Upload a dataset, review the explanation first, then reopen saved history or export ML outputs when the report is ready.</p>
                <div className="desktop-step-list">
                  {desktopWorkflowPills.map((label, index) => (
                    <span key={label} className="desktop-step-pill">
                      <strong>{index + 1}</strong>
                      {label}
                    </span>
                  ))}
                </div>
              </section>

              <div className="desktop-grid-2">
                <section className="desktop-panel">
                  <div className="desktop-panel-header">
                    <p className="desktop-panel-title">Recent uploads</p>
                    <ScrollIntentLink href="/batch" className="desktop-panel-action">Open uploads</ScrollIntentLink>
                  </div>

                  {recentAnalyses.length ? (
                    <div className="desktop-data-table-wrap">
                      <table className="desktop-data-table">
                        <thead>
                          <tr>
                            <th>Dataset</th>
                            <th>Rows</th>
                            <th>Status</th>
                            <th>Action</th>
                          </tr>
                        </thead>
                        <tbody>
                          {recentAnalyses.map((analysis) => (
                            <tr key={analysis.id}>
                              <td>
                                <div>
                                  <div>{analysis.overview.dataset_name}</div>
                                  <div className="mt-1 text-[0.68rem] uppercase tracking-[0.14em] text-white/28">{analysis.source_filename}</div>
                                </div>
                              </td>
                              <td>{analysis.overview.row_count.toLocaleString()}</td>
                              <td>
                                <span className="desktop-badge" data-tone={analysis.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                                  <span className="desktop-status-dot" />
                                  {analysis.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                                </span>
                              </td>
                              <td>
                                <ScrollIntentLink href={`/analysis?analysisId=${analysis.id}`} className="desktop-panel-action">
                                  Open run
                                </ScrollIntentLink>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  ) : (
                    <div className="desktop-empty-panel">
                      <div className="desktop-empty-icon">
                        <svg width="26" height="26" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                          <path d="M12 3v12" />
                          <path d="m7 8 5-5 5 5" />
                          <path d="M5 15v3a3 3 0 0 0 3 3h8a3 3 0 0 0 3-3v-3" />
                        </svg>
                      </div>
                      <p className="desktop-section-title text-[1.2rem]">No datasets uploaded</p>
                      <p className="desktop-section-text max-w-sm">Drop a CSV or open the Uploads workspace to create the first saved run.</p>
                      <ScrollIntentLink href="/batch" className="mt-4 rounded-lg bg-[#14b8a6] px-5 py-2.5 text-sm font-semibold text-[#042226]">
                        Upload dataset
                      </ScrollIntentLink>
                    </div>
                  )}
                </section>

                <section className="desktop-panel">
                  <div className="desktop-panel-header">
                    <p className="desktop-panel-title">Activity</p>
                    <ScrollIntentLink href="/history" className="desktop-panel-action">History</ScrollIntentLink>
                  </div>
                  <div className="space-y-3">
                    {activityItems.map((item, index) => (
                      <div key={item.title} className="list-row">
                        <span className="desktop-badge" data-tone={index === 0 ? "purple" : index === 1 ? "teal" : "amber"}>
                          <span className="desktop-status-dot" />
                          {index === 0 ? "Studio" : index === 1 ? "Latest" : "ML"}
                        </span>
                        <div className="list-row-content">
                          <p className="list-row-title">{item.title}</p>
                          <p className="list-row-hint">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <div className="desktop-grid-2">
                <section className="desktop-panel">
                  <div className="desktop-panel-header">
                    <p className="desktop-panel-title">Studio pages</p>
                    <ScrollIntentLink href="/history" className="desktop-panel-action">Open archive</ScrollIntentLink>
                  </div>
                  <div>
                    {destinationCards.map((item) => (
                      <ScrollIntentLink
                        key={`${item.href}-${item.title}`}
                        href={item.href}
                        className="list-row group"
                      >
                        <div className="list-row-content">
                          <p className="list-row-title">{item.title}</p>
                          <p className="list-row-hint">{item.detail}</p>
                        </div>
                        <span className="desktop-panel-action">{item.cta}</span>
                      </ScrollIntentLink>
                    ))}
                  </div>
                </section>

                <section className="desktop-panel">
                  <div className="desktop-panel-header">
                    <p className="desktop-panel-title">Analysis tabs</p>
                    <ScrollIntentLink href="/analysis" className="desktop-panel-action">Open workspace</ScrollIntentLink>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2">
                    {analysisTabCards.map((item) => (
                      <div key={item.title} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-white/52">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </section>
              </div>

              <section className="desktop-panel section-glow">
                <div className="desktop-panel-header">
                  <p className="desktop-panel-title">How features work</p>
                  <ScrollIntentLink href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"} className="desktop-panel-action">
                    {latest ? "Open latest run" : "Open uploads"}
                  </ScrollIntentLink>
                </div>
                <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {featureMechanics.map((item) => (
                    <div key={item.title} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                      <p className="text-[0.64rem] font-bold uppercase tracking-[0.16em]" style={{ color: item.accent }}>{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/58">{item.detail}</p>
                      <p className="mt-1.5 text-sm leading-6 text-white/38">{item.flow}</p>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          </>
        ) : null}
      </AppShell>

      <LoginRequiredModal
        open={false && loginRequired}
        title="Login required"
        message="Log in to view the analysis dashboard and recent dataset runs."
        loginHref="/login?redirect=/dashboard"
        onDismiss={() => setLoginRequired(false)}
        onLoginSuccess={() => setLoginRequired(false)}
      />
    </>
  );
}

/* ── Phone-only sections list ── */
function DashboardMobileSections({
  analyses,
  latest,
  totalExperiments,
}: {
  analyses: AnalysisListItem[];
  latest: AnalysisListItem | null;
  totalExperiments: number;
}) {
  const sections: MobileSection[] = [
    {
      id: "workflow",
      title: "Recommended workflow",
      hint: "Four steps from upload through analysis to ML review",
      accent: "#7ad6ff",
      content: (
        <div className="space-y-3">
          <div className="mini-bar"><div className="mini-bar-fill" style={{ width: "100%", background: "linear-gradient(90deg, var(--accent-cool), var(--accent-warm))" }} /></div>
          {workflowSteps.map((step, i) => (
            <div key={step.title} className="border-b border-white/6 pb-3 last:border-0">
              <p className="flex items-baseline gap-2 text-sm font-semibold text-white">
                <span className="text-xs text-white/30">{i + 1}</span>
                {step.title}
              </p>
              <p className="mt-1 text-sm leading-6 text-white/55">{step.detail}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "pages",
      title: "Studio pages",
      hint: "Direct links to Uploads, Analysis, History, and Account",
      accent: "#9db8ff",
      content: (
        <div>
          {destinationCards.map((item) => (
            <ScrollIntentLink
              key={`${item.href}-${item.title}`}
              href={item.href}
              className="block border-b border-white/6 py-3 last:border-0"
            >
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-white/55">{item.detail}</p>
              <p className="mt-1 text-sm font-medium text-[#ffcfaa]">{item.cta} →</p>
            </ScrollIntentLink>
          ))}
        </div>
      ),
    },
    {
      id: "tabs",
      title: "Analysis tabs",
      hint: "What each of the 8 tabs in the Analysis workspace shows",
      accent: "#8bf1a8",
      content: (
        <div>
          <ScrollIntentLink href="/analysis" className="mb-3 block rounded-lg bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
            Open analysis workspace
          </ScrollIntentLink>
          {analysisTabCards.map((item) => (
            <div key={item.title} className="border-b border-white/6 py-3 last:border-0">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-white/55">{item.detail}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "history",
      title: "History archive",
      hint: "Tools for reopening, searching, and downloading past runs",
      accent: "#bfb8ff",
      content: (
        <div>
          <ScrollIntentLink href="/history" className="mb-3 block rounded-lg bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
            Open history tools
          </ScrollIntentLink>
          {historyFeatureCards.map((item) => (
            <div key={item.title} className="border-b border-white/6 py-3 last:border-0">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-white/55">{item.detail}</p>
            </div>
          ))}
          <div className="mobile-inline-stats mt-3">
            <div className="mobile-inline-stat">
              <span className="mobile-inline-stat-value">{analyses.length}</span>
              <span className="mobile-inline-stat-label">Saved runs</span>
            </div>
            <div className="mobile-inline-stat">
              <span className="mobile-inline-stat-value">{totalExperiments}</span>
              <span className="mobile-inline-stat-label">ML runs</span>
            </div>
          </div>
        </div>
      ),
    },
    {
      id: "features",
      title: "How features work",
      hint: "Product map for uploads, persistence, charts, experiments, and cleanup",
      accent: "#d7b7ff",
      content: (
        <div>
          {featureMechanics.map((item) => (
            <div key={item.title} className="border-b border-white/6 py-3 last:border-0">
              <p className="text-xs font-bold uppercase tracking-wide" style={{ color: item.accent }}>{item.title}</p>
              <p className="mt-2 text-sm leading-6 text-white/60">{item.detail}</p>
              <p className="mt-1 text-sm leading-6 text-white/40">{item.flow}</p>
            </div>
          ))}
        </div>
      ),
    },
    {
      id: "latest",
      title: "Latest saved run",
      hint: latest ? latest.overview.dataset_name : "No saved analyses yet",
      accent: "#7ad6ff",
      content: (
        <div className="space-y-3">
          <p className="text-sm leading-6 text-white/68">
            {latest
              ? `${latest.overview.dataset_name} is the most recent saved run. Open Uploads to review quick quality signals or open Analysis to continue through the full report.`
              : "No saved analysis yet. Open Uploads to upload the first CSV."}
          </p>
          <ScrollIntentLink href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"} className="block rounded-lg bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
            {latest ? "Open latest run" : "Open uploads page"}
          </ScrollIntentLink>
          <ScrollIntentLink href="/history" className="block rounded-lg border border-white/12 px-5 py-3 text-center text-sm text-white/82">
            View saved history
          </ScrollIntentLink>
        </div>
      ),
    },
  ];

  return <MobileSectionList sections={sections} />;
}