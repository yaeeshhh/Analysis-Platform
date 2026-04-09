import { AnalysisInsights } from "@/lib/analysisTypes";
import { useDesktopAccordionsExpanded } from "@/lib/useDesktopAccordionsExpanded";

type InsightsTabProps = {
  insights: AnalysisInsights;
  mobileSection?: string | string[] | null;
};

function truncatePreview(text: string, limit = 108) {
  if (text.length <= limit) return text;
  return `${text.slice(0, Math.max(0, limit - 1)).trimEnd()}…`;
}

export default function InsightsTab({ insights, mobileSection }: InsightsTabProps) {
  const show = (section: string) => !mobileSection || (Array.isArray(mobileSection) ? mobileSection.includes(section) : mobileSection === section);
  const accordionOpen = useDesktopAccordionsExpanded() || mobileSection !== undefined;

  return (
    <section className="analysis-tab-surface grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      {show("findings") ? (
      <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Findings</span>
            <p className="mobile-accordion-hint">Plain-language summary and key findings from the dataset scan</p>
            <div className="phone-only analysis-accordion-summary-preview">
              <p className="analysis-accordion-summary-text">{truncatePreview(insights.summary)}</p>
              {insights.findings.slice(0, 2).map((finding) => (
                <p key={finding} className="analysis-accordion-summary-text">{truncatePreview(finding, 92)}</p>
              ))}
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
          <p className="mt-3 text-base leading-7 text-white/82">{insights.summary}</p>
          <div className="mt-5 space-y-3">
            {insights.findings.map((finding) => (
              <div key={finding} className="border-b border-white/6 pb-3 text-sm leading-6 text-white/74">
                {finding}
              </div>
            ))}
          </div>
        </div>
      </details>
      ) : null}

      {show("what-to-do-next") ? (
      <details className="mobile-accordion" open={accordionOpen ? true : undefined}>
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">What to do next</span>
            <p className="mobile-accordion-hint">Recommended cleanup steps and modeling readiness assessment</p>
            <div className="phone-only analysis-accordion-summary-preview">
              {insights.recommended_next_steps.slice(0, 3).map((item) => (
                <p key={item} className="analysis-accordion-summary-text">{truncatePreview(item, 92)}</p>
              ))}
              <div className="analysis-accordion-summary-chip-list">
                <span className="analysis-accordion-summary-chip">
                  {insights.modeling_readiness.is_ready ? "Ready for ML" : "EDA-first"}
                </span>
                {insights.modeling_readiness.target_candidates[0] ? (
                  <span className="analysis-accordion-summary-chip">
                    Target: {insights.modeling_readiness.target_candidates[0]}
                  </span>
                ) : null}
              </div>
            </div>
          </div>
        </summary>
        <div className="mobile-accordion-body">
          <div className="mt-4 space-y-3">
            {insights.recommended_next_steps.map((item) => (
              <div key={item} className="border-b border-white/6 pb-3 text-sm leading-6 text-white/74">
                {item}
              </div>
            ))}
          </div>
          <div className="mt-5 border-b border-white/6 pb-3">
            <p className="text-xs uppercase tracking-[0.2em] text-white/45">Modeling readiness</p>
            <p className="mt-2 text-lg font-semibold text-white">
              {insights.modeling_readiness.is_ready ? "Ready for optional ML" : "EDA-first recommended"}
            </p>
            <p className="mt-2 text-sm text-white/58">
              Target candidates: {insights.modeling_readiness.target_candidates.join(", ") || "none inferred"}
            </p>
          </div>
        </div>
      </details>
      ) : null}
    </section>
  );
}