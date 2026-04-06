"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";
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
            {/* ─── Phone: tappable list → slides ─── */}
            <DashboardMobileSections analyses={analyses} latest={latest} totalExperiments={totalExperiments} />

            {/* ─── Desktop: clean flowing sections ─── */}
            <div className="tablet-up space-y-0">

              {/* Workflow */}
              <section className="flow-section">
                <p className="flow-section-label">Recommended workflow</p>
                <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
                  {workflowSteps.map((step, i) => (
                    <div key={step.title}>
                      <p className="flex items-baseline gap-2 text-sm font-semibold text-white">
                        <span className="text-xs text-white/30">{i + 1}</span>
                        {step.title}
                      </p>
                      <p className="mt-1.5 text-sm leading-6 text-white/55">{step.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Studio pages */}
              <section className="flow-section">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flow-section-label">Studio pages</p>
                  <ScrollIntentLink href="/history" className="inline-tag">
                    Open history archive
                  </ScrollIntentLink>
                </div>
                <div className="mt-3">
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
                      <span className="text-sm text-white/30 transition group-hover:text-[#ffcfaa]">{item.cta} →</span>
                    </ScrollIntentLink>
                  ))}
                </div>
              </section>

              {/* Analysis tabs */}
              <section className="flow-section">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flow-section-label">Analysis tabs</p>
                  <ScrollIntentLink href="/analysis" className="inline-tag">
                    Open analysis workspace
                  </ScrollIntentLink>
                </div>
                <div className="mt-4 grid gap-x-8 gap-y-4 md:grid-cols-2 xl:grid-cols-4">
                  {analysisTabCards.map((item) => (
                    <div key={item.title}>
                      <p className="text-sm font-semibold text-white">{item.title}</p>
                      <p className="mt-1.5 text-sm leading-6 text-white/55">{item.detail}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* History archive */}
              <section className="flow-section">
                <div className="flex items-baseline justify-between gap-4">
                  <p className="flow-section-label">History archive</p>
                  <ScrollIntentLink href="/history" className="inline-tag">
                    Open history
                  </ScrollIntentLink>
                </div>
                <div className="mt-3 grid gap-6 xl:grid-cols-[1fr_auto]">
                  <div>
                    {historyFeatureCards.map((item) => (
                      <div key={item.title} className="list-row">
                        <div className="list-row-content">
                          <p className="list-row-title">{item.title}</p>
                          <p className="list-row-hint">{item.detail}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="stat-row xl:flex-col xl:gap-4">
                    <div className="stat-row-item">
                      <p className="stat-row-value">{latest ? latest.overview.dataset_name : "—"}</p>
                      <p className="stat-row-label">Latest run</p>
                    </div>
                    <div className="stat-row-item">
                      <p className="stat-row-value">{analyses.length}</p>
                      <p className="stat-row-label">Saved runs</p>
                    </div>
                    <div className="stat-row-item">
                      <p className="stat-row-value">{totalExperiments}</p>
                      <p className="stat-row-label">ML experiments</p>
                    </div>
                  </div>
                </div>
              </section>

              {/* Features */}
              <section className="flow-section">
                <p className="flow-section-label">How features work</p>
                <div className="mt-4 grid gap-x-8 gap-y-5 md:grid-cols-2 xl:grid-cols-3">
                  {featureMechanics.map((item) => (
                    <div key={item.title}>
                      <p className="text-xs font-bold uppercase tracking-wide" style={{ color: item.accent }}>{item.title}</p>
                      <p className="mt-2 text-sm leading-6 text-white/60">{item.detail}</p>
                      <p className="mt-1.5 text-sm leading-6 text-white/40">{item.flow}</p>
                    </div>
                  ))}
                </div>
              </section>

              {/* Quick actions strip */}
              <section className="flow-section">
                <div className="flex flex-wrap items-center gap-4">
                  <ScrollIntentLink href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"} className="rounded-full bg-[#ffb079] px-5 py-2.5 text-sm font-semibold text-[#11273b]">
                    {latest ? "Open latest run" : "Open uploads page"}
                  </ScrollIntentLink>
                  <ScrollIntentLink href="/history" className="rounded-full border border-white/10 px-5 py-2.5 text-sm text-white/70">
                    View saved history
                  </ScrollIntentLink>
                  <p className="text-sm text-white/40">
                    {latest
                      ? `${latest.overview.dataset_name} is the most recent saved run.`
                      : "No saved analysis yet — upload a CSV to get started."}
                  </p>
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
      accent: "#ffb079",
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
          <ScrollIntentLink href="/analysis" className="mb-3 block rounded-full bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
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
      accent: "#ffd76d",
      content: (
        <div>
          <ScrollIntentLink href="/history" className="mb-3 block rounded-full bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
            Open history tools
          </ScrollIntentLink>
          {historyFeatureCards.map((item) => (
            <div key={item.title} className="border-b border-white/6 py-3 last:border-0">
              <p className="text-sm font-semibold text-white">{item.title}</p>
              <p className="mt-1 text-sm leading-6 text-white/55">{item.detail}</p>
            </div>
          ))}
          <div className="mt-3 flex gap-4 text-sm text-white/50">
            <span>{analyses.length} saved run{analyses.length === 1 ? "" : "s"}</span>
            <span>·</span>
            <span>{totalExperiments} ML run{totalExperiments === 1 ? "" : "s"}</span>
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
          <ScrollIntentLink href={latest ? `/analysis?analysisId=${latest.id}` : "/batch"} className="block rounded-full bg-[#ffb079] px-5 py-3 text-center text-sm font-semibold text-[#11273b]">
            {latest ? "Open latest run" : "Open uploads page"}
          </ScrollIntentLink>
          <ScrollIntentLink href="/history" className="block rounded-full border border-white/12 px-5 py-3 text-center text-sm text-white/82">
            View saved history
          </ScrollIntentLink>
        </div>
      ),
    },
  ];

  return <MobileSectionList sections={sections} />;
}