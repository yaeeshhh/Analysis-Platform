"use client";

import { useEffect, useState, type CSSProperties } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { getAnalyses } from "@/lib/analysisApi";
import { getAnalysisTabDefinition } from "@/lib/analysisNavigation";
import { AnalysisListItem } from "@/lib/analysisTypes";
import { analysisVisualCards } from "@/lib/analysisVisualCards";
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
              <section className="desktop-hero-panel section-glow" style={{ overflow: "hidden" }}>
                {/* Decorative data-pipeline SVG — right side of hero */}
                <svg
                  viewBox="0 0 220 130"
                  xmlns="http://www.w3.org/2000/svg"
                  aria-hidden="true"
                  style={{
                    position: "absolute",
                    right: "1.5rem",
                    top: "50%",
                    transform: "translateY(-50%)",
                    width: "200px",
                    height: "118px",
                    opacity: 0.52,
                    pointerEvents: "none",
                  }}
                >
                  {/* Connection lines */}
                  <line x1="28" y1="65" x2="72" y2="32" stroke="#4f6ef7" strokeWidth="1" opacity="0.7" strokeDasharray="5,4"/>
                  <line x1="28" y1="65" x2="72" y2="98" stroke="#22c55e" strokeWidth="1" opacity="0.6" strokeDasharray="5,4"/>
                  <line x1="80" y1="32" x2="126" y2="50" stroke="#a78bfa" strokeWidth="1" opacity="0.65" strokeDasharray="5,4"/>
                  <line x1="80" y1="98" x2="126" y2="80" stroke="#f59e0b" strokeWidth="1" opacity="0.55" strokeDasharray="5,4"/>
                  <line x1="134" y1="50" x2="180" y2="65" stroke="#4f6ef7" strokeWidth="1.2" opacity="0.7" strokeDasharray="5,4"/>
                  <line x1="134" y1="80" x2="180" y2="65" stroke="#a78bfa" strokeWidth="1.2" opacity="0.65" strokeDasharray="5,4"/>
                  {/* Cross connections */}
                  <line x1="80" y1="32" x2="80" y2="98" stroke="rgba(255,255,255,0.08)" strokeWidth="0.7"/>
                  <line x1="126" y1="50" x2="126" y2="80" stroke="rgba(255,255,255,0.08)" strokeWidth="0.7"/>
                  {/* Outer ring nodes */}
                  <circle cx="28" cy="65" r="9" fill="rgba(79,110,247,0.14)" stroke="#4f6ef7" strokeWidth="1.6"/>
                  <circle cx="76" cy="32" r="8" fill="rgba(34,197,94,0.12)" stroke="#22c55e" strokeWidth="1.4"/>
                  <circle cx="76" cy="98" r="8" fill="rgba(245,158,11,0.12)" stroke="#f59e0b" strokeWidth="1.4"/>
                  <circle cx="130" cy="50" r="9" fill="rgba(167,139,250,0.16)" stroke="#a78bfa" strokeWidth="1.6"/>
                  <circle cx="130" cy="80" r="8" fill="rgba(34,197,94,0.1)" stroke="#22c55e" strokeWidth="1.4"/>
                  {/* Centre hub */}
                  <circle cx="180" cy="65" r="11" fill="rgba(79,110,247,0.2)" stroke="#4f6ef7" strokeWidth="2"/>
                  <circle cx="180" cy="65" r="5" fill="#4f6ef7" opacity="0.6"/>
                  {/* Inner dots */}
                  <circle cx="28" cy="65" r="3" fill="#4f6ef7" opacity="0.85"/>
                  <circle cx="76" cy="32" r="2.5" fill="#22c55e" opacity="0.9"/>
                  <circle cx="76" cy="98" r="2.5" fill="#f59e0b" opacity="0.85"/>
                  <circle cx="130" cy="50" r="3" fill="#a78bfa" opacity="0.9"/>
                  <circle cx="130" cy="80" r="2.5" fill="#22c55e" opacity="0.8"/>
                  {/* Ambient dots */}
                  <circle cx="12" cy="18" r="1.2" fill="rgba(79,110,247,0.4)"/>
                  <circle cx="42" cy="8" r="1" fill="rgba(167,139,250,0.35)"/>
                  <circle cx="10" cy="112" r="1.2" fill="rgba(34,197,94,0.35)"/>
                  <circle cx="55" cy="122" r="1" fill="rgba(79,110,247,0.3)"/>
                  <circle cx="200" cy="16" r="1.2" fill="rgba(244,63,94,0.38)"/>
                  <circle cx="215" cy="105" r="1" fill="rgba(167,139,250,0.3)"/>
                </svg>

                <span className="desktop-kicker">Getting started</span>
                <h2 className="desktop-section-title" style={{ maxWidth: "58%" }}>Navigate the studio from upload to model review</h2>
                <p className="desktop-section-text" style={{ maxWidth: "54%" }}>Upload a dataset, review the explanation first, then reopen saved history or export ML outputs when the report is ready.</p>
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
                <section className="desktop-panel" style={{ overflow: "hidden" }}>
                  {/* Decorative micro sparkline — top-right corner */}
                  <svg viewBox="0 0 80 36" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "1.1rem", top: "0.85rem", width: "72px", height: "32px", opacity: 0.38, pointerEvents: "none" }}>
                    <polyline points="4,28 16,20 28,24 40,10 52,16 64,8 76,12" fill="none" stroke="#4f6ef7" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"/>
                    <circle cx="40" cy="10" r="2.5" fill="#4f6ef7" opacity="0.9"/>
                    <circle cx="64" cy="8" r="2.5" fill="#22c55e" opacity="0.8"/>
                    <line x1="0" y1="32" x2="80" y2="32" stroke="rgba(79,110,247,0.2)" strokeWidth="1"/>
                  </svg>
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

                <section className="desktop-panel" style={{ overflow: "hidden" }}>
                  {/* Decorative radial rings */}
                  <svg viewBox="0 0 60 60" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "0.9rem", top: "0.7rem", width: "52px", height: "52px", opacity: 0.36, pointerEvents: "none" }}>
                    <circle cx="30" cy="30" r="12" fill="none" stroke="#a78bfa" strokeWidth="1.2" strokeDasharray="4,3" opacity="0.7"/>
                    <circle cx="30" cy="30" r="20" fill="none" stroke="#4f6ef7" strokeWidth="0.8" strokeDasharray="6,4" opacity="0.45"/>
                    <circle cx="30" cy="30" r="4" fill="#a78bfa" opacity="0.4"/>
                    <circle cx="30" cy="18" r="2" fill="#4f6ef7" opacity="0.6"/>
                    <circle cx="42" cy="30" r="1.5" fill="#22c55e" opacity="0.5"/>
                    <circle cx="18" cy="34" r="1.5" fill="#f59e0b" opacity="0.5"/>
                  </svg>
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
                <section className="desktop-panel" style={{ overflow: "hidden" }}>
                  {/* Decorative grid-map SVG */}
                  <svg viewBox="0 0 64 48" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "0.9rem", top: "0.7rem", width: "58px", height: "44px", opacity: 0.38, pointerEvents: "none" }}>
                    <rect x="4" y="4" width="24" height="18" rx="3" fill="none" stroke="#4f6ef7" strokeWidth="1.2" opacity="0.6"/>
                    <rect x="36" y="4" width="24" height="18" rx="3" fill="none" stroke="#22c55e" strokeWidth="1.2" opacity="0.6"/>
                    <rect x="4" y="28" width="24" height="16" rx="3" fill="none" stroke="#a78bfa" strokeWidth="1.2" opacity="0.6"/>
                    <rect x="36" y="28" width="24" height="16" rx="3" fill="none" stroke="#f59e0b" strokeWidth="1.2" opacity="0.6"/>
                    <line x1="28" y1="13" x2="36" y2="13" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
                    <line x1="16" y1="22" x2="16" y2="28" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
                    <line x1="48" y1="22" x2="48" y2="28" stroke="rgba(255,255,255,0.15)" strokeWidth="0.8"/>
                    <circle cx="16" cy="13" r="3" fill="#4f6ef7" opacity="0.5"/>
                    <circle cx="48" cy="13" r="3" fill="#22c55e" opacity="0.5"/>
                    <circle cx="16" cy="36" r="3" fill="#a78bfa" opacity="0.5"/>
                    <circle cx="48" cy="36" r="3" fill="#f59e0b" opacity="0.5"/>
                  </svg>
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
                  <div className="desktop-studio-note">
                    <div>
                      <p className="desktop-studio-note-kicker">Suggested route</p>
                      <p className="desktop-studio-note-title">Start in the library, move through the report, finish in the archive.</p>
                      <p className="desktop-studio-note-copy">Uploads is the intake lane, Analysis is the working surface, History is the long-term record, and Account handles the cleanup tools around it.</p>
                    </div>
                    <div className="desktop-studio-route">
                      {desktopWorkflowPills.map((label, index) => (
                        <span key={`studio-route-${label}`} className="desktop-step-pill">
                          <strong>{index + 1}</strong>
                          {label}
                        </span>
                      ))}
                    </div>
                  </div>
                </section>

                <section className="desktop-panel">
                  <div className="desktop-panel-header">
                    <p className="desktop-panel-title">Analysis breakdown</p>
                    <ScrollIntentLink href="/analysis" className="desktop-panel-action">Open workspace</ScrollIntentLink>
                  </div>
                  <div className="analysis-visual-grid" data-layout="dashboard">
                    {analysisVisualCards.map((card) => (
                      <article
                        key={card.key}
                        className="analysis-visual-card analysis-visual-card-static"
                        style={{ "--analysis-card-accent": card.accent, "--analysis-card-border": `${card.accent}33` } as CSSProperties}
                      >
                        <div className="analysis-visual-cover">{card.cover}</div>
                        <div className="analysis-visual-body">
                          <p className="analysis-visual-title">{card.label}</p>
                          <p className="analysis-visual-copy">{card.description}</p>
                          <div className="analysis-visual-tabs">
                            {card.tabKeys.map((tabKey) => {
                              const tab = getAnalysisTabDefinition(tabKey);
                              return (
                                <span key={`${card.key}-${tab.key}`} className="desktop-badge" data-tone="purple">
                                  {tab.label}
                                </span>
                              );
                            })}
                          </div>
                        </div>
                      </article>
                    ))}
                  </div>
                  <div className="analysis-breakdown-footer">
                    <div className="analysis-breakdown-note">
                      <p className="analysis-breakdown-note-kicker">Coverage</p>
                      <p className="analysis-breakdown-note-title">One report spine, five coloured reading lanes.</p>
                      <p className="analysis-breakdown-note-copy">Summary stays blue, quality stays green, schema keeps the violet structure pass, charts stay amber, and ML ends in the red lab surface.</p>
                    </div>
                    <div className="analysis-breakdown-legend">
                      {analysisVisualCards.map((card) => (
                        <div
                          key={`analysis-breakdown-${card.key}`}
                          className="analysis-breakdown-legend-item"
                          style={{ "--analysis-card-accent": card.accent } as CSSProperties}
                        >
                          <span className="analysis-breakdown-legend-swatch" />
                          <span>{card.label}</span>
                        </div>
                      ))}
                    </div>
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
                  {featureMechanics.map((item, idx) => (
                    <div key={item.title} className="rounded-xl border border-white/8 bg-white/[0.02] p-4" style={{ position: "relative", overflow: "hidden" }}>
                      {/* Per-card decorative SVG corner */}
                      <svg viewBox="0 0 64 64" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "0.6rem", top: "0.6rem", width: "44px", height: "44px", opacity: 0.45, pointerEvents: "none" }}>
                        {idx % 6 === 0 && (
                          // Dataset intake — upload arrows
                          <>
                            <circle cx="32" cy="32" r="22" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.4"/>
                            <path d="M32 42V22" stroke={item.accent} strokeWidth="2" strokeLinecap="round" opacity="0.8"/>
                            <path d="M24 30l8-8 8 8" stroke={item.accent} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity="0.8"/>
                            <path d="M22 44h20" stroke={item.accent} strokeWidth="1.5" strokeLinecap="round" opacity="0.5"/>
                          </>
                        )}
                        {idx % 6 === 1 && (
                          // Analysis report — document with chart
                          <>
                            <rect x="16" y="10" width="32" height="44" rx="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.4"/>
                            <rect x="22" y="20" width="20" height="2.5" rx="1" fill={item.accent} opacity="0.5"/>
                            <rect x="22" y="28" width="14" height="2.5" rx="1" fill={item.accent} opacity="0.4"/>
                            <rect x="22" y="36" width="8" height="8" rx="1.5" fill={item.accent} opacity="0.3"/>
                            <rect x="34" y="39" width="8" height="5" rx="1.5" fill={item.accent} opacity="0.45"/>
                          </>
                        )}
                        {idx % 6 === 2 && (
                          // Run archive — stacked layers
                          <>
                            <ellipse cx="32" cy="24" rx="18" ry="6" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.35"/>
                            <ellipse cx="32" cy="32" rx="18" ry="6" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.5"/>
                            <ellipse cx="32" cy="40" rx="18" ry="6" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.7"/>
                            <line x1="14" y1="24" x2="14" y2="40" stroke={item.accent} strokeWidth="1.2" opacity="0.5"/>
                            <line x1="50" y1="24" x2="50" y2="40" stroke={item.accent} strokeWidth="1.2" opacity="0.5"/>
                          </>
                        )}
                        {idx % 6 === 3 && (
                          // Charts — bar + trend line
                          <>
                            <line x1="12" y1="52" x2="52" y2="52" stroke={item.accent} strokeWidth="1" opacity="0.3"/>
                            <rect x="14" y="38" width="8" height="14" rx="1.5" fill={item.accent} opacity="0.35"/>
                            <rect x="26" y="28" width="8" height="24" rx="1.5" fill={item.accent} opacity="0.55"/>
                            <rect x="38" y="20" width="8" height="32" rx="1.5" fill={item.accent} opacity="0.75"/>
                            <polyline points="14,44 26,32 38,24 50,30" fill="none" stroke={item.accent} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" opacity="0.7"/>
                          </>
                        )}
                        {idx % 6 === 4 && (
                          // ML lanes — neural network
                          <>
                            <circle cx="14" cy="22" r="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.7"/>
                            <circle cx="14" cy="42" r="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.7"/>
                            <circle cx="32" cy="16" r="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.5"/>
                            <circle cx="32" cy="32" r="4.5" fill={item.accent} opacity="0.25" stroke={item.accent} strokeWidth="1.5"/>
                            <circle cx="32" cy="48" r="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.5"/>
                            <circle cx="50" cy="32" r="4" fill="none" stroke={item.accent} strokeWidth="1.2" opacity="0.7"/>
                            <line x1="18" y1="22" x2="28" y2="18" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                            <line x1="18" y1="22" x2="28" y2="32" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                            <line x1="18" y1="42" x2="28" y2="32" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                            <line x1="18" y1="42" x2="28" y2="48" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                            <line x1="36" y1="16" x2="46" y2="30" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                            <line x1="36" y1="32" x2="46" y2="32" stroke={item.accent} strokeWidth="0.8" opacity="0.5"/>
                            <line x1="36" y1="48" x2="46" y2="34" stroke={item.accent} strokeWidth="0.8" opacity="0.4"/>
                          </>
                        )}
                        {idx % 6 === 5 && (
                          // Account cleanup — settings gear
                          <>
                            <circle cx="32" cy="32" r="10" fill="none" stroke={item.accent} strokeWidth="1.5" opacity="0.65"/>
                            <circle cx="32" cy="32" r="4" fill={item.accent} opacity="0.35"/>
                            {[0,60,120,180,240,300].map((angle, i) => {
                              const rad = (angle * Math.PI) / 180;
                              const x1 = 32 + 12 * Math.cos(rad);
                              const y1 = 32 + 12 * Math.sin(rad);
                              const x2 = 32 + 18 * Math.cos(rad);
                              const y2 = 32 + 18 * Math.sin(rad);
                              return <line key={i} x1={x1} y1={y1} x2={x2} y2={y2} stroke={item.accent} strokeWidth="2.5" strokeLinecap="round" opacity="0.6"/>;
                            })}
                          </>
                        )}
                      </svg>
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
              {analysisVisualCards.map((card) => (
                <article
                  key={card.key}
                  className="mobile-analysis-svg-card mobile-analysis-svg-card-static"
                  style={{ "--analysis-card-accent": card.accent } as CSSProperties}
                >
                  {card.cover}
                </article>
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