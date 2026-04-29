"use client";

import { type ReactNode, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { clearAccessToken, getAccessToken, setAccessToken } from "@/lib/api";
import { deleteAllAnalyses } from "@/lib/analysisApi";
import {
  checkSignupAvailability,
  clearRememberedLogin,
  forgotPassword,
  generateRememberToken,
  getRememberStatus,
  refreshAccessToken,
  requestAccountDeletionCode,
  requestProfileUpdateCode,
  resetRememberedLogin,
  sendAccountDeletionCode,
  sendProfileUpdateCode,
  setRememberEnabled,
  type RememberStatus,
  type User,
  updateCurrentUser,
  verifyAccountDeletionCode,
  verifyProfileUpdateCode,
} from "@/lib/auth";
import { getEmailValidationError, isSignupEmailValid } from "@/lib/emailValidation";
import {
  clearUserScopedFrontendState,
  commitMobileTextFieldAndCloseKeyboard,
  formatCountdown,
  maskEmailAddress,
  moveInputCaretToEnd,
} from "@/lib/helpers";
import {
  getPasswordStrengthState,
  validatePasswordPolicy,
} from "@/lib/passwordPolicy";
import {
  PASSWORD_CHANGED_QUERY_PARAM,
  clearActiveAccountEmail,
  queuePasswordChangedNotice,
} from "@/lib/session";
import { LOGOUT_BROADCAST_KEY } from "@/components/ui/GlobalOverlays";
import OtpCodeInput from "@/components/ui/OtpCodeInput";
import PasswordStrengthBar from "@/components/ui/PasswordStrengthBar";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";

export type AccountDialogKey =
  | "email"
  | "username"
  | "password"
  | "remember"
  | "clear-uploads"
  | "danger";

type AccountDialogsProps = {
  activeDialog: AccountDialogKey | null;
  onClose: () => void;
  user: User | null;
  rememberStatus: RememberStatus;
  onUserUpdated: (user: User, notice: string) => void;
  onRememberStatusUpdated: (status: RememberStatus, notice: string) => void;
  onAnalysisUploadsCleared: (notice: string) => void;
};

type DialogShellProps = {
  open: boolean;
  eyebrow: string;
  title: string;
  description: string;
  onClose: () => void;
  children: ReactNode;
  maxWidthClassName?: string;
};

async function getAccessTokenWithRefresh(): Promise<string> {
  const existingToken = getAccessToken();
  if (existingToken) return existingToken;

  const refreshed = await refreshAccessToken();
  setAccessToken(refreshed.access_token);
  return refreshed.access_token;
}

async function withAuthRetry<T>(request: (token: string) => Promise<T>): Promise<T> {
  const initialToken = await getAccessTokenWithRefresh();

  try {
    return await request(initialToken);
  } catch (error) {
    if (!(error instanceof Error)) {
      throw error;
    }

    const message = error.message.trim().toLowerCase();
    const tokenRelated =
      message === "invalid token" ||
      message.includes("token") ||
      message.includes("credentials") ||
      message.includes("not authenticated");

    if (!tokenRelated) {
      throw error;
    }

    const refreshed = await refreshAccessToken();
    setAccessToken(refreshed.access_token);
    return request(refreshed.access_token);
  }
}

function DialogShell({
  open,
  eyebrow,
  title,
  description,
  onClose,
  children,
  maxWidthClassName = "max-w-2xl",
}: DialogShellProps) {
  if (!open) return null;

  return (
    <div
      className="account-dialog-overlay modal-viewport-overlay fixed inset-0 z-[140] flex items-end justify-center overflow-y-auto bg-[#080c16]/80 px-2 backdrop-blur-md sm:items-center sm:px-4"
      style={{
        top: "var(--app-viewport-offset-top, 0px)",
        bottom: "auto",
        height: "var(--app-viewport-height, 100vh)",
        paddingTop: "max(0.5rem, env(safe-area-inset-top))",
        paddingBottom: "max(0.75rem, env(safe-area-inset-bottom))",
      }}
      onMouseDown={onClose}
    >
      <div
        className={`account-dialog-card modal-viewport-card w-full ${maxWidthClassName} rounded-xl border border-[#a78bfa]/15 bg-[#0d1117]/98 text-[#f1f5f9]`}
        onMouseDown={(event) => event.stopPropagation()}
        onKeyDownCapture={commitMobileTextFieldAndCloseKeyboard}
      >
        <div className="account-dialog-header flex flex-col gap-3 border-b border-[#a78bfa]/12 px-4 pb-5 pt-4 sm:flex-row sm:items-start sm:justify-between sm:gap-4 sm:px-6 sm:pb-5 sm:pt-6">
          <div>
            <p className="account-dialog-eyebrow text-xs uppercase tracking-[0.24em] text-[#a78bfa]">{eyebrow}</p>
            <h2 className="account-dialog-title mt-2 font-[family:var(--font-display)] text-2xl text-[#f1f5f9]">{title}</h2>
            <p className="account-dialog-desc mt-2 max-w-2xl text-sm leading-6 text-[#94a3b8]">{description}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close dialog"
            className="account-dialog-close self-end rounded-lg border border-[#a78bfa]/15 bg-[#111827] p-2 text-[#a78bfa] transition hover:bg-[#1a2332] hover:text-white sm:self-auto"
          >
            <svg viewBox="0 0 24 24" aria-hidden="true" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M18 6 6 18M6 6l12 12" />
            </svg>
          </button>
        </div>
        <div className="account-dialog-body modal-viewport-scroll space-y-4 px-4 pb-4 pt-5 sm:px-6 sm:pb-6">{children}</div>
      </div>
    </div>
  );
}

function FooterActions({
  onClose,
  onConfirm,
  confirmLabel,
  disabled,
  destructive = false,
  loading = false,
}: {
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  confirmLabel: string;
  disabled?: boolean;
  destructive?: boolean;
  loading?: boolean;
}) {
  return (
    <div
      className="sticky bottom-0 z-10 mt-6 flex flex-col-reverse gap-3 border-t border-[#a78bfa]/12 bg-[#0d1117]/96 pt-4 backdrop-blur md:static md:mt-4 md:flex-row md:flex-wrap md:justify-end"
      style={{ paddingBottom: "max(0.25rem, env(safe-area-inset-bottom))" }}
    >
      <button
        type="button"
        onClick={onClose}
        className="w-full rounded-lg border border-white/5 bg-[#111827] px-5 py-3 text-center text-sm font-medium leading-5 text-[#94a3b8] transition hover:bg-[#1a2332] md:w-auto"
      >
        Cancel
      </button>
      <button
        type="button"
        onClick={() => {
          void onConfirm();
        }}
        disabled={disabled}
        className={`inline-flex w-full items-center justify-center gap-2 rounded-lg px-5 py-3 text-center text-sm font-semibold leading-5 transition disabled:cursor-not-allowed disabled:opacity-55 md:min-w-[12rem] md:w-auto ${
          destructive
            ? "border border-[#dc2626]/25 bg-[#dc2626]/10 text-[#f87171] hover:bg-[#dc2626]/15"
            : "bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] text-white hover:from-[#8b5cf6] hover:to-[#7c3aed]"
        }`}
      >
        {loading ? (
          <>
            <span className="button-live-loader" aria-hidden="true" />
            {confirmLabel}
          </>
        ) : confirmLabel}
      </button>
    </div>
  );
}

function StatusBlock({ error, success }: { error?: string; success?: string }) {
  return (
    <>
      {error ? (
        <p className="rounded-[16px] border border-[#dc2626]/25 bg-[#dc2626]/10 px-4 py-3 text-sm text-[#f87171]">
          {error}
        </p>
      ) : null}
      {success ? (
        <p className="rounded-[16px] border border-[#0d9488]/25 bg-[#0d9488]/10 px-4 py-3 text-sm text-[#2dd4bf]">
          {success}
        </p>
      ) : null}
    </>
  );
}

function IdentityChangeDialog({
  open,
  onClose,
  user,
  field,
  onUpdated,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  field: "email" | "username";
  onUpdated: (user: User, notice: string) => void;
}) {
  const [value, setValue] = useState("");
  const [confirmValue, setConfirmValue] = useState("");
  const [availability, setAvailability] = useState<"idle" | "invalid" | "checking" | "available" | "taken">("idle");
  const [focused, setFocused] = useState(false);
  const [challengeToken, setChallengeToken] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpFormatValid, setOtpFormatValid] = useState(true);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const currentValue = field === "email" ? user.email : user.username || "";
  const trimmedValue = value.trim();
  const trimmedConfirmValue = confirmValue.trim();
  const normalizedValue = field === "email" ? trimmedValue.toLowerCase() : trimmedValue;
  const normalizedCurrentValue = field === "email" ? currentValue.trim().toLowerCase() : currentValue.trim();
  const hasSpaces = field === "username" && trimmedValue.includes(" ");
  const looksValid =
    field === "email"
      ? isSignupEmailValid(normalizedValue)
      : normalizedValue.length >= 3 && !hasSpaces;
  const changed = trimmedValue.length > 0 && normalizedValue !== normalizedCurrentValue;
  const matches = trimmedValue.length > 0 && normalizedValue === (field === "email" ? trimmedConfirmValue.toLowerCase() : trimmedConfirmValue);
  const label = field === "email" ? "Email" : "Username";
  const primaryLabel = loading
    ? challengeToken
      ? otpSent
        ? `Verifying ${label.toLowerCase()}...`
        : "Sending code..."
      : `Preparing ${label.toLowerCase()}...`
    : !challengeToken
      ? `Start ${label.toLowerCase()} change`
      : !otpSent
        ? "Send verification code"
        : `Verify ${label.toLowerCase()} change`;
  const confirmMessage =
    trimmedConfirmValue.length === 0
      ? ""
      : matches
        ? `${label}s match.`
        : `${label}s do not match.`;
  const errorMessage =
    trimmedValue.length === 0
      ? `Enter your new ${label.toLowerCase()}.`
      : availability === "invalid"
        ? field === "email"
          ? getEmailValidationError(trimmedValue)
          : hasSpaces
            ? "Usernames cannot contain spaces."
            : "Username must be at least 3 characters."
        : !changed
          ? `New ${label.toLowerCase()} cannot match your current ${label.toLowerCase()}.`
          : availability === "taken"
            ? `${label} already exists.`
            : "";
  const statusMessage =
    trimmedValue.length === 0
      ? ""
      : availability === "checking"
        ? `Checking ${label.toLowerCase()} availability...`
        : availability === "available"
          ? `${label} available.`
          : errorMessage;

  useEffect(() => {
    if (!open) {
      setValue("");
      setConfirmValue("");
      setAvailability("idle");
      setFocused(false);
      setChallengeToken("");
      setCodeInput("");
      setCodeSentTo("");
      setOtpSent(false);
      setOtpCountdown(0);
      setOtpMessage("");
      setOtpFormatValid(true);
      setLoading(false);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!otpCountdown) return;

    const timer = window.setInterval(() => {
      setOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [open, otpCountdown]);

  useEffect(() => {
    if (!open) return;
    if (!trimmedValue.length) {
      setAvailability("idle");
      return;
    }
    if (!looksValid) {
      setAvailability("invalid");
      return;
    }
    if (!changed) {
      setAvailability("idle");
      return;
    }

    setAvailability("checking");
    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const result = await checkSignupAvailability(
          field === "email" ? normalizedValue.toLowerCase() : undefined,
          field === "username" ? normalizedValue.toLowerCase() : undefined
        );
        if (!active) return;
        const exists = field === "email" ? result.email_exists : result.username_exists;
        setAvailability(exists ? "taken" : "available");
      } catch {
        if (!active) return;
        setAvailability("idle");
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [changed, field, looksValid, normalizedValue, open, trimmedValue.length]);

  async function handlePrimaryAction() {
    if (!changed || availability !== "available") {
      setError(errorMessage || `Enter a valid ${label.toLowerCase()}.`);
      return;
    }
    if (!matches) {
      setError(`${label}s do not match.`);
      return;
    }

    try {
      setLoading(true);
      setError("");

      if (!challengeToken) {
        const challenge = await withAuthRetry((token) =>
          requestProfileUpdateCode(token, field === "email" ? { email: normalizedValue } : { username: normalizedValue })
        );
        setChallengeToken(challenge.challenge_token);
        setCodeSentTo(challenge.email);
        setOtpCountdown(challenge.resend_available_in_seconds);
        return;
      }

      if (!otpSent) {
        const response = await withAuthRetry((token) => sendProfileUpdateCode(token, challengeToken));
        setCodeSentTo(response.email);
        setOtpSent(true);
        setOtpCountdown(response.resend_available_in_seconds);
        setOtpMessage("Verification code sent.");
        return;
      }

      if (!/^\d{6}$/.test(codeInput.trim()) || !otpFormatValid) {
        setError("Enter the 6-digit verification code.");
        return;
      }

      const updatedUser = await withAuthRetry((token) =>
        verifyProfileUpdateCode(token, challengeToken, codeInput.trim())
      );
      onUpdated(updatedUser, `${label} updated.`);
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : `Failed to update ${label.toLowerCase()}.`);
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      eyebrow={field === "email" ? "Login Email" : "Display Name"}
      title={`Change ${label.toLowerCase()}`}
      description={`Update your ${label.toLowerCase()} here.`}
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-white/6 pb-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/42">Current {label.toLowerCase()}</p>
          <p className="mt-3 break-all text-lg font-medium text-white">{currentValue || "Not set"}</p>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Enter the new {label.toLowerCase()}, confirm it, then request a code that will be sent to {maskEmailAddress(user.email)}.
          </p>
        </div>

        <div className="space-y-3 border-b border-white/6 pb-3">
          <input
            type={field === "email" ? "email" : "text"}
            enterKeyHint="done"
            value={value}
            onChange={(event) => {
              setValue(event.target.value);
              if (challengeToken) {
                setChallengeToken("");
                setOtpSent(false);
                setCodeInput("");
                setOtpCountdown(0);
                setOtpMessage("");
              }
            }}
            onFocus={(event) => {
              setFocused(true);
              moveInputCaretToEnd(event.currentTarget);
            }}
            onBlur={() => setFocused(false)}
            placeholder={`New ${label.toLowerCase()}`}
            className="w-full rounded-[16px] border border-white/10 bg-[#15151a] px-4 py-3 text-sm text-white outline-none"
          />
          {statusMessage && (focused || availability !== "available") ? (
            <p className={`text-[11px] ${availability === "available" ? "text-emerald-300" : errorMessage ? "text-red-300" : "text-white/60"}`}>
              {statusMessage}
            </p>
          ) : null}
          <input
            type={field === "email" ? "email" : "text"}
            enterKeyHint="done"
            value={confirmValue}
            onChange={(event) => {
              setConfirmValue(event.target.value);
              if (challengeToken) {
                setChallengeToken("");
                setOtpSent(false);
                setCodeInput("");
                setOtpCountdown(0);
                setOtpMessage("");
              }
            }}
            onFocus={(event) => moveInputCaretToEnd(event.currentTarget)}
            placeholder={`Confirm ${label.toLowerCase()}`}
            className="w-full rounded-[16px] border border-white/10 bg-[#15151a] px-4 py-3 text-sm text-white outline-none"
          />
          {confirmMessage ? (
            <p className={`text-[11px] ${matches ? "text-emerald-300" : "text-red-300"}`}>
              {confirmMessage}
            </p>
          ) : null}

          {challengeToken ? (
            <div className="space-y-3 rounded-[18px] border border-[#224c37] bg-[#13241c] px-4 py-4">
              <p className="text-sm text-white/78">
                {otpSent
                  ? `Enter the 6-digit code sent to ${maskEmailAddress(codeSentTo || user.email)}.`
                  : `Your change request is ready. Send a 6-digit code to ${maskEmailAddress(codeSentTo || user.email)}.`}
              </p>
              {otpMessage ? <p className="text-xs text-[#9ff4c0]">{otpMessage}</p> : null}
              {otpSent ? (
                <OtpCodeInput
                  value={codeInput}
                  onChange={setCodeInput}
                  onValidityChange={setOtpFormatValid}
                  onEnter={() => {
                    if (!loading && otpFormatValid) {
                      void handlePrimaryAction();
                    }
                  }}
                  disabled={loading}
                  idPrefix={`${field}-change-otp`}
                />
              ) : null}
              {otpSent ? (
                <div className="flex items-center justify-between gap-3 text-[11px] text-white/65">
                  <button
                    type="button"
                    onClick={() => {
                      setOtpSent(false);
                    }}
                    className="underline decoration-white/25 underline-offset-4"
                  >
                    Re-enter details
                  </button>
                  <span>
                    {otpCountdown > 0 ? `Resend available in ${formatCountdown(otpCountdown)}` : "Ready to verify"}
                  </span>
                </div>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>

      <StatusBlock error={error} />
      <FooterActions
        onClose={onClose}
        onConfirm={handlePrimaryAction}
        confirmLabel={primaryLabel}
        loading={loading}
        disabled={loading || (otpSent ? codeInput.trim().length !== 6 || !otpFormatValid : false)}
      />
    </DialogShell>
  );
}

function PasswordChangeDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
}) {
  const [currentPassword, setCurrentPassword] = useState("");
  const [nextPassword, setNextPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNextPassword, setShowNextPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [newPasswordFocused, setNewPasswordFocused] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [forgotMessage, setForgotMessage] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const passwordsMatch = nextPassword.length > 0 && nextPassword === confirmPassword;
  const passwordStrength = getPasswordStrengthState(nextPassword);

  useEffect(() => {
    if (!open) {
      setCurrentPassword("");
      setNextPassword("");
      setConfirmPassword("");
      setShowCurrentPassword(false);
      setShowNextPassword(false);
      setShowConfirmPassword(false);
      setNewPasswordFocused(false);
      setForgotLoading(false);
      setForgotCountdown(0);
      setForgotMessage("");
      setLoading(false);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!forgotCountdown) return;
    const timer = window.setInterval(() => {
      setForgotCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCountdown, open]);

  async function handleForgotPassword() {
    try {
      setForgotLoading(true);
      setError("");
      setForgotMessage("");

      await forgotPassword(user.email, "/account");
      setForgotCountdown(30);
      setForgotMessage(`Check ${maskEmailAddress(user.email)} for the password reset email and use the link there to choose a new password.`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Unable to request password reset.");
    } finally {
      setForgotLoading(false);
    }
  }

  async function handleSave() {
    if (!currentPassword.trim()) {
      setError("Enter your current password.");
      return;
    }
    const policyError = validatePasswordPolicy(nextPassword.trim());
    if (policyError) {
      setError(policyError);
      return;
    }
    if (nextPassword.trim() === currentPassword.trim()) {
      setError("New password cannot match your current password.");
      return;
    }
    if (nextPassword.trim() !== confirmPassword.trim()) {
      setError("Passwords do not match.");
      return;
    }

    try {
      setLoading(true);
      setError("");

      await withAuthRetry((token) =>
        updateCurrentUser(token, {
          password: nextPassword.trim(),
          current_password: currentPassword.trim(),
        })
      );
      queuePasswordChangedNotice(user.email);
      clearAccessToken();
      clearUserScopedFrontendState();
      clearRememberedLogin(user.email);
      clearActiveAccountEmail();
      localStorage.setItem(LOGOUT_BROADCAST_KEY, Date.now().toString());
      onClose();
      const nextUrl = new URL(window.location.href);
      nextUrl.searchParams.delete("reset_token");
      nextUrl.searchParams.delete("token");
      nextUrl.searchParams.delete("login_prompt");
      nextUrl.searchParams.set(PASSWORD_CHANGED_QUERY_PARAM, "1");
      window.location.replace(`${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update password.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      eyebrow="Password"
      title="Update password"
      description="Update your password here."
    >
      <div className="grid gap-4 lg:grid-cols-[0.92fr_1.08fr]">
        <div className="border-b border-white/6 pb-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/42">Security notes</p>
          <div className="mt-4 space-y-3 text-sm leading-6 text-white/64">
            <p>Password updates require the current password to avoid accidental changes.</p>
            <p>Reset links are sent to {maskEmailAddress(user.email)} if you no longer know the current password.</p>
            <p>Remembered login is revoked only after the password is actually changed.</p>
          </div>
        </div>

        <div className="space-y-3 border-b border-white/6 pb-3">
          <div className="relative">
            <input
              type={showCurrentPassword ? "text" : "password"}
              enterKeyHint="done"
              value={currentPassword}
              onChange={(event) => setCurrentPassword(event.target.value)}
              onFocus={(event) => moveInputCaretToEnd(event.currentTarget)}
              placeholder="Current password"
              className="w-full rounded-[16px] border border-white/10 bg-[#15151a] px-4 py-3 pr-14 text-sm text-white outline-none"
            />
            <PasswordToggleButton shown={showCurrentPassword} onToggle={() => setShowCurrentPassword((prev) => !prev)} variant="modal" label="current password" />
          </div>
          <div className="relative">
            <input
              type={showNextPassword ? "text" : "password"}
              enterKeyHint="done"
              value={nextPassword}
              onChange={(event) => setNextPassword(event.target.value)}
              onFocus={(event) => {
                setNewPasswordFocused(true);
                moveInputCaretToEnd(event.currentTarget);
              }}
              onBlur={() => setNewPasswordFocused(false)}
              placeholder="New password"
              className="w-full rounded-[16px] border border-white/10 bg-[#15151a] px-4 py-3 pr-14 text-sm text-white outline-none"
            />
            <PasswordToggleButton shown={showNextPassword} onToggle={() => setShowNextPassword((prev) => !prev)} variant="modal" label="new password" />
          </div>
          <PasswordStrengthBar
            show={nextPassword.length > 0}
            barClassName={passwordStrength.barClassName}
            progressPercent={passwordStrength.progressPercent}
            showMessage={nextPassword.length > 0 && (passwordStrength.level === "weak" || newPasswordFocused)}
            message={passwordStrength.statusMessage}
            textClassName={passwordStrength.textClassName}
            smallText
          />
          <div className="relative">
            <input
              type={showConfirmPassword ? "text" : "password"}
              enterKeyHint="done"
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              onFocus={(event) => moveInputCaretToEnd(event.currentTarget)}
              placeholder="Confirm new password"
              className="w-full rounded-[16px] border border-white/10 bg-[#15151a] px-4 py-3 pr-14 text-sm text-white outline-none"
            />
            <PasswordToggleButton shown={showConfirmPassword} onToggle={() => setShowConfirmPassword((prev) => !prev)} variant="modal" label="confirm password" />
          </div>
          {confirmPassword.length > 0 && nextPassword.length > 0 ? (
            <p className={`text-[11px] ${passwordsMatch ? "text-emerald-300" : "text-red-300"}`}>
              {passwordsMatch ? "Passwords match." : "Passwords do not match."}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => {
              void handleForgotPassword();
            }}
            disabled={loading || forgotLoading || forgotCountdown > 0}
            className="text-left text-xs text-white/75 underline decoration-white/35 underline-offset-4 hover:text-white disabled:no-underline disabled:opacity-50"
          >
            {forgotLoading
              ? "Sending reset link to account email..."
              : forgotCountdown > 0
                ? "Reset link sent"
                : "Forgot current password?"}
          </button>
          {forgotCountdown > 0 ? (
            <p className="text-[11px] leading-5 text-white/55">
              You can request another reset link in {formatCountdown(forgotCountdown)}.
            </p>
          ) : null}
          {forgotMessage ? (
            <div className="rounded-[16px] border border-[#224c37] bg-[#13241c] px-4 py-3 text-xs text-[#9ff4c0]">
              <p>{forgotMessage}</p>
            </div>
          ) : null}
        </div>
      </div>

      <StatusBlock error={error} />
      <FooterActions
        onClose={onClose}
        onConfirm={handleSave}
        confirmLabel={loading ? "Updating password..." : "Update password"}
        loading={loading}
        disabled={loading || !currentPassword.trim() || !nextPassword.trim() || !confirmPassword.trim()}
      />
    </DialogShell>
  );
}

function RememberLoginDialog({
  open,
  onClose,
  user,
  rememberStatus,
  onStatusUpdated,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
  rememberStatus: RememberStatus;
  onStatusUpdated: (status: RememberStatus, notice: string) => void;
}) {
  const [draftEnabled, setDraftEnabled] = useState(false);
  const [resetRequested, setResetRequested] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setDraftEnabled(false);
      setResetRequested(false);
      setSaving(false);
      setError("");
      return;
    }

    setDraftEnabled(rememberStatus.enabled);
    setResetRequested(false);
    setSaving(false);
    setError("");
  }, [open, rememberStatus.enabled]);

  async function handleSave() {
    const normalizedEmail = user.email.trim().toLowerCase();

    try {
      setSaving(true);
      setError("");

      if (draftEnabled && !rememberStatus.available) {
        await getAccessTokenWithRefresh();
        await generateRememberToken(normalizedEmail);
      }

      if (!rememberStatus.available && !draftEnabled) {
        setError("No remembered login exists for this browser yet.");
        return;
      }

      if (resetRequested) {
        const reset = resetRememberedLogin(normalizedEmail, 30);
        if (!reset) {
          setError("No remembered login exists for this browser yet.");
          return;
        }
      }

      const updated = setRememberEnabled(normalizedEmail, draftEnabled);
      if (!updated && rememberStatus.available) {
        setError("Failed to update the remembered login state.");
        return;
      }

      const nextStatus = getRememberStatus(normalizedEmail);
      onStatusUpdated(
        nextStatus,
        draftEnabled
          ? resetRequested
            ? "Remembered login reset to 30 days."
            : "Remembered login enabled for this browser."
          : "Remembered login disabled for this browser."
      );
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to update remembered login.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      eyebrow="This Browser"
      title="Remembered login"
      description="Manage remembered login for this browser."
      maxWidthClassName="max-w-3xl"
    >
      <div className="grid gap-4 lg:grid-cols-[0.95fr_1.05fr]">
        <div className="border-b border-white/6 pb-3">
          <p className="text-xs uppercase tracking-[0.18em] text-white/42">Current state</p>
          <p className="mt-3 text-lg font-medium text-white">
            {rememberStatus.available
              ? rememberStatus.enabled
                ? `Enabled for ${rememberStatus.daysRemaining} day${rememberStatus.daysRemaining === 1 ? "" : "s"}`
                : "Available but disabled"
              : "Not configured on this browser"}
          </p>
          <p className="mt-3 text-sm leading-6 text-white/60">
            Remembered login reduces friction on this browser only. It does not affect other devices or browsers.
          </p>
        </div>

        <div className="space-y-4 border-b border-white/6 pb-3">
          <div className="flex flex-col gap-3 rounded-[18px] border border-white/10 bg-[#15151a] px-4 py-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
            <div>
              <p className="text-sm font-medium text-white">Keep this browser remembered</p>
              <p className="mt-1 text-xs leading-5 text-white/58">Disable it if you want sign-in to require a fresh login again.</p>
            </div>
            <button
              type="button"
              onClick={() => setDraftEnabled((current) => !current)}
              aria-pressed={draftEnabled}
              className={`inline-flex h-6 w-11 shrink-0 items-center self-start rounded-lg border transition sm:self-center ${draftEnabled ? "border-emerald-400/70 bg-emerald-500/30" : "border-white/20 bg-white/10"}`}
            >
              <span className={`h-5 w-5 rounded-lg bg-white transition ${draftEnabled ? "translate-x-5" : "translate-x-0.5"}`} />
            </button>
          </div>

          <div className="rounded-[18px] border border-white/10 bg-[#15151a] px-4 py-4">
            <p className="text-sm font-medium text-white">Reset duration</p>
            <p className="mt-2 text-xs leading-5 text-white/58">Refresh the remembered-login window back to 30 days without changing your sign-in details.</p>
            <button
              type="button"
              onClick={() => setResetRequested(true)}
              disabled={!rememberStatus.available}
              className="mt-3 inline-flex min-h-[2.75rem] w-full items-center justify-center rounded-lg border border-white/10 bg-white/5 px-4 py-2 text-xs text-white/82 transition hover:bg-white/10 disabled:cursor-not-allowed disabled:opacity-45"
            >
              Reset to 30 days
            </button>
          </div>
        </div>
      </div>

      <StatusBlock error={error} success={resetRequested ? "Duration reset will be applied when you save." : ""} />
      <FooterActions
        onClose={onClose}
        onConfirm={handleSave}
        confirmLabel={saving ? "Saving browser state..." : "Save browser settings"}
        loading={saving}
        disabled={saving || (!resetRequested && draftEnabled === rememberStatus.enabled)}
      />
    </DialogShell>
  );
}

function ConfirmDangerDialog({
  open,
  onClose,
  eyebrow,
  title,
  description,
  confirmLabel,
  destructive = true,
  onConfirm,
  loadingLabel,
}: {
  open: boolean;
  onClose: () => void;
  eyebrow: string;
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  loadingLabel: string;
  onConfirm: () => Promise<void>;
}) {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setLoading(false);
      setError("");
    }
  }, [open]);

  async function handleConfirm() {
    try {
      setLoading(true);
      setError("");
      await onConfirm();
      onClose();
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Action failed.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogShell open={open} onClose={onClose} eyebrow={eyebrow} title={title} description={description}>
      <div className="border-l-2 border-[#5a2328]/60 pl-4 text-sm leading-6 text-white/72">
        This action is independent from the rest of the account tools and only affects the data described above.
      </div>
      <StatusBlock error={error} />
      <FooterActions
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmLabel={loading ? loadingLabel : confirmLabel}
        loading={loading}
        destructive={destructive}
        disabled={loading}
      />
    </DialogShell>
  );
}

function DeleteAccountDialog({
  open,
  onClose,
  user,
}: {
  open: boolean;
  onClose: () => void;
  user: User;
}) {
  const router = useRouter();
  const [challengeToken, setChallengeToken] = useState("");
  const [codeInput, setCodeInput] = useState("");
  const [codeSentTo, setCodeSentTo] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpFormatValid, setOtpFormatValid] = useState(true);
  const [armed, setArmed] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (!open) {
      setChallengeToken("");
      setCodeInput("");
      setCodeSentTo("");
      setOtpSent(false);
      setOtpCountdown(0);
      setOtpMessage("");
      setOtpFormatValid(true);
      setArmed(false);
      setLoading(false);
      setError("");
    }
  }, [open]);

  useEffect(() => {
    if (!open) return;
    if (!otpCountdown) return;

    const timer = window.setInterval(() => {
      setOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [open, otpCountdown]);

  async function handleConfirm() {
    try {
      setLoading(true);
      setError("");

      if (!armed && !challengeToken) {
        setArmed(true);
        return;
      }

      if (!challengeToken) {
        const challenge = await withAuthRetry((token) => requestAccountDeletionCode(token));
        setChallengeToken(challenge.challenge_token);
        setCodeSentTo(challenge.email);
        setOtpCountdown(challenge.resend_available_in_seconds);
        setOtpMessage("Ready to send a verification code.");
        setArmed(false);
        return;
      }

      if (!otpSent) {
        const response = await withAuthRetry((token) => sendAccountDeletionCode(token, challengeToken));
        setCodeSentTo(response.email);
        setOtpSent(true);
        setOtpCountdown(response.resend_available_in_seconds);
        setOtpMessage("Verification code sent.");
        return;
      }

      if (!/^\d{6}$/.test(codeInput.trim()) || !otpFormatValid) {
        setError("Enter the 6-digit confirmation code.");
        return;
      }

      const token = await getAccessTokenWithRefresh();
      await verifyAccountDeletionCode(token, challengeToken, codeInput.trim());

      clearAccessToken();
      clearActiveAccountEmail();
      clearRememberedLogin(user.email);
      clearUserScopedFrontendState();
      localStorage.setItem(LOGOUT_BROADCAST_KEY, Date.now().toString());
      window.dispatchEvent(new CustomEvent("auth:logged-out"));
      router.replace("/dashboard");
    } catch (requestError) {
      setError(requestError instanceof Error ? requestError.message : "Failed to delete account.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <DialogShell
      open={open}
      onClose={onClose}
      eyebrow="Delete Account"
      title="Permanently remove this account"
      description="Delete your account here."
    >
      <div className="border-l-2 border-[#5a2328]/60 pl-4 text-sm leading-6 text-white/72">
        <p>This removes saved runs, remembered login records, and verification history.</p>
        {armed && !challengeToken ? (
          <p className="mt-3 text-[#ffb4ba]">Confirm once more to start the email-verification process.</p>
        ) : null}
      </div>

      {challengeToken ? (
        <div className="space-y-3 border-l-2 border-[#5a2328]/60 pl-4">
          <p className="text-sm text-white/78">
            {otpSent
              ? `Enter the 6-digit code sent to ${maskEmailAddress(codeSentTo || user.email)}.`
              : `Send a 6-digit confirmation code to ${maskEmailAddress(codeSentTo || user.email)}.`}
          </p>
          {otpMessage ? <p className="text-xs text-[#ffb4ba]">{otpMessage}</p> : null}
          {otpSent ? (
            <OtpCodeInput
              value={codeInput}
              onChange={setCodeInput}
              onValidityChange={setOtpFormatValid}
              onEnter={() => {
                if (!loading && otpFormatValid) {
                  void handleConfirm();
                }
              }}
              disabled={loading}
              idPrefix="delete-account-confirmation"
            />
          ) : null}
          {otpSent ? (
            <p className="text-[11px] text-white/60">
              {otpCountdown > 0 ? `Resend available in ${formatCountdown(otpCountdown)}` : "Code ready for verification"}
            </p>
          ) : null}
        </div>
      ) : null}

      <StatusBlock error={error} />
      <FooterActions
        onClose={onClose}
        onConfirm={handleConfirm}
        confirmLabel={
          loading
            ? otpSent
              ? "Deleting account..."
              : "Preparing..."
            : !challengeToken
              ? armed
                ? "Start deletion"
                : "Arm deletion"
              : !otpSent
                ? "Send confirmation code"
                : "Delete account"
        }
              loading={loading}
        destructive
        disabled={loading || (otpSent ? codeInput.trim().length !== 6 || !otpFormatValid : false)}
      />
    </DialogShell>
  );
}

export default function AccountDialogs({
  activeDialog,
  onClose,
  user,
  rememberStatus,
  onUserUpdated,
  onRememberStatusUpdated,
  onAnalysisUploadsCleared,
}: AccountDialogsProps) {
  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!activeDialog) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [activeDialog]);

  if (!user) return null;

  return (
    <>
      <IdentityChangeDialog
        open={activeDialog === "email"}
        onClose={onClose}
        user={user}
        field="email"
        onUpdated={onUserUpdated}
      />
      <IdentityChangeDialog
        open={activeDialog === "username"}
        onClose={onClose}
        user={user}
        field="username"
        onUpdated={onUserUpdated}
      />
      <PasswordChangeDialog open={activeDialog === "password"} onClose={onClose} user={user} />
      <RememberLoginDialog
        open={activeDialog === "remember"}
        onClose={onClose}
        user={user}
        rememberStatus={rememberStatus}
        onStatusUpdated={onRememberStatusUpdated}
      />
      <ConfirmDangerDialog
        open={activeDialog === "clear-uploads"}
        onClose={onClose}
        eyebrow="Saved Runs"
        title="Clear saved runs"
        description="Delete saved analysis runs for this account."
        confirmLabel="Delete saved runs"
        loadingLabel="Deleting runs..."
        onConfirm={async () => {
          await deleteAllAnalyses();
          onAnalysisUploadsCleared("Saved runs cleared.");
        }}
      />
      <DeleteAccountDialog open={activeDialog === "danger"} onClose={onClose} user={user} />
    </>
  );
}