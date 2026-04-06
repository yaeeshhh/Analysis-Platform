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
  type RememberStatus,
  type User,
} from "@/lib/auth";
import { clearCurrentAnalysisSelection, notifyAnalysesChanged } from "@/lib/currentAnalysis";
import { formatDate } from "@/lib/helpers";
import { useApplyNavigationScroll } from "@/lib/navigationScroll";
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

export default function AccountPage() {
  const [activeDialog, setActiveDialog] = useState<AccountDialogKey | null>(null);
  const [loginRequired, setLoginRequired] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [rememberStatus, setRememberStatus] = useState<RememberStatus>(emptyRememberStatus);

  useApplyNavigationScroll("/account", !loading);

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

  const stats = user
    ? [
        {
          label: "Member since",
          value: formatDate(user.created_at),
          hint: user.email,
        },
        {
          label: "Status",
          value: user.is_active ? "Active" : "Inactive",
          hint: "Current access state",
        },
        {
          label: "Remembered login",
          value: rememberStatus.available
            ? rememberStatus.enabled
              ? `${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"}`
              : "Disabled"
            : "Not set",
          hint: "This browser only",
        },
      ]
    : [];

  return (
    <>
      <AppShell
        eyebrow="Account"
        title="Manage access, identity, and saved work"
        description="Update profile details, remembered-login settings, saved runs, and deletion controls from one account center."
        stats={stats}
        actions={
          user ? (
            <div className="flex flex-wrap gap-3">
              <ScrollIntentLink href="/history" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
                Review saved history
              </ScrollIntentLink>
              <ScrollIntentLink href="/batch" className="rounded-full border border-white/12 px-5 py-3 text-sm text-white/82">
                Open uploads page
              </ScrollIntentLink>
            </div>
          ) : undefined
        }
      >
        {loading ? (
          <div className="rounded-[28px] border border-white/10 bg-white/[0.04] px-5 py-10 text-center text-sm text-white/55">
            Loading account tools...
          </div>
        ) : null}

        {!loading && user ? (
          <>
            {/* ─── Phone: tappable section list ─── */}
            <AccountMobileSections user={user} rememberStatus={rememberStatus} setActiveDialog={setActiveDialog} />

            {/* ─── Desktop: existing card layout ─── */}
            <section id="account-first-block" className="route-scroll-target">
              <details className="mobile-accordion tablet-up">
                <summary>
                  <div className="min-w-0">
                    <span className="text-xs uppercase tracking-[0.24em] text-[#7ad6ff]">Account snapshot</span>
                    <p className="mobile-accordion-hint">Username, email, member since, and remembered login status</p>
                  </div>
                </summary>
                <div className="mobile-accordion-body">
                <div className="mt-5 grid gap-3 md:grid-cols-2">
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Username</p>
                    <p className="mt-3 text-lg font-medium text-white">{user.username || "Not set"}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Email</p>
                    <p className="mt-3 break-all text-lg font-medium text-white">{user.email}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Member since</p>
                    <p className="mt-3 text-lg font-medium text-white">{formatDate(user.created_at)}</p>
                  </div>
                  <div className="rounded-[22px] border border-white/10 bg-black/10 p-4">
                    <p className="text-xs uppercase tracking-[0.14em] text-white/42">Remembered login</p>
                    <p className="mt-3 text-lg font-medium text-white">
                      {rememberStatus.available
                        ? rememberStatus.enabled
                          ? `Enabled for ${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"}`
                          : "Available but disabled"
                        : "Not configured"}
                    </p>
                  </div>
                  </div>
                </div>
              </details>
            </section>

            <section className="space-y-4">
              {toolGroups.map((group) => (
                <details
                  key={group.title}
                  className="mobile-accordion tablet-up"
                >
                  <summary>
                    <div className="min-w-0">
                      <span className="text-xs uppercase tracking-[0.24em]" style={{ color: group.accent }}>{group.title}</span>
                      <p className="mobile-accordion-hint">{group.description}</p>
                    </div>
                  </summary>
                  <div className="mobile-accordion-body">
                  <div className="mt-5 grid gap-3">
                    {group.items.map((item) => (
                      <button
                        key={item.key}
                        type="button"
                        onClick={() => {
                          setActiveDialog(item.key);
                        }}
                        className={`w-full rounded-[20px] border p-4 text-left transition ${item.destructive ? "border-[#5a2328] bg-[#2a1215] hover:bg-[#34171b]" : "border-white/10 bg-black/10 hover:bg-white/[0.06]"}`}
                      >
                        <div className="flex items-start justify-between gap-3">
                          <div className="min-w-0 flex-1">
                            <p className={`font-medium ${item.destructive ? "text-[#ffb4ba]" : "text-white"}`}>{item.title}</p>
                            <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                          </div>
                          <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${item.destructive ? "border-[#8a3941] text-[#ffb4ba]" : "border-white/12 text-white/52"}`}>
                            {item.destructive ? "Danger" : "Open"}
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                </div>
                </details>
              ))}
            </section>
          </>
        ) : null}

        {!loading && !user ? (
          <div className="rounded-[28px] border border-dashed border-white/12 px-5 py-10 text-center text-sm text-white/52">
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
        <div className="space-y-3">
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
            <div key={stat.label} className="rounded-2xl border border-white/10 bg-white/[0.04] p-4">
              <p className="text-[0.65rem] uppercase tracking-wider text-white/42">{stat.label}</p>
              <p className="mt-2 text-base font-medium text-white">{stat.value}</p>
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
              className={`w-full rounded-2xl border p-4 text-left ${item.destructive ? "border-[#5a2328] bg-[#2a1215]" : "border-white/10 bg-white/[0.04]"}`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className={`font-medium ${item.destructive ? "text-[#ffb4ba]" : "text-white"}`}>{item.title}</p>
                  <p className="mt-2 text-sm leading-6 text-white/62">{item.detail}</p>
                </div>
                <span className={`shrink-0 rounded-full border px-3 py-1 text-[11px] uppercase tracking-[0.14em] ${item.destructive ? "border-[#8a3941] text-[#ffb4ba]" : "border-white/12 text-white/52"}`}>
                  {item.destructive ? "Danger" : "Open"}
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