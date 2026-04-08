"use client";

import React, { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { getAnalyses } from "@/lib/analysisApi";
import { analysisFocusAreas, getAnalysisTabDefinition } from "@/lib/analysisNavigation";
import { AnalysisListItem } from "@/lib/analysisTypes";
import { subscribeToAnalysisStateChanges } from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { resolveAuthenticatedUser } from "@/lib/session";
import type { User } from "@/lib/auth";

const destinationCards = [
  {
    title: "Dataset library",
    detail: "Upload CSVs, keep saved datasets in the reusable library, choose the active run, and route it into Analysis.",
    href: "/batch",
    cta: "Open library",
  },
  {
    title: "Analysis",
    detail: "Grouped report flow with Summary, Health, Fields, Patterns, and ML once a dataset is selected.",
    href: "/analysis",
    cta: "Open analysis",
  },
  {
    title: "Run archive",
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

const analysisBreakdownCards = analysisFocusAreas.map((area) => ({
  title: area.label,
  detail: area.description,
  tabs: area.tabKeys.map((tabKey) => getAnalysisTabDefinition(tabKey).label),
}));

const dashboardCardCovers: { key: string; label: string; defaultTab: string; accent: string; cover: React.ReactElement }[] = [
  {
    key: "overview",
    label: "Overview",
    defaultTab: "overview",
    accent: "#4f6ef7",
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#1a1f36"/>
        <circle cx="260" cy="20" r="70" fill="#2d3f8a" opacity="0.5"/>
        <circle cx="40" cy="120" r="45" fill="#2d3f8a" opacity="0.3"/>
        <polygon points="0,0 200,0 0,140" fill="#4f6ef7" opacity="0.06"/>
        <polygon points="300,140 100,140 300,0" fill="#06b6d4" opacity="0.04"/>
        <line x1="0" y1="140" x2="300" y2="0" stroke="#4f6ef7" strokeWidth="0.8" opacity="0.15"/>
        <rect x="24" y="42" width="52" height="36" rx="5" fill="#4f6ef7" opacity="0.9"/>
        <rect x="84" y="42" width="80" height="36" rx="5" fill="#4f6ef7" opacity="0.5"/>
        <rect x="172" y="42" width="104" height="36" rx="5" fill="#4f6ef7" opacity="0.25"/>
        <rect x="24" y="86" width="252" height="9" rx="3" fill="#4f6ef7" opacity="0.2"/>
        <rect x="24" y="102" width="190" height="9" rx="3" fill="#4f6ef7" opacity="0.14"/>
        <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Overview</text>
        <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(165,184,255,0.6)" letterSpacing="2">SUMMARY · METRICS · KPIs</text>
      </svg>
    ),
  },
  {
    key: "data-health",
    label: "Data Health",
    defaultTab: "quality",
    accent: "#22c55e",
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#0d3b2e"/>
        <circle cx="270" cy="20" r="70" fill="#145a42" opacity="0.5"/>
        <circle cx="30" cy="120" r="45" fill="#145a42" opacity="0.3"/>
        <polyline points="20,72 56,72 74,38 92,108 110,55 128,82 152,72 280,72" fill="none" stroke="#22c55e" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"/>
        <circle cx="74" cy="38" r="4" fill="#22c55e"/>
        <circle cx="92" cy="108" r="4" fill="#22c55e"/>
        <circle cx="110" cy="55" r="4" fill="#22c55e"/>
        <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Data Health</text>
        <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(134,239,172,0.6)" letterSpacing="2">QUALITY · NULLS · ANOMALIES</text>
      </svg>
    ),
  },
  {
    key: "schema",
    label: "Schema",
    defaultTab: "schema",
    accent: "#a78bfa",
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#1e1535"/>
        <circle cx="260" cy="20" r="65" fill="#2d1f52" opacity="0.5"/>
        <rect x="24" y="38" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.9"/>
        <rect x="24" y="56" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.45"/>
        <rect x="24" y="74" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.3"/>
        <rect x="24" y="92" width="252" height="10" rx="2" fill="#a78bfa" opacity="0.18"/>
        <line x1="108" y1="38" x2="108" y2="102" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
        <line x1="192" y1="38" x2="192" y2="102" stroke="#a78bfa" strokeWidth="1" opacity="0.35"/>
        <text x="24" y="125" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Schema</text>
        <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(196,181,253,0.6)" letterSpacing="2">TABLES · COLUMNS · TYPES</text>
      </svg>
    ),
  },
  {
    key: "charts",
    label: "Charts",
    defaultTab: "visualisations",
    accent: "#f59e0b",
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#2d1a00"/>
        <circle cx="262" cy="18" r="68" fill="#4a2c00" opacity="0.5"/>
        <rect x="24" y="82" width="28" height="38" rx="3" fill="#f59e0b" opacity="0.4"/>
        <rect x="60" y="62" width="28" height="58" rx="3" fill="#f59e0b" opacity="0.6"/>
        <rect x="96" y="44" width="28" height="76" rx="3" fill="#f59e0b" opacity="0.85"/>
        <rect x="132" y="55" width="28" height="65" rx="3" fill="#f59e0b" opacity="0.7"/>
        <rect x="168" y="68" width="28" height="52" rx="3" fill="#f59e0b" opacity="0.5"/>
        <rect x="204" y="76" width="28" height="44" rx="3" fill="#f59e0b" opacity="0.35"/>
        <line x1="14" y1="120" x2="286" y2="120" stroke="#f59e0b" strokeWidth="1" opacity="0.2"/>
        <text x="24" y="135" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">Charts</text>
        <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,211,77,0.6)" letterSpacing="2">VISUALISE · EXPLORE · COMPARE</text>
      </svg>
    ),
  },
  {
    key: "ml",
    label: "ML Lab",
    defaultTab: "ml",
    accent: "#f43f5e",
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#2d0a1a"/>
        <circle cx="258" cy="18" r="70" fill="#4a0f28" opacity="0.5"/>
        <circle cx="20" cy="118" r="45" fill="#4a0f28" opacity="0.3"/>
        <circle cx="44" cy="42" r="9" fill="#f43f5e" opacity="0.9"/>
        <circle cx="44" cy="70" r="9" fill="#f43f5e" opacity="0.9"/>
        <circle cx="44" cy="98" r="9" fill="#f43f5e" opacity="0.9"/>
        <circle cx="110" cy="32" r="9" fill="#f43f5e" opacity="0.65"/>
        <circle cx="110" cy="60" r="9" fill="#f43f5e" opacity="0.65"/>
        <circle cx="110" cy="88" r="9" fill="#f43f5e" opacity="0.65"/>
        <circle cx="110" cy="108" r="9" fill="#f43f5e" opacity="0.65"/>
        <circle cx="176" cy="42" r="9" fill="#f43f5e" opacity="0.5"/>
        <circle cx="176" cy="70" r="9" fill="#f43f5e" opacity="0.5"/>
        <circle cx="176" cy="98" r="9" fill="#f43f5e" opacity="0.5"/>
        <circle cx="242" cy="56" r="9" fill="#f43f5e" opacity="0.9"/>
        <circle cx="242" cy="84" r="9" fill="#f43f5e" opacity="0.9"/>
        <line x1="53" y1="42" x2="101" y2="32" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="53" y1="42" x2="101" y2="60" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="53" y1="70" x2="101" y2="60" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="53" y1="70" x2="101" y2="88" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="53" y1="98" x2="101" y2="88" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="53" y1="98" x2="101" y2="108" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="119" y1="32" x2="167" y2="42" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="119" y1="60" x2="167" y2="42" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="119" y1="60" x2="167" y2="70" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="119" y1="88" x2="167" y2="70" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="119" y1="88" x2="167" y2="98" stroke="#f43f5e" strokeWidth="0.8" opacity="0.3"/>
        <line x1="185" y1="42" x2="233" y2="56" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
        <line x1="185" y1="70" x2="233" y2="56" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
        <line x1="185" y1="70" x2="233" y2="84" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
        <line x1="185" y1="98" x2="233" y2="84" stroke="#f43f5e" strokeWidth="0.8" opacity="0.4"/>
        <text x="24" y="130" fontFamily="system-ui,sans-serif" fontSize="11" fontWeight="700" fill="white" opacity="0.9" letterSpacing="0.5">ML Lab</text>
        <text x="24" y="12" fontFamily="system-ui,sans-serif" fontSize="7" fontWeight="700" fill="rgba(253,164,175,0.6)" letterSpacing="2">TRAIN · EVALUATE · PREDICT</text>
      </svg>
    ),
  },
];

const featureMechanics = [
  {
    title: "Dataset intake",
    accent: "#7ad6ff",
    detail: "Upload CSVs, keep them in the library, choose the active dataset, and check the first quality signals before opening the full report.",
    flow: "Start there, then open Analysis when you want the deeper report.",
  },
  {
    title: "Analysis report",
    accent: "#9db8ff",
    detail: "Start with summary and findings, then move into health, fields, patterns, and ML when you need more depth.",
    flow: "Use the grouped map to move from summary into the deeper report surfaces.",
  },
  {
    title: "Run archive",
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
    detail: "Manage profile info, remembered login, library cleanup, and deletion tools from one place.",
    flow: "Use the profile menu when you need account, uploads, or history shortcuts.",
  },
];

function truncateText(text: string, maxLength: number) {
  return text.length > maxLength ? `${text.slice(0, maxLength)}…` : text;
}

const desktopWorkflowPills = ["Upload", "Analyse", "Export"];

export default function DashboardPage() {
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);
  const [dashUser, setDashUser] = useState<User | null>(null);



  useEffect(() => {
    let active = true;

    const refreshAnalyses = async () => {
      try {
        setError("");
        setAnalyses(await getAnalyses());
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Failed to load dashboard.");
      }
    };

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
        await refreshAnalyses();
      } finally {
        if (active) setLoading(false);
      }
    };

    void bootstrap();

    const handleAuthChange = () => {
      if (!active) return;
      void bootstrap();
    };

    const unsubscribeAnalysisState = subscribeToAnalysisStateChanges(() => {
      if (!active) return;
      void refreshAnalyses();
    });

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
      unsubscribeAnalysisState();
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
        mobileDescription="Saved runs, latest findings, and your next step."
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
            <DashboardMobileSections analyses={analyses} latest={latest} />

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
                    <p className="desktop-panel-title">Analysis breakdown</p>
                    <ScrollIntentLink href="/analysis" className="desktop-panel-action">Open workspace</ScrollIntentLink>
                  </div>
                  <div className="grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                    {analysisBreakdownCards.map((item) => (
                      <div key={item.title} className="rounded-xl border border-white/8 bg-white/[0.02] p-4">
                        <p className="text-sm font-semibold text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-white/52">{item.detail}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {item.tabs.map((tab) => (
                            <span key={`${item.title}-${tab}`} className="desktop-badge" data-tone="purple">
                              {tab}
                            </span>
                          ))}
                        </div>
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

/* ── Phone and tablet dashboard layout ── */
function DashboardMobileSections({
  analyses,
  latest,
}: {
  analyses: AnalysisListItem[];
  latest: AnalysisListItem | null;
}) {
  const recentAnalyses = analyses.slice(0, 3);

  return (
    <div className="phone-only mobile-screen-stack">
      <section className="mobile-screen-panel section-glow" style={{ position: "relative", overflow: "hidden" }}>
        {/* segmented-arc motif from design system */}
        <svg viewBox="0 0 160 160" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "-20px", top: "-20px", width: "130px", height: "130px", opacity: 0.35, pointerEvents: "none" }}>
          <circle cx="80" cy="80" r="60" fill="none" stroke="#4f6ef7" strokeWidth="10" strokeDasharray="38 188" strokeDashoffset="-8" strokeLinecap="round" opacity="0.7"/>
          <circle cx="80" cy="80" r="60" fill="none" stroke="#22c55e" strokeWidth="10" strokeDasharray="50 188" strokeDashoffset="-52" strokeLinecap="round" opacity="0.55"/>
          <circle cx="80" cy="80" r="60" fill="none" stroke="#a78bfa" strokeWidth="10" strokeDasharray="30 188" strokeDashoffset="-108" strokeLinecap="round" opacity="0.45"/>
          <circle cx="80" cy="80" r="60" fill="none" stroke="#f59e0b" strokeWidth="10" strokeDasharray="42 188" strokeDashoffset="-144" strokeLinecap="round" opacity="0.5"/>
          <circle cx="80" cy="80" r="42" fill="none" stroke="#0d1221" strokeWidth="6"/>
        </svg>
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Latest run</p>
            <h2 className="mobile-screen-title">
              {latest ? latest.overview.dataset_name : "Start with your first dataset"}
            </h2>
            <p className="mobile-screen-lead">
              {latest
                ? truncateText(latest.insights.summary, 88)
                : "Upload a CSV in Uploads, then reopen the saved run here."}
            </p>
          </div>
        </div>
        <div className="mobile-screen-pills">
          <span className="mobile-screen-pill" data-tone="teal">
            {latest ? `${latest.overview.row_count.toLocaleString()} rows` : "CSV intake"}
          </span>
          <span className="mobile-screen-pill" data-tone="purple">
            {latest ? `${latest.overview.column_count} columns` : "Open Analysis fast"}
          </span>
          <span className="mobile-screen-pill" data-tone={latest?.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
            {latest ? (latest.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first") : "History saved"}
          </span>
        </div>
        <div className="mobile-screen-actions">
          <ScrollIntentLink
            href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"}
            className="mobile-screen-button mobile-screen-button-primary"
          >
            {latest ? "Open latest run" : "Upload first dataset"}
          </ScrollIntentLink>
          <ScrollIntentLink href="/history" className="mobile-screen-button mobile-screen-button-secondary">
            View history
          </ScrollIntentLink>
        </div>
      </section>

      <section className="mobile-screen-panel">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Studio map</p>
            <h2 className="mobile-screen-title">Core workspaces</h2>
          </div>
        </div>
        <div className="mobile-screen-link-grid">
          {destinationCards.map((item) => (
            <ScrollIntentLink key={`${item.href}-${item.title}`} href={item.href} className="mobile-screen-link-card">
              <p className="mobile-screen-link-title">{item.title}</p>
              <span className="mobile-screen-link-cta">{item.cta}</span>
            </ScrollIntentLink>
          ))}
        </div>
      </section>

      {recentAnalyses.length ? (
        <section className="mobile-screen-panel">
          <div className="mobile-screen-panel-header">
            <div>
              <p className="mobile-screen-kicker">Recent uploads</p>
              <h2 className="mobile-screen-title">Recent datasets</h2>
            </div>
            <ScrollIntentLink href="/batch" className="mobile-screen-panel-action">
              Uploads
            </ScrollIntentLink>
          </div>
          <div className="mobile-screen-list">
            {recentAnalyses.map((analysis) => (
              <div key={analysis.id} className="mobile-screen-row">
                <div className="mobile-screen-row-header">
                  <div className="mobile-screen-row-main">
                    <p className="mobile-screen-row-title">{analysis.overview.dataset_name}</p>
                    <p className="mobile-screen-row-meta">{analysis.source_filename}</p>
                  </div>
                  <span className="mobile-screen-pill" data-tone={analysis.insights.modeling_readiness.is_ready ? "teal" : "amber"}>
                    {analysis.insights.modeling_readiness.is_ready ? "ML-ready" : "EDA-first"}
                  </span>
                </div>
                <p className="mobile-screen-row-copy">{truncateText(analysis.insights.summary, 80)}</p>
                <div className="mobile-screen-pills compact">
                  <span className="mobile-screen-pill">{analysis.overview.row_count.toLocaleString()} rows</span>
                  <span className="mobile-screen-pill">{analysis.overview.column_count} cols</span>
                  <span className="mobile-screen-pill">Saved {formatDate(analysis.saved_at)}</span>
                </div>
                <div className="mobile-screen-row-actions">
                  <ScrollIntentLink href={`/analysis?analysisId=${analysis.id}`} className="mobile-screen-button mobile-screen-button-primary">
                    Open run
                  </ScrollIntentLink>
                  <ScrollIntentLink href="/history" className="mobile-screen-button mobile-screen-button-secondary">
                    Archive
                  </ScrollIntentLink>
                </div>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <section className="mobile-screen-panel">
        <div className="mobile-screen-panel-header">
          <div>
            <p className="mobile-screen-kicker">Breakdowns</p>
            <h2 className="mobile-screen-title">See how the studio is organised</h2>
            <p className="mobile-screen-lead">Tap a header to review the Analysis map or the way the core features fit together.</p>
          </div>
        </div>

        <details className="mobile-accordion" open>
          <summary>
            <p className="mobile-screen-row-title">Analysis breakdown</p>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mobile-analysis-svg-grid">
              {dashboardCardCovers.map((card) => (
                <ScrollIntentLink
                  key={card.key}
                  href={latest ? `/analysis?analysisId=${latest.id}&tab=${card.defaultTab}` : `/analysis`}
                  className="mobile-analysis-svg-card"
                  style={{ "--analysis-card-accent": card.accent } as React.CSSProperties}
                >
                  {card.cover}
                  <span className="mobile-analysis-svg-card-tap">Tap to open</span>
                </ScrollIntentLink>
              ))}
            </div>
            <div className="mobile-screen-actions">
              <ScrollIntentLink
                href={latest ? `/analysis?analysisId=${latest.id}` : "/analysis"}
                className="mobile-screen-button mobile-screen-button-primary"
              >
                {latest ? "Open latest analysis" : "Open analysis"}
              </ScrollIntentLink>
            </div>
          </div>
        </details>

        <details className="mobile-accordion">
          <summary>
            <p className="mobile-screen-row-title">How features work</p>
          </summary>
          <div className="mobile-accordion-body">
            <div className="mobile-screen-list">
              {featureMechanics.map((item) => (
                <div key={item.title} className="mobile-screen-row">
                  <p className="mobile-screen-row-title" style={{ color: item.accent }}>{item.title}</p>
                  <p className="mobile-screen-row-copy">{item.detail}</p>
                  <p className="mobile-screen-row-note">{item.flow}</p>
                </div>
              ))}
            </div>
            <div className="mobile-screen-actions">
              <ScrollIntentLink
                href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"}
                className="mobile-screen-button mobile-screen-button-secondary"
              >
                {latest ? "Open latest run" : "Go to dataset library"}
              </ScrollIntentLink>
            </div>
          </div>
        </details>
      </section>
    </div>
  );
}