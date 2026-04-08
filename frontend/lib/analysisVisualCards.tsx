import type { ReactElement } from "react";
import type { AnalysisTabKey } from "@/lib/analysisNavigation";

export type AnalysisVisualCard = {
  key: string;
  label: string;
  description: string;
  defaultTab: AnalysisTabKey;
  accent: string;
  tabKeys: AnalysisTabKey[];
  cover: ReactElement;
};

export const analysisVisualCards: AnalysisVisualCard[] = [
  {
    key: "overview",
    label: "Overview",
    description: "Findings, dataset profile, next steps, and raw data preview.",
    defaultTab: "overview",
    accent: "#4f6ef7",
    tabKeys: ["overview", "insights"],
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
    description: "Missing values, recommendations, numeric and categorical summaries.",
    defaultTab: "quality",
    accent: "#22c55e",
    tabKeys: ["quality", "statistics"],
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#0d3b2e"/>
        <circle cx="270" cy="20" r="70" fill="#145a42" opacity="0.5"/>
        <circle cx="30" cy="120" r="45" fill="#145a42" opacity="0.3"/>
        <line x1="240" y1="90" x2="240" y2="20" stroke="#22c55e" strokeWidth="0.8" opacity="0.12"/>
        <line x1="240" y1="90" x2="280" y2="50" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
        <line x1="240" y1="90" x2="290" y2="90" stroke="#22c55e" strokeWidth="0.8" opacity="0.08"/>
        <line x1="240" y1="90" x2="280" y2="130" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
        <line x1="240" y1="90" x2="200" y2="50" stroke="#22c55e" strokeWidth="0.8" opacity="0.1"/>
        <line x1="240" y1="90" x2="200" y2="130" stroke="#22c55e" strokeWidth="0.8" opacity="0.08"/>
        <circle cx="240" cy="90" r="4" fill="#22c55e" opacity="0.18"/>
        <circle cx="240" cy="90" r="18" fill="none" stroke="#22c55e" strokeWidth="0.6" opacity="0.1"/>
        <circle cx="240" cy="90" r="35" fill="none" stroke="#22c55e" strokeWidth="0.5" opacity="0.06"/>
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
    description: "Column inventory, correlations, skew, dominance, and modeling signals.",
    defaultTab: "schema",
    accent: "#a78bfa",
    tabKeys: ["schema"],
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#1e1535"/>
        <circle cx="260" cy="20" r="65" fill="#2d1f52" opacity="0.5"/>
        <circle cx="220" cy="42" r="1.5" fill="#a78bfa" opacity="0.18"/>
        <circle cx="236" cy="42" r="1.5" fill="#a78bfa" opacity="0.14"/>
        <circle cx="252" cy="42" r="2" fill="#a78bfa" opacity="0.25"/>
        <circle cx="268" cy="42" r="1.5" fill="#a78bfa" opacity="0.12"/>
        <circle cx="220" cy="58" r="2" fill="#a78bfa" opacity="0.22"/>
        <circle cx="236" cy="58" r="1.5" fill="#a78bfa" opacity="0.16"/>
        <circle cx="252" cy="58" r="1.5" fill="#a78bfa" opacity="0.2"/>
        <circle cx="268" cy="58" r="2" fill="#a78bfa" opacity="0.28"/>
        <circle cx="220" cy="74" r="1.5" fill="#a78bfa" opacity="0.14"/>
        <circle cx="236" cy="74" r="2" fill="#a78bfa" opacity="0.2"/>
        <circle cx="252" cy="74" r="1.5" fill="#a78bfa" opacity="0.16"/>
        <circle cx="268" cy="74" r="1.5" fill="#a78bfa" opacity="0.1"/>
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
    description: "Missingness, distributions, categories, correlations, and drift.",
    defaultTab: "visualisations",
    accent: "#f59e0b",
    tabKeys: ["relationships", "visualisations"],
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#2d1a00"/>
        <circle cx="262" cy="18" r="68" fill="#4a2c00" opacity="0.5"/>
        <circle cx="248" cy="34" r="2.5" fill="#f59e0b" opacity="0.18"/>
        <circle cx="260" cy="42" r="3.5" fill="#f59e0b" opacity="0.22"/>
        <circle cx="272" cy="28" r="2" fill="#f59e0b" opacity="0.15"/>
        <circle cx="256" cy="54" r="2" fill="#f59e0b" opacity="0.12"/>
        <circle cx="280" cy="38" r="2.5" fill="#f59e0b" opacity="0.16"/>
        <line x1="242" y1="60" x2="288" y2="24" stroke="#fcd34d" strokeWidth="0.8" opacity="0.15" strokeDasharray="3,3"/>
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
    description: "Run or reopen supervised and unsupervised experiments.",
    defaultTab: "ml",
    accent: "#f43f5e",
    tabKeys: ["ml"],
    cover: (
      <svg viewBox="0 0 300 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" className="mobile-analysis-card-svg">
        <rect width="300" height="140" fill="#2d0a1a"/>
        <circle cx="258" cy="18" r="70" fill="#4a0f28" opacity="0.5"/>
        <circle cx="20" cy="118" r="45" fill="#4a0f28" opacity="0.3"/>
        <circle cx="248" cy="105" r="22" fill="none" stroke="#f43f5e" strokeWidth="3" strokeDasharray="70 69" strokeDashoffset="18" strokeLinecap="round" opacity="0.25"/>
        <circle cx="248" cy="105" r="14" fill="none" stroke="#f43f5e" strokeWidth="2" strokeDasharray="44 44" strokeDashoffset="12" strokeLinecap="round" opacity="0.15"/>
        <circle cx="248" cy="105" r="5" fill="#f43f5e" opacity="0.12"/>
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