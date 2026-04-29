"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clearAccessToken } from "@/lib/api";
import {
  clearRememberedLogin,
  clearRememberedLogins,
  getResetPasswordContext,
  resetPassword,
} from "@/lib/auth";
import {
  getPasswordStrengthState,
  validatePasswordPolicy,
} from "@/lib/passwordPolicy";
import {
  clearUserScopedFrontendState,
  commitMobileTextFieldAndCloseKeyboard,
  moveInputCaretToEnd,
} from "@/lib/helpers";
import { LOGOUT_BROADCAST_KEY } from "@/components/ui/GlobalOverlays";
import { armReauthPrompt, queuePasswordChangedNotice } from "@/lib/session";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";
import PasswordStrengthBar from "@/components/ui/PasswordStrengthBar";
import SurfaceLoadingIndicator from "@/components/ui/SurfaceLoadingIndicator";

function withQueryRemoved(
  pathname: string,
  query: URLSearchParams,
  keys: string[]
): string {
  const next = new URLSearchParams(query.toString());
  keys.forEach((key) => next.delete(key));
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function GlobalResetPasswordModal() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isMounted, setIsMounted] = useState(false);

  const token = useMemo(
    () => searchParams.get("reset_token") || searchParams.get("token") || "",
    [searchParams]
  );

  const isOpen = !!token;
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [loading, setLoading] = useState(false);
  const [contextLoading, setContextLoading] = useState(false);
  const [accountEmail, setAccountEmail] = useState("");
  const [accountUsername, setAccountUsername] = useState<string | null>(null);
  const [error, setError] = useState("");
  const passwordStrength = getPasswordStrengthState(newPassword);
  const showPasswordStrengthBar = newPassword.length > 0;
  const showPasswordAdequacyMessage =
    newPassword.length > 0 &&
    (passwordStrength.level === "weak" || newPasswordFocused);
  const showPasswordMatchStatus =
    confirmPassword.length > 0 && newPassword.length > 0;
  const passwordsMatch = newPassword === confirmPassword;

  useEffect(() => {
    setIsMounted(true);
  }, []);

  useEffect(() => {
    if (!isOpen || typeof document === "undefined") return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    setNewPassword("");
    setConfirmPassword("");
    setShowPassword(false);
    setShowConfirmPassword(false);
    setNewPasswordFocused(false);
    setLoading(false);
    setContextLoading(false);
    setAccountEmail("");
    setAccountUsername(null);
    setError("");
  }, [isOpen, token]);

  useEffect(() => {
    if (!isOpen || !token) return;

    let active = true;

    const loadContext = async () => {
      setContextLoading(true);
      try {
        const context = await getResetPasswordContext(token);
        if (!active) return;
        setAccountEmail(context.email || "");
        setAccountUsername(context.username || null);
      } catch (err: unknown) {
        if (!active) return;
        setError(err instanceof Error ? err.message : "Invalid or expired reset token");
      } finally {
        if (active) {
          setContextLoading(false);
        }
      }
    };

    loadContext();

    return () => {
      active = false;
    };
  }, [isOpen, token]);

  const closeModal = () => {
    const nextPath = withQueryRemoved(pathname, searchParams, [
      "reset_token",
      "token",
      "login_prompt",
    ]);
    router.replace(nextPath, { scroll: false });
  };

  const submitReset = async () => {
    setError("");

    if (!token) {
      setError("Reset token is missing.");
      return;
    }

    const policyError = validatePasswordPolicy(newPassword);
    if (policyError) {
      setError(policyError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      await resetPassword(token, newPassword);
      queuePasswordChangedNotice(accountEmail);
      clearAccessToken();
      clearUserScopedFrontendState();
      if (accountEmail) {
        clearRememberedLogin(accountEmail);
      } else {
        clearRememberedLogins();
      }
      // I ping the other tabs too so they drop the old session after the password change.
      localStorage.setItem(LOGOUT_BROADCAST_KEY, Date.now().toString());
      const cleanPath = withQueryRemoved(pathname, searchParams, [
        "reset_token",
        "token",
        "login_prompt",
      ]);
      const basePath = cleanPath.split("?", 1)[0] || pathname;
      const destinationPath = ["/login", "/signup", "/reset-password"].includes(basePath)
        ? "/login"
        : cleanPath;

      if (destinationPath !== "/login") {
        armReauthPrompt();
      }

      window.location.replace(destinationPath);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to reset password."
      );
    } finally {
      setLoading(false);
    }
  };

  if (!isMounted || !isOpen) return null;

  return (
    <div
      className="modal-viewport-overlay fixed inset-0 z-[100] flex items-end justify-center overflow-y-auto bg-black/50 px-0 backdrop-blur-[2px] sm:items-center sm:px-4"
      style={{
        top: "var(--app-viewport-offset-top, 0px)",
        bottom: "auto",
        height: "var(--app-viewport-height, 100vh)",
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      onClick={closeModal}
    >
      <div
        className="global-reset-modal-card modal-viewport-card w-full max-w-md rounded-t-2xl border border-white/10 bg-[#15151a] text-white sm:rounded-xl"
        onClick={(e) => e.stopPropagation()}
        onKeyDownCapture={commitMobileTextFieldAndCloseKeyboard}
      >
        <div className="border-b border-white/10 px-5 pb-4 pt-5 sm:px-6 sm:pb-5 sm:pt-6">
          <div className="flex items-start justify-between">
            <div>
              <h2 className="text-2xl font-semibold tracking-tight text-white">Reset Password</h2>
              <p className="mt-3 text-sm leading-7 text-white/65">
                Create a new password for your account.
              </p>
            </div>
            <button
              type="button"
              onClick={closeModal}
              aria-label="Close"
              className="-mr-1 -mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-white/50 transition hover:bg-white/10 hover:text-white/80"
            >
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true"><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
            </button>
          </div>
        </div>

        <div className="modal-viewport-scroll px-5 py-5 sm:px-6 sm:py-5">
          <div className="rounded-[12px] border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white/70">
            {contextLoading ? (
              <SurfaceLoadingIndicator label="Loading account details..." className="justify-start" />
            ) : (
              <>
                <p>Email: {accountEmail || "Unavailable"}</p>
                <p>Username: {accountUsername || "Unavailable"}</p>
              </>
            )}
          </div>

          <div className="mt-5 space-y-3">
          <>
            <div className="relative">
              <input
                id="global-reset-new-password"
                type={showPassword ? "text" : "password"}
                enterKeyHint="done"
                placeholder="Password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                onFocus={(e) => {
                  setNewPasswordFocused(true);
                  moveInputCaretToEnd(e.currentTarget);
                }}
                onBlur={() => setNewPasswordFocused(false)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    submitReset();
                  }
                }}
                disabled={loading || contextLoading || !accountEmail}
                className="w-full rounded-[14px] border border-white/10 bg-[#111116] px-3 py-2.5 pr-14 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
              <PasswordToggleButton
                shown={showPassword}
                onToggle={() => setShowPassword((prev) => !prev)}
                variant="modal"
              />
            </div>
            <PasswordStrengthBar
              show={showPasswordStrengthBar}
              barClassName={passwordStrength.barClassName}
              progressPercent={passwordStrength.progressPercent}
              showMessage={showPasswordAdequacyMessage}
              message={passwordStrength.statusMessage}
              textClassName={passwordStrength.textClassName}
            />

            <div className="relative">
              <input
                id="global-reset-confirm-password"
                type={showConfirmPassword ? "text" : "password"}
                enterKeyHint="done"
                placeholder="Confirm password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !loading) {
                    submitReset();
                  }
                }}
                disabled={loading || contextLoading || !accountEmail}
                className="w-full rounded-[14px] border border-white/10 bg-[#111116] px-3 py-2.5 pr-14 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />
              <PasswordToggleButton
                shown={showConfirmPassword}
                onToggle={() => setShowConfirmPassword((prev) => !prev)}
                variant="modal"
                label="confirm password"
              />
            </div>

            {showPasswordMatchStatus && (
              <p
                className={`text-xs ${
                  passwordsMatch ? "text-emerald-300" : "text-red-300"
                }`}
              >
                {passwordsMatch ? "Passwords match" : "Passwords do not match"}
              </p>
            )}
          </>

          {error && (
            <p className="rounded-[12px] border border-[#5a2328] bg-[#2a1215] px-3 py-2 text-xs text-[#ff8b94]">
              {error}
            </p>
          )}
        </div>
        </div>

        <div className="border-t border-white/10 bg-[#15151a]/96 px-5 py-4 backdrop-blur sm:px-6">
          <div className="flex flex-col-reverse gap-3 sm:flex-row sm:flex-wrap sm:items-center">
          <button
            type="button"
            onClick={closeModal}
            disabled={loading}
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50 sm:w-auto"
          >
            {loading ? (
              <>
                <span className="button-live-loader" aria-hidden="true" />
                Cancel
              </>
            ) : "Cancel"}
          </button>
          <button
            type="button"
            onClick={submitReset}
            disabled={
              loading ||
              contextLoading ||
              !accountEmail ||
              !newPassword ||
              !!validatePasswordPolicy(newPassword) ||
              !confirmPassword ||
              !passwordsMatch
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50 sm:w-auto"
          >
            {loading ? (
              <>
                <span className="button-live-loader button-live-loader-dark" aria-hidden="true" />
                Resetting...
              </>
            ) : "Reset password"}
          </button>
          </div>
        </div>
      </div>
    </div>
  );
}
