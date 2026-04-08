export type AnalysisTabKey =
  | "overview"
  | "schema"
  | "quality"
  | "statistics"
  | "relationships"
  | "visualisations"
  | "insights"
  | "ml";

export type AnalysisFocusAreaKey = "summary" | "health" | "fields" | "patterns" | "ml";

export const analysisTabs: Array<{
  key: AnalysisTabKey;
  label: string;
  focusArea: AnalysisFocusAreaKey;
}> = [
  { key: "overview", label: "Summary", focusArea: "summary" },
  { key: "insights", label: "Findings", focusArea: "summary" },
  { key: "schema", label: "Fields", focusArea: "fields" },
  { key: "quality", label: "Quality", focusArea: "health" },
  { key: "statistics", label: "Statistics", focusArea: "health" },
  { key: "relationships", label: "Patterns", focusArea: "patterns" },
  { key: "visualisations", label: "Charts", focusArea: "patterns" },
  { key: "ml", label: "ML Lab", focusArea: "ml" },
];

export const analysisFocusAreas: Array<{
  key: AnalysisFocusAreaKey;
  label: string;
  description: string;
  tabKeys: AnalysisTabKey[];
}> = [
  {
    key: "summary",
    label: "Summary",
    description: "Start with the plain-language summary and findings before moving deeper.",
    tabKeys: ["overview", "insights"],
  },
  {
    key: "health",
    label: "Health",
    description: "Check quality issues and the main numeric or categorical measures.",
    tabKeys: ["quality", "statistics"],
  },
  {
    key: "fields",
    label: "Fields",
    description: "Inspect field roles, inferred types, identifiers, and target candidates.",
    tabKeys: ["schema"],
  },
  {
    key: "patterns",
    label: "Patterns",
    description: "Use relationships and charts to understand structure, spread, and drift.",
    tabKeys: ["relationships", "visualisations"],
  },
  {
    key: "ml",
    label: "ML",
    description: "Run or reopen supervised and unsupervised experiment lanes.",
    tabKeys: ["ml"],
  },
];

export const analysisTabDescriptions: Record<AnalysisTabKey, string> = {
  overview: "Start here for the dataset summary, posture, and first explanation of what the run is saying.",
  insights: "Plain-language findings, modeling readiness, and the next actions worth taking after the upload.",
  schema: "Field roles, inferred types, identifiers, targets, and the full column inventory.",
  quality: "Missingness, duplicates, constants, correlations, outliers, and cleanup direction.",
  statistics: "Numeric, categorical, and datetime measures for the saved run.",
  relationships: "Stronger pairwise signals, skew, and modeling cues across the dataset.",
  visualisations: "Charts for missingness, distributions, category spread, heatmaps, scatter, and drift.",
  ml: "Saved supervised and unsupervised experiment lanes with downloads and deletion.",
};

export function resolveRequestedTab(requestedTab: string | null): AnalysisTabKey | null {
  switch (requestedTab) {
    case "overview":
    case "insights":
    case "schema":
    case "quality":
    case "statistics":
    case "relationships":
    case "visualisations":
    case "ml":
      return requestedTab;
    case "guide":
      return "overview";
    case "field-guide":
      return "schema";
    case "playbook":
      return "insights";
    default:
      return null;
  }
}

export function getAnalysisTabDefinition(tabKey: AnalysisTabKey) {
  return analysisTabs.find((tab) => tab.key === tabKey) ?? analysisTabs[0];
}

export function getAnalysisFocusArea(tabKey: AnalysisTabKey) {
  return analysisFocusAreas.find((area) => area.tabKeys.includes(tabKey)) ?? analysisFocusAreas[0];
}

export function getAnalysisTabOptionLabel(tabKey: AnalysisTabKey) {
  const tab = getAnalysisTabDefinition(tabKey);
  const focusArea = getAnalysisFocusArea(tabKey);

  if (focusArea.tabKeys.length === 1) {
    return tab.label;
  }

  if (focusArea.label === tab.label) {
    return tab.label;
  }

  return `${focusArea.label} · ${tab.label}`;
}