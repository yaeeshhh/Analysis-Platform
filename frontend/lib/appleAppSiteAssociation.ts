const APPLE_TEAM_ID = (process.env.APPLE_DEVELOPER_TEAM_ID || "TEAMID").trim();
const IOS_BUNDLE_IDENTIFIER = "com.analysisstudio.apple";

const supportedPaths = [
  "/dashboard",
  "/dashboard/*",
  "/batch",
  "/batch/*",
  "/analysis",
  "/analysis/*",
  "/history",
  "/history/*",
  "/account",
  "/account/*",
];

export function getAppleAppSiteAssociation() {
  return {
    applinks: {
      apps: [],
      details: [
        {
          appID: `${APPLE_TEAM_ID}.${IOS_BUNDLE_IDENTIFIER}`,
          paths: supportedPaths,
        },
      ],
    },
  };
}