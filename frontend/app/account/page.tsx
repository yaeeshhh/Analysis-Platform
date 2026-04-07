"use client";

import { useEffect, useState } from "react";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import AccountDialogs, { type AccountDialogKey } from "@/components/account/AccountDialogs";
import MobileSectionList, { type MobileSection } from "@/components/ui/MobileSectionList";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import {
  getRememberStatus,
  REMEMBER_LOGIN_STORAGE_KEY,
  refreshAccessToken,
  updateCurrentUser,
  type RememberStatus,
  type User,
} from "@/lib/auth";
import { getAccessToken, setAccessToken } from "@/lib/api";
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
    accent: "#9db8ff",
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
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);



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
        setLoginRequired(true);
        setLoading(false);
        return;
      }

      setUser(authenticatedUser);
      setNameInput(authenticatedUser.full_name || "");
      setDobInput(authenticatedUser.date_of_birth || "");
      setRememberStatus(getRememberStatus(authenticatedUser.email));

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

  async function withAuthRetry<T>(request: (token: string) => Promise<T>) {
    let token = getAccessToken();

    if (!token) {
      const refreshed = await refreshAccessToken();
      setAccessToken(refreshed.access_token);
      token = refreshed.access_token;
    }

    try {
      return await request(token);
    } catch (error) {
      if (!(error instanceof Error)) {
        throw error;
      }

      const message = error.message.trim().toLowerCase();
      const tokenRelated =
        message === "invalid token" ||
        message.includes("token") ||
        message.includes("credentials") ||
        message.includes("authenticated");

      if (!tokenRelated) {
        throw error;
      }

      const refreshed = await refreshAccessToken();
      setAccessToken(refreshed.access_token);
      return request(refreshed.access_token);
    }
  }

  async function handleTwoFactorToggle() {
    if (!user || savingTwoFactor) return;

    try {
      setSavingTwoFactor(true);
      const updated = await withAuthRetry((token) =>
        updateCurrentUser(token, {
          two_factor_enabled: !user.two_factor_enabled,
        })
      );
      setUser(updated);
    } finally {
      setSavingTwoFactor(false);
    }
  }

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

              <div className="rounded-xl border border-white/8 bg-white/[0.02] px-4 py-4">
                <p className="text-[0.62rem] uppercase tracking-[0.16em] text-white/28">Two-factor authentication</p>
                <p className="mt-2 text-sm leading-6 text-white/62">
                  {user.two_factor_enabled
                    ? "Password logins require an email code. Remembered-login bypass still works when available on this browser."
                    : "Password logins skip the email code. Remembered-login behavior stays unchanged."}
                </p>
                <button
                  type="button"
                  onClick={() => {
                    void handleTwoFactorToggle();
                  }}
                  disabled={savingTwoFactor}
                  className="mt-3 w-full rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/82 disabled:opacity-50"
                >
                  {savingTwoFactor
                    ? "Saving..."
                    : user.two_factor_enabled
                      ? "Disable two-factor authentication"
                      : "Enable two-factor authentication"}
                </button>
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
                      { label: "Full name", value: user.full_name || "Not set" },
                      { label: "Username", value: user.username || "Not set" },
                      { label: "Email", value: user.email },
                      { label: "Date of birth", value: user.date_of_birth || "Not set" },
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
                  {!editingName ? (
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(user.full_name || "");
                        setDobInput(user.date_of_birth || "");
                        setEditingName(true);
                      }}
                      className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                    >
                      Edit name & date of birth
                    </button>
                  ) : (
                    <div className="flex w-full flex-col gap-3 rounded-xl border border-white/8 bg-white/[0.02] p-4">
                      <div>
                        <label htmlFor="account-full-name" className="mb-1.5 block text-[0.62rem] uppercase tracking-[0.16em] text-white/28">Full name</label>
                        <input
                          id="account-full-name"
                          type="text"
                          value={nameInput}
                          onChange={(e) => setNameInput(e.target.value)}
                          placeholder="Your full name"
                          disabled={savingProfile}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white placeholder:text-white/25 focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      <div>
                        <label htmlFor="account-dob" className="mb-1.5 block text-[0.62rem] uppercase tracking-[0.16em] text-white/28">Date of birth <span className="text-white/20">(optional)</span></label>
                        <input
                          id="account-dob"
                          type="date"
                          value={dobInput}
                          onChange={(e) => setDobInput(e.target.value)}
                          disabled={savingProfile}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={savingProfile}
                          onClick={async () => {
                            try {
                              setSavingProfile(true);
                              const updated = await withAuthRetry((token) =>
                                updateCurrentUser(token, {
                                  full_name: nameInput.trim() || undefined,
                                  date_of_birth: dobInput || null,
                                })
                              );
                              setUser(updated);
                              setNameInput(updated.full_name || "");
                              setDobInput(updated.date_of_birth || "");
                              setEditingName(false);
                            } catch {
                              // keep editing open on error
                            } finally {
                              setSavingProfile(false);
                            }
                          }}
                          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingProfile ? "Saving..." : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => setEditingName(false)}
                          disabled={savingProfile}
                          className="rounded-lg border border-white/10 px-4 py-2 text-sm text-white/78 disabled:opacity-50"
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}
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
                  ].map((row) => (
                    <div key={row.key} className="flex items-center justify-between gap-6 py-4 first:pt-0 last:pb-0">
                      <div className="min-w-0">
                        <p className="text-sm font-medium text-white/82">{row.title}</p>
                        <p className="mt-1 text-sm leading-6 text-white/40">{row.detail}</p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setActiveDialog(row.key as AccountDialogKey)}
                        className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78"
                      >
                        {row.action}
                      </button>
                    </div>
                  ))}

                  <div className="flex items-center justify-between gap-6 py-4 last:pb-0">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-white/82">Two-factor authentication</p>
                      <p className="mt-1 text-sm leading-6 text-white/40">
                        {user.two_factor_enabled
                          ? "Password logins require an email verification code. Remembered-login bypass still works when this browser already has a remembered session."
                          : "Password logins go straight through without an email verification code. Remembered-login behavior stays unchanged."}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        void handleTwoFactorToggle();
                      }}
                      disabled={savingTwoFactor}
                      className="rounded-lg border border-white/10 px-4 py-2.5 text-sm text-white/78 disabled:opacity-50"
                    >
                      {savingTwoFactor
                        ? "Saving..."
                        : user.two_factor_enabled
                          ? "Disable"
                          : "Enable"}
                    </button>
                  </div>
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