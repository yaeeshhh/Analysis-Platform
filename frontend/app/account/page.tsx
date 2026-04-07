"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import AccountDialogs, { type AccountDialogKey } from "@/components/account/AccountDialogs";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import { getAnalyses } from "@/lib/analysisApi";
import {
  getRememberStatus,
  REMEMBER_LOGIN_STORAGE_KEY,
  type RememberStatus,
  type User,
} from "@/lib/auth";
import { clearCurrentAnalysisSelection, notifyAnalysesChanged } from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { resolveAuthenticatedUser } from "@/lib/session";

const emptyRememberStatus: RememberStatus = {
  enabled: false,
  daysRemaining: 0,
  available: false,
};

const toolGroups: Array<{
  title: string;
  accent: string;
  description: string;
  items: Array<{
    key: AccountDialogKey;
    title: string;
    detail: string;
    destructive?: boolean;
  }>;
}> = [
  {
    title: "Profile changes",
    accent: "#7ad6ff",
    description: "Manage identity updates in focused dialogs built for one task at a time.",
    items: [
      {
        key: "email",
        title: "Change email",
        detail: "Update the login email with a verification code and no coupling to other account actions.",
      },
      {
        key: "username",
        title: "Change username",
        detail: "Change the name shown across the workspace without opening a shared settings flow.",
      },
      {
        key: "password",
        title: "Update password",
        detail: "Reset or update your password with its own verification flow.",
      },
    ],
  },
  {
    title: "Access and browser",
    accent: "#8bf1a8",
    description: "Control how this browser remembers the account and keep destructive access actions separate.",
    items: [
      {
        key: "remember",
        title: "Remembered login",
        detail: "Enable, disable, or reset the browser-specific remembered-login window.",
      },
      {
        key: "danger",
        title: "Delete account",
        detail: "Start a separate, email-verified deletion flow that is isolated from every other tool.",
        destructive: true,
      },
    ],
  },
  {
    title: "Saved work",
    accent: "#ffb079",
    description: "Clean up uploaded analysis runs with a distinct confirmation dialog that does not interfere with access settings.",
    items: [
      {
        key: "clear-uploads",
        title: "Delete saved runs",
        detail: "Clear uploaded datasets, saved reports, and stored ML experiment files for this account.",
        destructive: true,
      },
    ],
  },
];

function getAccountInitials(value: string) {
  const parts = value
    .split(/[\s@._-]+/)
    .filter(Boolean)
    .slice(0, 2);

  if (parts.length === 0) return "AS";
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "AS";
}

export default function AccountPage() {
  const [activeDialog, setActiveDialog] = useState<AccountDialogKey | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [rememberStatus, setRememberStatus] = useState<RememberStatus>(emptyRememberStatus);
  const [archiveStats, setArchiveStats] = useState({
    savedRuns: 0,
    mlExperiments: 0,
    mlReadyRuns: 0,
  });



  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);

      const authenticatedUser = await resolveAuthenticatedUser();
      if (!active) return;

      if (!authenticatedUser) {
        setUser(null);
        setRememberStatus(emptyRememberStatus);
        setArchiveStats({ savedRuns: 0, mlExperiments: 0, mlReadyRuns: 0 });
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      setUser(authenticatedUser);
      setRememberStatus(getRememberStatus(authenticatedUser.email));

      try {
        const analyses = await getAnalyses();
        if (!active) return;
        setArchiveStats({
          savedRuns: analyses.length,
          mlExperiments: analyses.reduce((sum, item) => sum + item.experiment_count, 0),
          mlReadyRuns: analyses.filter((item) => item.insights.modeling_readiness.is_ready).length,
        });
      } catch {
        if (!active) return;
        setArchiveStats({ savedRuns: 0, mlExperiments: 0, mlReadyRuns: 0 });
      }

      setLoginRequired(false);
      setLoading(false);
    };

    void bootstrap();

    const handleAuthChange = () => {
      if (!active) return;
      void bootstrap();
    };

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
    };
  }, []);

  useEffect(() => {
    if (!user?.email) return;

    const handleStorage = (event: StorageEvent) => {
      if (event.key !== REMEMBER_LOGIN_STORAGE_KEY) return;
      setRememberStatus(getRememberStatus(user.email));
    };

    window.addEventListener("storage", handleStorage);
    return () => {
      window.removeEventListener("storage", handleStorage);
    };
  }, [user?.email]);

  const usageScale = Math.max(archiveStats.savedRuns, archiveStats.mlExperiments, archiveStats.mlReadyRuns, 1);
  const usageItems = [
    {
      label: "Saved runs",
      value: archiveStats.savedRuns,
      caption: `${archiveStats.savedRuns} current archive item${archiveStats.savedRuns === 1 ? "" : "s"}`,
      hint: `${archiveStats.mlReadyRuns} run${archiveStats.mlReadyRuns === 1 ? "" : "s"} currently look ML-ready.`,
      tone: "#2563eb",
      width: (archiveStats.savedRuns / usageScale) * 100,
    },
    {
      label: "ML-ready runs",
      value: archiveStats.mlReadyRuns,
      caption: `${archiveStats.mlReadyRuns} of ${archiveStats.savedRuns} saved run${archiveStats.savedRuns === 1 ? "" : "s"}`,
      hint: "Use these when you want to reopen stronger candidates for optional ML.",
      tone: "#f59e0b",
      width: (archiveStats.mlReadyRuns / usageScale) * 100,
    },
    {
      label: "Saved ML experiments",
      value: archiveStats.mlExperiments,
      caption: `${archiveStats.mlExperiments} stored experiment output${archiveStats.mlExperiments === 1 ? "" : "s"}`,
      hint: "Reopen or download them from Analysis and History whenever needed.",
      tone: "#ef4444",
      width: (archiveStats.mlExperiments / usageScale) * 100,
    },
  ];

  return (
    <>
      <AppShell
        eyebrow="Settings"
        title="Account"
        description="Manage access, identity, and saved work."
        actions={
          user ? (
            <div className="flex flex-wrap gap-3">
              <ScrollIntentLink href="/history" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
                Review saved history
              </ScrollIntentLink>
              <ScrollIntentLink href="/batch" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
                Open uploads page
              </ScrollIntentLink>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <div className="py-10 text-center text-sm text-white/55">
            Loading account tools...
          </div>
        ) : null}

        {!loading && user ? (
          <>
            {/* ─── Phone: inline info + tappable section list ─── */}
            <div className="phone-only space-y-3">
              {/* Inline account summary */}
              <div className="mobile-inline-stats">
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">{user.username || "—"}</span>
                  <span className="mobile-inline-stat-label">Username</span>
                </div>
                <div className="mobile-inline-stat">
                  <span className="mobile-inline-stat-value">
                    {rememberStatus.available
                      ? rememberStatus.enabled
                        ? `${rememberStatus.daysRemaining}d`
                        : "Off"
                      : "N/A"}
                  </span>
                  <span className="mobile-inline-stat-label">Remember</span>
                </div>
              </div>

              <div className="mobile-detail-row">
                <span className="mobile-detail-label">Email</span>
                <span className="mobile-detail-value">{user.email}</span>
              </div>
              <div className="mobile-detail-row">
                <span className="mobile-detail-label">Member since</span>
                <span className="mobile-detail-value">{formatDate(user.created_at)}</span>
              </div>
              <div className="mobile-detail-row">
                <span className="mobile-detail-label">Status</span>
                <span className="mobile-detail-value">
                  <span className="info-chip"><span className="pulse-dot" />{user.is_active ? "Active" : "Inactive"}</span>
                </span>
              </div>

              <AccountMobileSections user={user} rememberStatus={rememberStatus} setActiveDialog={setActiveDialog} />
            </div>

            {/* ─── Desktop: flowing sections ─── */}
            <div id="account-first-block" className="tablet-up route-scroll-target desktop-page-stack">
              <section className="desktop-panel">
                <div className="desktop-panel-header">
                  <p className="desktop-panel-title">Profile</p>
                  <button
                    type="button"
                    onClick={() => setActiveDialog("username")}
                    className="desktop-panel-action"
                  >
                    Edit profile
                  </button>
                </div>

                <div className="grid gap-6 xl:grid-cols-[auto,1fr]">
                  <div className="flex items-center gap-4">
                    <div className="flex h-14 w-14 items-center justify-center rounded-full bg-[linear-gradient(135deg,#3b82f6,#7c3aed)] font-[family:var(--font-display)] text-2xl font-bold text-white">
                      {getAccountInitials(user.username || user.email)}
                    </div>
                    <div className="min-w-0">
                      <p className="truncate font-[family:var(--font-display)] text-2xl font-bold text-white">
                        {user.username || user.email}
                      </p>
                      <p className="mt-1 font-[family:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.14em] text-white/28">
                        {user.email}
                      </p>
                    </div>
                  </div>

                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      { label: "Username", value: user.username || "Not set" },
                      { label: "Email", value: user.email },
                      { label: "Member since", value: formatDate(user.created_at) },
                      {
                        label: "Remembered login",
                        value: rememberStatus.available
                          ? rememberStatus.enabled
                            ? `${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"}`
                            : "Disabled"
                          : "Not set",
                      },
                    ].map((field) => (
                      <div key={field.label} className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-3">
                        <p className="text-[0.62rem] uppercase tracking-[0.16em] text-white/28">{field.label}</p>
                        <p className="mt-2 text-sm font-medium text-white/78 break-all">{field.value}</p>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={() => setActiveDialog("username")}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                  >
                    Change username
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDialog("email")}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDialog("password")}
                    className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                  >
                    Update password
                  </button>
                </div>
              </section>

              <section className="desktop-panel">
                <div className="desktop-panel-header">
                  <p className="desktop-panel-title">Usage snapshot</p>
                  <span className="desktop-panel-action">Current workspace state</span>
                </div>

                <div className="space-y-5">
                  {usageItems.map((item) => (
                    <div key={item.label}>
                      <div className="flex items-baseline justify-between gap-4">
                        <span className="text-sm text-white/76">{item.label}</span>
                        <span className="font-[family:var(--font-mono)] text-[0.72rem] uppercase tracking-[0.14em] text-white/28">
                          {item.caption}
                        </span>
                      </div>
                      <div className="mt-2 h-1.5 rounded-full bg-white/6">
                        <div
                          className="h-1.5 rounded-full"
                          style={{ width: `${Math.max(item.width, item.value > 0 ? 18 : 0)}%`, background: item.tone }}
                        />
                      </div>
                      <p className="mt-2 text-[0.72rem] leading-5 text-white/32">{item.hint}</p>
                    </div>
                  ))}
                </div>
              </section>

              <section className="desktop-panel">
                <div className="desktop-panel-header">
                  <p className="desktop-panel-title">Login & session</p>
                  <span className="desktop-panel-action">Browser and access controls</span>
                </div>

                <div className="divide-y divide-white/6">
                  {[
                    {
                      key: "remember",
                      title: "Remember login",
                      detail: rememberStatus.available
                        ? rememberStatus.enabled
                          ? `Enabled for ${rememberStatus.daysRemaining} more day${rememberStatus.daysRemaining === 1 ? "" : "s"} on this browser.`
                          : "Disabled on this browser."
                        : "No remembered-login state is set on this browser yet.",
                      action: "Manage",
                    },
                    {
                      key: "email",
                      title: "Email access",
                      detail: "Change the login email through its verification flow without touching the rest of the account settings.",
                      action: "Open",
                    },
                    {
                      key: "password",
                      title: "Password security",
                      detail: "Update the password independently so access recovery and identity changes stay isolated.",
                      action: "Open",
                    },
                    {
                      key: "notifications",
                      title: "Email notifications",
                      detail: "Completion alerts and background reminders are planned for a later release.",
                      badge: "Coming soon",
                    },
                    {
                      key: "2fa",
                      title: "Two-factor authentication",
                      detail: "A second verification step is not available yet, but the desktop layout now reserves space for it.",
                      badge: "Planned",
                    },
                  ].map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/82">{row.title}</p>
                        <p className="mt-1 text-sm leading-6 text-white/40">{row.detail}</p>
                      </div>
                      {"action" in row ? (
                        <button
                          type="button"
                          onClick={() => setActiveDialog(row.key as AccountDialogKey)}
                          className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                        >
                          {row.action}
                        </button>
                      ) : (
                        <span className="desktop-badge" data-tone="purple">{row.badge}</span>
                      )}
                    </div>
                  ))}
                </div>
              </section>

              <section className="desktop-panel" style={{ borderColor: "rgba(90, 35, 40, 0.58)" }}>
                <div className="desktop-panel-header">
                  <p className="desktop-panel-title text-[#ffc7cc]">Danger zone</p>
                  <span className="desktop-panel-action" style={{ color: "#f59ea7" }}>High-impact actions</span>
                </div>

                <div className="divide-y divide-white/6">
                  <div className="flex items-center justify-between gap-6 py-4 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/82">Delete saved runs</p>
                      <p className="mt-1 text-sm leading-6 text-white/40">
                        Remove uploaded datasets, saved reports, and stored ML experiment files for this account.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDialog("clear-uploads")}
                      className="rounded-lg border border-[#5a2328]/60 px-4 py-2.5 text-sm font-medium text-[#ffb4ba]"
                    >
                      Delete runs
                    </button>
                  </div>

                  <div className="flex items-center justify-between gap-6 py-4 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/82">Delete account</p>
                      <p className="mt-1 text-sm leading-6 text-white/40">
                        Start the separate email-verified account deletion flow. This cannot be reversed once confirmed.
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setActiveDialog("danger")}
                      className="rounded-lg border border-[#5a2328]/60 px-4 py-2.5 text-sm font-medium text-[#ffb4ba]"
                    >
                      Delete account
                    </button>
                  </div>
                </div>
              </section>
            </div>
          </>
        ) : null}

        {!loading && !user ? (
          <div className="py-10 text-center text-sm text-white/45">
            Sign in to manage profile details, remembered login, and saved analysis data.
          </div>
        ) : null}
      </AppShell>

      <AccountDialogs
        activeDialog={activeDialog}
        onClose={() => setActiveDialog(null)}
        user={user}
        rememberStatus={rememberStatus}
        onUserUpdated={(nextUser) => {
          setUser(nextUser);
          setRememberStatus(getRememberStatus(nextUser.email));
        }}
        onRememberStatusUpdated={(nextStatus) => {
          setRememberStatus(nextStatus);
        }}
        onAnalysisUploadsCleared={() => {
          clearCurrentAnalysisSelection();
          setArchiveStats({ savedRuns: 0, mlExperiments: 0, mlReadyRuns: 0 });
          notifyAnalysesChanged();
        }}
      />

      <LoginRequiredModal
        open={loginRequired}
        title="Login required"
        message="Log in to manage account settings, device memory, and saved workspace data."
        loginHref="/login?redirect=/account"
        onDismiss={() => setLoginRequired(false)}
        onLoginSuccess={() => setLoginRequired(false)}
      />
    </>
  );
}

/* ── Phone-only account sections ── */
function AccountMobileSections({
  user,
  rememberStatus,
  setActiveDialog,
}: {
  user: User;
  rememberStatus: RememberStatus;
  setActiveDialog: (key: AccountDialogKey) => void;
}) {
  const sections: MobileSection[] = [
    {
      id: "snapshot",
      title: "Account snapshot",
      hint: user.email,
      accent: "#7ad6ff",
      content: (
        <div className="space-y-0">
          {[
            { label: "Username", value: user.username || "Not set" },
            { label: "Email", value: user.email },
            { label: "Member since", value: formatDate(user.created_at) },
            {
              label: "Remembered login",
              value: rememberStatus.available
                ? rememberStatus.enabled
                  ? `Enabled for ${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"}`
                  : "Available but disabled"
                : "Not configured",
            },
          ].map((stat) => (
            <div key={stat.label} className="border-b border-white/6 py-3 last:border-0">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/42">{stat.label}</p>
              <p className="mt-1 text-base font-medium text-white">{stat.value}</p>
            </div>
          ))}
        </div>
      ),
    },
    ...toolGroups.map((group) => ({
      id: group.title,
      title: group.title,
      hint: group.description,
      accent: group.accent,
      content: (
        <div className="space-y-3">
          {group.items.map((item) => (
            <button
              key={item.key}
              type="button"
              onClick={() => setActiveDialog(item.key)}
              className={`w-full border-b border-white/6 py-3 text-left last:border-0 ${item.destructive ? "" : ""}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${item.destructive ? "text-[#ffb4ba]" : "text-white"}`}>{item.title}</p>
                  <p className="mt-1 text-sm leading-6 text-white/50">{item.detail}</p>
                </div>
                <span className={`shrink-0 text-xs ${item.destructive ? "text-[#ffb4ba]/60" : "text-white/30"}`}>
                  {item.destructive ? <span className="danger-label"><span className="text-[#ff8c8c]/70">Danger</span></span> : "›"}
                </span>
              </div>
            </button>
          ))}
        </div>
      ),
    })),
  ];

  return <MobileSectionList sections={sections} />;
}