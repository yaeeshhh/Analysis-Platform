"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { getAnalyses } from "@/lib/analysisApi";
import { AnalysisListItem } from "@/lib/analysisTypes";
import { isAnalysisStateStorageEvent } from "@/lib/currentAnalysis";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
import { resolveAuthenticatedUser } from "@/lib/session";

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
    accent: "#ffb079",
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
    accent: "#ffd76d",
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

export default function DashboardPage() {
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [analyses, setAnalyses] = useState<AnalysisListItem[]>([]);

  useApplyNavigationScroll("/dashboard", !loading);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);
      setError("");

      const user = await resolveAuthenticatedUser();
      if (!active) return;
      if (!user) {
        setAnalyses([]);
        setLoginRequired(false);
        setLoading(false);
        return;
      }

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
  const mlReadyRuns = analyses.filter((item) => item.insights.modeling_readiness.is_ready).length;
  const totalExperiments = analyses.reduce((sum, item) => sum + item.experiment_count, 0);
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
        eyebrow="Analysis Dashboard"
        title="Navigate the studio from upload to model review"
        description="Use Uploads for dataset intake, Analysis for the full report, History for saved runs and downloads, and Account for security and cleanup actions."
        stats={stats}
      >
        {error ? (
          <div className="rounded-[24px] border border-[#ff8c8c]/30 bg-[#ff8c8c]/10 px-5 py-4 text-sm text-[#ffe1e1]">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-sm text-white/55">
            Loading dashboard...
          </div>
        ) : null}

        {!loading ? (
          <>
            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Recommended workflow</p>
              <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {workflowSteps.map((step) => (
                  <div key={step.title} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="font-medium text-white">{step.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/64">{step.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">Studio pages</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
                    Each page has a narrow role. Uploads stages or selects the current dataset, Analysis explains it, History manages archived runs, and Account handles access plus cleanup.
                  </p>
                </div>
                <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82">
                  Open history archive
                </ScrollIntentLink>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {destinationCards.map((item) => (
                  <ScrollIntentLink
                    key={`${item.href}-${item.title}`}
                    href={item.href}
                    className="flex h-full flex-col rounded-2xl border border-white/10 bg-black/10 p-4 transition hover:bg-white/[0.06]"
                  >
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/64">{item.detail}</p>
                    <p className="mt-auto pt-4 text-sm font-medium text-[#ffcfaa]">{item.cta}</p>
                  </ScrollIntentLink>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Analysis tabs</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
                    After a dataset is uploaded, the Analysis workspace becomes the detailed report surface. These tabs are ordered to move from explanation first to detail later.
                  </p>
                </div>
                <ScrollIntentLink href="/analysis" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82">
                  Open analysis workspace
                </ScrollIntentLink>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-4">
                {analysisTabCards.map((item) => (
                  <div key={item.title} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="font-medium text-white">{item.title}</p>
                    <p className="mt-2 text-sm leading-6 text-white/64">{item.detail}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#ffd76d]">History archive</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
                    History is its own archive surface, not another Analysis tab. It owns saved-run search, detached popup reopening, archived downloads, and pruning old ML runs without replacing the current dataset in Analysis.
                  </p>
                </div>
                <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82">
                  Open history tools
                </ScrollIntentLink>
              </div>

              <div className="mt-5 grid gap-4 xl:grid-cols-[minmax(0,1.18fr)_minmax(320px,0.82fr)]">
                <article className="rounded-[26px] border border-white/10 bg-black/10 p-5">
                  <p className="text-sm leading-6 text-white/68">
                    Use History when you need to recover earlier work, compare past runs without disturbing the current dataset, or manage saved ML artifacts at the archive level instead of rerunning the lab.
                  </p>
                  <div className="mt-4 grid gap-3 md:grid-cols-3">
                    {historyFeatureCards.map((item) => (
                      <div key={item.title} className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                        <p className="font-medium text-white">{item.title}</p>
                        <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                      </div>
                    ))}
                  </div>
                </article>

                <article className="rounded-[26px] border border-white/10 bg-black/10 p-5">
                  <p className="text-xs uppercase tracking-[0.18em] text-white/42">Archive snapshot</p>
                  <div className="mt-4 grid gap-3">
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/42">Latest saved run</p>
                      <p className="mt-2 text-lg font-medium text-white">
                        {latest ? latest.overview.dataset_name : "No saved runs yet"}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4">
                      <p className="text-xs uppercase tracking-[0.14em] text-white/42">Archive volume</p>
                      <p className="mt-2 text-lg font-medium text-white">
                        {analyses.length.toLocaleString()} saved run{analyses.length === 1 ? "" : "s"} • {totalExperiments.toLocaleString()} saved ML run{totalExperiments === 1 ? "" : "s"}
                      </p>
                    </div>
                    <div className="rounded-[20px] border border-white/10 bg-white/[0.03] p-4 text-sm leading-6 text-white/62">
                      Browse archived results without replacing the dataset that is currently open in Analysis.
                    </div>
                  </div>
                </article>
              </div>
            </section>

            <section className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-xs uppercase tracking-[0.24em] text-[#d7b7ff]">How features work</p>
                  <p className="mt-2 max-w-3xl text-sm leading-6 text-white/64">
                    Each major surface has a narrow role so the workflow stays predictable. This is the product map for uploads, persistence, charts, saved experiments, and cleanup.
                  </p>
                </div>
                <ScrollIntentLink href="/account" className="rounded-full border border-white/12 px-4 py-2 text-sm text-white/82">
                  Review account tools
                </ScrollIntentLink>
              </div>
              <div className="mt-5 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                {featureMechanics.map((item) => (
                  <article key={item.title} className="rounded-2xl border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.16em]" style={{ color: item.accent }}>
                      {item.title}
                    </p>
                    <p className="mt-3 text-sm leading-6 text-white/66">{item.detail}</p>
                    <div className="mt-3 rounded-[18px] border border-white/8 bg-white/[0.03] p-3 text-sm leading-6 text-white/58">
                      {item.flow}
                    </div>
                  </article>
                ))}
              </div>
            </section>

            <section className="grid gap-4 lg:grid-cols-3">
              <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#8bf1a8]">Persistence</p>
                <p className="mt-3 text-sm leading-6 text-white/68">
                  Uploads and ML experiments are persisted automatically. Use History when you need to reopen or download older work, use Uploads when you want to change or clear the current dataset selection, and use Account when you want to clear saved runs.
                </p>
              </article>

              <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#d7b7ff]">Overview first</p>
                <p className="mt-3 text-sm leading-6 text-white/68">
                  Overview surfaces the headline findings first, then the technical tabs provide the evidence and detail behind them.
                </p>
              </article>

              <article className="rounded-[28px] border border-white/10 bg-white/[0.04] p-5">
                <p className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Latest saved run</p>
                <p className="mt-3 text-sm leading-6 text-white/68">
                  {latest
                    ? `${latest.overview.dataset_name} is the most recent saved run. Open Uploads to review quick quality signals or open Analysis to continue through the full report.`
                    : "No saved analysis yet. Open Uploads to upload the first CSV."}
                </p>
                <div className="mt-4 flex flex-wrap gap-3">
                  <ScrollIntentLink href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"} className="rounded-full bg-[#ffb079] px-5 py-3 text-sm font-semibold text-[#11273b]">
                    {latest ? "Open latest run" : "Open uploads page"}
                  </ScrollIntentLink>
                  <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
                    View saved history
                  </ScrollIntentLink>
                </div>
              </article>
            </section>
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