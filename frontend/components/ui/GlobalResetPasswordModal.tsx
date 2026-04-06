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
import { clearUserScopedFrontendState, moveInputCaretToEnd } from "@/lib/helpers";
import { LOGOUT_BROADCAST_KEY } from "@/components/ui/GlobalOverlays";
import { queuePasswordChangedNotice } from "@/lib/session";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";
import PasswordStrengthBar from "@/components/ui/PasswordStrengthBar";

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
      window.location.replace(cleanPath);
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
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-[2px]"
      onClick={closeModal}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#15151a] p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-white">Reset Password</h2>
        <p className="mt-3 text-sm leading-7 text-white/65">
          Create a new password for your account.
        </p>

        <div className="mt-3 rounded-[12px] border border-white/10 bg-[#111116] px-3 py-2 text-xs text-white/70">
          {contextLoading ? (
            <p>Loading account details...</p>
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

        <div className="mt-6 flex items-center gap-3">
          <button
            type="button"
            onClick={closeModal}
            disabled={loading}
            className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
          >
            Cancel
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
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading ? "Resetting..." : "Reset password"}
          </button>
        </div>
      </div>
    </div>
  );
}
