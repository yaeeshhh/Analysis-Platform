"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import AppShell from "@/components/ui/AppShell";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import AccountDialogs, { type AccountDialogKey } from "@/components/account/AccountDialogs";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";
import SurfaceLoadingIndicator from "@/components/ui/SurfaceLoadingIndicator";
import { LOGOUT_BROADCAST_KEY } from "@/components/ui/GlobalOverlays";
import {
  getRememberStatus,
  REMEMBER_LOGIN_STORAGE_KEY,
  refreshAccessToken,
  logout,
  updateCurrentUser,
  type RememberStatus,
  type User,
} from "@/lib/auth";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/api";
import { clearCurrentAnalysisSelection, notifyAnalysesChanged } from "@/lib/currentAnalysis";
import { clearUserScopedFrontendState, formatDate } from "@/lib/helpers";
import { clearActiveAccountEmail, resolveAuthenticatedUser } from "@/lib/session";

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
    description: "Update profile details and sign-in information.",
    items: [
      {
        key: "email",
        title: "Change email",
        detail: "Update login email with verification.",
      },
      {
        key: "username",
        title: "Change username",
        detail: "Update workspace display name.",
      },
      {
        key: "password",
        title: "Update password",
        detail: "Reset or change your password.",
      },
    ],
  },
  {
    title: "Access and browser",
    accent: "#8bf1a8",
    description: "Manage sign-in security and browser memory.",
    items: [
      {
        key: "remember",
        title: "Remembered login",
        detail: "Manage browser session memory.",
      },
      {
        key: "danger",
        title: "Delete account",
        detail: "Permanently delete your account.",
        destructive: true,
      },
    ],
  },
  {
    title: "Saved work",
    accent: "#9db8ff",
    description: "Delete saved runs and other stored workspace data.",
    items: [
      {
        key: "clear-uploads",
        title: "Delete saved runs",
        detail: "Remove all saved datasets and reports.",
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

function AccountSlideToggle({
  checked,
  disabled,
  label,
  onToggle,
}: {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-pressed={checked}
      aria-label={label}
      className={`inline-flex h-6 w-11 shrink-0 items-center rounded-lg border transition disabled:cursor-not-allowed disabled:opacity-45 ${checked ? "border-emerald-400/70 bg-emerald-500/30" : "border-white/20 bg-white/10"}`}
    >
      <span className={`h-5 w-5 rounded-lg bg-white transition ${checked ? "translate-x-5" : "translate-x-0.5"}`} />
    </button>
  );
}

export default function AccountPage() {
  const router = useRouter();
  const suppressLoginRequiredRef = useRef(false);
  const [activeDialog, setActiveDialog] = useState<AccountDialogKey | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [rememberStatus, setRememberStatus] = useState<RememberStatus>(emptyRememberStatus);
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const [dobInput, setDobInput] = useState("");
  const [profileError, setProfileError] = useState("");
  const [savingProfile, setSavingProfile] = useState(false);
  const [savingTwoFactor, setSavingTwoFactor] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);

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
        if (!suppressLoginRequiredRef.current) {
          setLoginRequired(true);
        }
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

  async function handleLogout() {
    if (loggingOut) return;

    suppressLoginRequiredRef.current = true;
    setLoggingOut(true);
    setLoginRequired(false);

    const token = getAccessToken();

    try {
      if (token) {
        await logout(token);
      }
    } catch {
      // Local logout still proceeds so the account page does not keep a stale session.
    } finally {
      clearAccessToken();
      clearActiveAccountEmail();
      clearUserScopedFrontendState();
      localStorage.setItem(LOGOUT_BROADCAST_KEY, Date.now().toString());
      setUser(null);
      setRememberStatus(emptyRememberStatus);
      window.dispatchEvent(new CustomEvent("auth:logged-out"));
      router.replace("/dashboard");
    }
  }

  const rememberSummary = rememberStatus.available
    ? rememberStatus.enabled
      ? `${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"} remaining`
      : "Available but disabled on this browser"
    : "Not configured on this browser";

  return (
    <>
      <AppShell
        eyebrow="Settings"
        title="Account"
        description="Manage access, identity, and saved work."
        mobileDescription="Manage profile, security, and saved work."
        actions={
          user ? (
            <div className="tablet-up flex flex-wrap gap-3">
              <ScrollIntentLink href="/history" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
                Review saved history
              </ScrollIntentLink>
              <ScrollIntentLink href="/batch" className="rounded-lg border border-white/12 px-5 py-3 text-sm text-white/82">
                Open uploads page
              </ScrollIntentLink>
              <button
                type="button"
                onClick={() => {
                  void handleLogout();
                }}
                disabled={loggingOut}
                className="inline-flex items-center justify-center gap-2 rounded-lg border border-[#5a2328]/60 bg-[#2a1215] px-5 py-3 text-sm font-medium text-[#ffb4ba] transition hover:bg-[#34171b] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {loggingOut ? (
                  <>
                    <span className="button-live-loader" aria-hidden="true" />
                    Logging out...
                  </>
                ) : "Log out"}
              </button>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <div className="py-10">
            <SurfaceLoadingIndicator label="Loading account tools..." className="mx-auto" />
          </div>
        ) : null}

        {!loading && user ? (
          <>
            <div className="phone-only mobile-screen-stack">
              <section className="mobile-screen-panel section-glow" style={{ position: "relative", overflow: "hidden" }}>
                {/* ring-gauge motif from design system */}
                <svg viewBox="0 0 140 140" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" style={{ position: "absolute", right: "-16px", bottom: "-16px", width: "110px", height: "110px", opacity: 0.3, pointerEvents: "none" }}>
                  <circle cx="70" cy="70" r="55" fill="none" stroke="#7ad6ff" strokeWidth="8" strokeDasharray="173 173" strokeDashoffset="55" strokeLinecap="round" opacity="0.7"/>
                  <circle cx="70" cy="70" r="40" fill="none" stroke="#8bf1a8" strokeWidth="5" strokeDasharray="100 151" strokeDashoffset="40" strokeLinecap="round" opacity="0.5"/>
                  <circle cx="70" cy="70" r="26" fill="none" stroke="#9db8ff" strokeWidth="3.5" strokeDasharray="65 98" strokeDashoffset="28" strokeLinecap="round" opacity="0.35"/>
                  <circle cx="70" cy="70" r="8" fill="#7ad6ff" opacity="0.25"/>
                </svg>
                <div className="mobile-screen-profile">
                  <div className="mobile-screen-avatar">{getAccountInitials(user.username || user.email)}</div>
                  <div className="mobile-screen-profile-copy">
                    <p className="mobile-screen-kicker">Profile</p>
                    <h2 className="mobile-screen-title">{user.username || user.email}</h2>
                    <p className="mobile-screen-meta">{user.email}</p>
                  </div>
                </div>
                <div className="mobile-screen-field-grid" style={{ marginTop: "1rem" }}>
                  {[
                    { label: "Full name", value: user.full_name || "Not set" },
                    { label: "Date of birth", value: user.date_of_birth || "Not set" },
                    { label: "Member since", value: formatDate(user.created_at) },
                    { label: "Remembered login", value: rememberSummary },
                  ].map((field) => (
                    <div key={field.label} className="mobile-screen-field-card">
                      <p className="mobile-screen-field-label">{field.label}</p>
                      <p className="mobile-screen-field-value">{field.value}</p>
                    </div>
                  ))}
                </div>
                <div className="mobile-screen-pills">
                  <span className="mobile-screen-pill" data-tone={user.is_active ? "teal" : "amber"}>
                    {user.is_active ? "Active account" : "Inactive account"}
                  </span>
                  <span className="mobile-screen-pill" data-tone={user.two_factor_enabled ? "teal" : "amber"}>
                    {user.two_factor_enabled ? "2FA enabled" : "2FA disabled"}
                  </span>
                </div>
                {!editingName ? (
                  <div className="mobile-screen-actions">
                    <button
                      type="button"
                      onClick={() => {
                        setNameInput(user.full_name || "");
                        setDobInput(user.date_of_birth || "");
                        setProfileError("");
                        setEditingName(true);
                      }}
                      className="mobile-screen-button mobile-screen-button-primary"
                    >
                      Edit profile
                    </button>
                    <button
                      type="button"
                      onClick={() => setActiveDialog("username")}
                      className="mobile-screen-button mobile-screen-button-secondary"
                    >
                      Username
                    </button>
                  </div>
                ) : (
                  <div className="mobile-screen-form-stack">
                    <div className="mobile-screen-field">
                      <label htmlFor="mobile-account-full-name" className="mobile-screen-field-label">Full name</label>
                      <input
                        id="mobile-account-full-name"
                        type="text"
                        value={nameInput}
                        onChange={(event) => {
                          setNameInput(event.target.value);
                          if (profileError) {
                            setProfileError("");
                          }
                        }}
                        placeholder="Your full name"
                        disabled={savingProfile}
                        className="mobile-screen-input"
                      />
                    </div>
                    <div className="mobile-screen-field">
                      <label htmlFor="mobile-account-dob" className="mobile-screen-field-label">Date of birth</label>
                      <input
                        id="mobile-account-dob"
                        type="date"
                        value={dobInput}
                        onChange={(event) => {
                          setDobInput(event.target.value);
                          if (profileError) {
                            setProfileError("");
                          }
                        }}
                        disabled={savingProfile}
                        className="mobile-screen-input"
                      />
                    </div>
                    {profileError ? <p className="mobile-screen-error">{profileError}</p> : null}
                    <div className="mobile-screen-actions">
                      <button
                        type="button"
                        disabled={savingProfile}
                        onClick={async () => {
                          const trimmedName = nameInput.trim();

                          if (!trimmedName) {
                            setProfileError("Enter a full name before saving.");
                            return;
                          }

                          try {
                            setSavingProfile(true);
                            setProfileError("");
                            const updated = await withAuthRetry((token) =>
                              updateCurrentUser(token, {
                                full_name: trimmedName,
                                date_of_birth: dobInput || null,
                              })
                            );
                            setUser(updated);
                            setNameInput(updated.full_name || "");
                            setDobInput(updated.date_of_birth || "");
                            setProfileError("");
                            setEditingName(false);
                          } catch (error) {
                            setProfileError(error instanceof Error ? error.message : "Failed to save your profile details.");
                          } finally {
                            setSavingProfile(false);
                          }
                        }}
                        className="mobile-screen-button mobile-screen-button-primary"
                      >
                        {savingProfile ? (
                          <>
                            <span className="button-live-loader" aria-hidden="true" />
                            Saving...
                          </>
                        ) : "Save profile"}
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setEditingName(false);
                          setNameInput(user.full_name || "");
                          setDobInput(user.date_of_birth || "");
                          setProfileError("");
                        }}
                        disabled={savingProfile}
                        className="mobile-screen-button mobile-screen-button-secondary"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                )}
              </section>

              <section className="mobile-screen-panel">
                <div className="mobile-screen-panel-header">
                  <div>
                    <p className="mobile-screen-kicker">Security and session</p>
                    <h2 className="mobile-screen-title">Access controls for this browser</h2>
                  </div>
                </div>
                <div className="mobile-screen-toggle-row">
                  <div>
                    <p className="mobile-screen-row-title">Two-factor protection</p>
                    <p className="mobile-screen-row-copy">
                      {user.two_factor_enabled
                        ? "Password logins require an email code."
                        : "Password logins do not require an email code."}
                    </p>
                  </div>
                  <AccountSlideToggle
                    checked={user.two_factor_enabled}
                    disabled={savingTwoFactor}
                    label={user.two_factor_enabled ? "Disable two-factor authentication" : "Enable two-factor authentication"}
                    onToggle={() => {
                      void handleTwoFactorToggle();
                    }}
                  />
                </div>
                <div className="mobile-screen-link-grid" style={{ marginTop: "1rem" }}>
                  <ScrollIntentLink href="/history" className="mobile-screen-link-card">
                    <p className="mobile-screen-link-title">Saved history</p>
                    <p className="mobile-screen-link-copy">Review saved reports and ML runs.</p>
                    <span className="mobile-screen-link-cta">Open history</span>
                  </ScrollIntentLink>
                  <ScrollIntentLink href="/batch" className="mobile-screen-link-card">
                    <p className="mobile-screen-link-title">Uploads</p>
                    <p className="mobile-screen-link-copy">Upload a CSV or change the active dataset.</p>
                    <span className="mobile-screen-link-cta">Open uploads</span>
                  </ScrollIntentLink>
                </div>
                <div className="mobile-screen-actions" style={{ marginTop: "1rem" }}>
                  <button
                    type="button"
                    onClick={() => setActiveDialog("email")}
                    className="mobile-screen-button mobile-screen-button-secondary"
                  >
                    Change email
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveDialog("password")}
                    className="mobile-screen-button mobile-screen-button-secondary"
                  >
                    Update password
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      void handleLogout();
                    }}
                    disabled={loggingOut}
                    className="mobile-screen-button mobile-screen-button-danger"
                  >
                    {loggingOut ? (
                      <>
                        <span className="button-live-loader" aria-hidden="true" />
                        Logging out...
                      </>
                    ) : "Log out"}
                  </button>
                </div>
              </section>

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
                        setProfileError("");
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
                          onChange={(e) => {
                            setNameInput(e.target.value);
                            if (profileError) {
                              setProfileError("");
                            }
                          }}
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
                          onChange={(e) => {
                            setDobInput(e.target.value);
                            if (profileError) {
                              setProfileError("");
                            }
                          }}
                          disabled={savingProfile}
                          className="w-full rounded-lg border border-white/10 bg-white/[0.03] px-3 py-2.5 text-sm text-white focus:border-blue-500 focus:outline-none disabled:opacity-50"
                        />
                      </div>
                      {profileError ? (
                        <p className="text-sm text-[#ff9ca5]">{profileError}</p>
                      ) : null}
                      <div className="flex gap-2">
                        <button
                          type="button"
                          disabled={savingProfile}
                          onClick={async () => {
                            const trimmedName = nameInput.trim();

                            if (!trimmedName) {
                              setProfileError("Enter a full name before saving.");
                              return;
                            }

                            try {
                              setSavingProfile(true);
                              setProfileError("");
                              const updated = await withAuthRetry((token) =>
                                updateCurrentUser(token, {
                                  full_name: trimmedName,
                                  date_of_birth: dobInput || null,
                                })
                              );
                              setUser(updated);
                              setNameInput(updated.full_name || "");
                              setDobInput(updated.date_of_birth || "");
                              setProfileError("");
                              setEditingName(false);
                            } catch (error) {
                              setProfileError(error instanceof Error ? error.message : "Failed to save your profile details.");
                            } finally {
                              setSavingProfile(false);
                            }
                          }}
                          className="inline-flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-50"
                        >
                          {savingProfile ? (
                            <>
                              <span className="button-live-loader" aria-hidden="true" />
                              Saving...
                            </>
                          ) : "Save"}
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setEditingName(false);
                            setNameInput(user.full_name || "");
                            setDobInput(user.date_of_birth || "");
                            setProfileError("");
                          }}
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
                    <div className="flex items-center gap-3">
                      <span className="text-xs uppercase tracking-[0.16em] text-white/32">
                        {savingTwoFactor ? "Saving" : user.two_factor_enabled ? "On" : "Off"}
                      </span>
                      <AccountSlideToggle
                        checked={user.two_factor_enabled}
                        disabled={savingTwoFactor}
                        label={user.two_factor_enabled ? "Disable two-factor authentication" : "Enable two-factor authentication"}
                        onToggle={() => {
                          void handleTwoFactorToggle();
                        }}
                      />
                    </div>
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
  return (
    <div className="mobile-screen-stack mobile-screen-stack-compact">
      {toolGroups.map((group) => (
        <section
          key={group.title}
          className={`mobile-screen-panel ${group.items.some((item) => item.destructive) ? "mobile-screen-panel-danger" : ""}`}
          style={{ "--account-panel-accent": group.accent } as React.CSSProperties}
        >
          <div className="mobile-screen-panel-header">
            <div>
              <p className="mobile-screen-kicker">{group.title}</p>
              <h2 className="mobile-screen-title">{group.description}</h2>
            </div>
          </div>
          <div className="mobile-screen-list" style={{ marginTop: "0.3rem" }}>
            {group.items.map((item) => (
              <button
                key={item.key}
                type="button"
                onClick={() => setActiveDialog(item.key)}
                className={`mobile-screen-row mobile-screen-action-row ${item.destructive ? "mobile-screen-row-danger" : ""}`}
              >
                <div className="mobile-screen-row-header">
                  <div className="mobile-screen-row-main">
                    <p className="mobile-screen-row-title">{item.title}</p>
                    <p className="mobile-screen-row-copy">{item.detail}</p>
                  </div>
                  <span className="mobile-screen-row-trail">
                    {item.destructive ? "Delete" : "Open"}
                  </span>
                </div>
              </button>
            ))}
          </div>
          {group.title === "Access and browser" ? (
            <div className="mobile-screen-pills compact">
              <span className="mobile-screen-pill">{user.email}</span>
              <span className="mobile-screen-pill">{rememberStatus.available ? "Browser memory available" : "No browser memory saved"}</span>
            </div>
          ) : null}
        </section>
      ))}
    </div>
  );
}