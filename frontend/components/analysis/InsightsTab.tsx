import { AnalysisInsights } from "@/lib/analysisTypes";

type InsightsTabProps = {
  insights: AnalysisInsights;
};

export default function InsightsTab({ insights }: InsightsTabProps) {
  return (
    <section className="grid gap-4 lg:grid-cols-[1.1fr_0.9fr]">
      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Findings</span>
            <p className="mobile-accordion-hint">Plain-language summary and key findings from the dataset scan</p>
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

      <details className="mobile-accordion">
        <summary>
          <div className="min-w-0">
            <span className="text-xs uppercase tracking-[0.24em] text-[#ffb079]">What to do next</span>
            <p className="mobile-accordion-hint">Recommended cleanup steps and modeling readiness assessment</p>
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
    </section>
  );
}