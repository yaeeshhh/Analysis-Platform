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
    description: "Summary and key findings from the scan.",
    tabKeys: ["overview", "insights"],
  },
  {
    key: "health",
    label: "Health",
    description: "Missing values, duplicates, and key statistics.",
    tabKeys: ["quality", "statistics"],
  },
  {
    key: "fields",
    label: "Fields",
    description: "Column types, roles, and likely prediction targets.",
    tabKeys: ["schema"],
  },
  {
    key: "patterns",
    label: "Patterns",
    description: "Correlations, distributions, and change patterns.",
    tabKeys: ["relationships", "visualisations"],
  },
  {
    key: "ml",
    label: "ML",
    description: "Run or revisit ML experiments.",
    tabKeys: ["ml"],
  },
];

export const analysisTabDescriptions: Record<AnalysisTabKey, string> = {
  overview: "Dataset summary, shape, and initial findings.",
  insights: "Key findings, ML readiness, and suggested next steps.",
  schema: "Column types, roles, IDs, targets, and the full field list.",
  quality: "Missingness, duplicates, constants, correlations, outliers, and cleanup direction.",
  statistics: "Numeric and categorical breakdowns.",
  relationships: "Correlations, skewed fields, and patterns worth noting.",
  visualisations: "Charts for missingness, distributions, category spread, heatmaps, scatter, and drift.",
  ml: "Your saved ML experiments with download and management options.",
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