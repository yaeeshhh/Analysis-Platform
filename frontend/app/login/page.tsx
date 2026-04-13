"use client";

import { Suspense, useEffect, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import { useRouter } from "next/navigation";
import {
  checkLoginIdentifier,
  clearRememberedLogin,
  forgotPassword,
  generateRememberToken,
  getValidRememberToken,
  getRememberStatus,
  isLoginChallengeResponse,
  login,
  LoginSuccessResponse,
  rememberLogin,
  sendLoginCode,
  setRememberedLogin,
  verifyLoginCode,
} from "@/lib/auth";
import OtpCodeInput from "@/components/ui/OtpCodeInput";
import {
  clearUserScopedFrontendState,
  formatCountdown,
  maskEmailAddress,
  moveInputCaretToEnd,
} from "@/lib/helpers";
import { setAccessToken } from "@/lib/api";
import { broadcastLoggedInSession } from "@/lib/session";
import Link from "next/link";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";
import AuthShell from "@/components/ui/AuthShell";

function LoginPageContent() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpFormatValid, setOtpFormatValid] = useState(true);
  const [rememberMe, setRememberMe] = useState(false);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotResetLink, setForgotResetLink] = useState<string | null>(null);
  const [invalidPasswordAttempts, setInvalidPasswordAttempts] = useState(0);
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [resolvedLoginEmail, setResolvedLoginEmail] = useState<string | null>(null);
  const maskedForgotEmail = email.trim().includes("@") ? maskEmailAddress(email.trim()) : "your email";

  const normalizedIdentifier = email.trim().toLowerCase();
  const typedIdentifierLooksLikeEmail = normalizedIdentifier.includes("@");
  const rememberToken =
    (resolvedLoginEmail ? getValidRememberToken(resolvedLoginEmail) : null) ||
    getValidRememberToken(normalizedIdentifier);
  const rememberLoginEmail = typedIdentifierLooksLikeEmail
    ? normalizedIdentifier
    : resolvedLoginEmail;
  const canSkipPassword = !!rememberToken && !!rememberLoginEmail && !!normalizedIdentifier;
  const awaitingOtp = !!challengeToken;

  useEffect(() => {
    if (!otpCountdown) return;

    const timer = window.setInterval(() => {
      setOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (!forgotCountdown) return;

    const timer = window.setInterval(() => {
      setForgotCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [forgotCountdown]);

  useEffect(() => {
    if (awaitingOtp) return;

    if (!normalizedIdentifier) {
      setResolvedLoginEmail(null);
      return;
    }

    if (typedIdentifierLooksLikeEmail) {
      setResolvedLoginEmail(normalizedIdentifier);
      return;
    }

    let active = true;
    const timeoutId = window.setTimeout(async () => {
      try {
        const check = await checkLoginIdentifier(normalizedIdentifier);
        if (!active) return;
        setResolvedLoginEmail((check.email || "").trim().toLowerCase() || null);
      } catch {
        if (!active) return;
        setResolvedLoginEmail(null);
      }
    }, 250);

    return () => {
      active = false;
      window.clearTimeout(timeoutId);
    };
  }, [awaitingOtp, normalizedIdentifier, typedIdentifierLooksLikeEmail]);

  const finishAuth = (accessToken: string, email?: string | null) => {
    setAccessToken(accessToken);
    clearUserScopedFrontendState();
    broadcastLoggedInSession(email || null);

    const redirect = searchParams.get("redirect") || "/dashboard";
    const safeRedirect = redirect.startsWith("/") ? redirect : "/dashboard";
    router.push(safeRedirect);
  };

  const syncRememberedLoginAfterSuccess = async (
    response: LoginSuccessResponse,
    usedRememberToken: boolean
  ) => {
    const canonicalEmail = (response.user?.email || email).trim().toLowerCase();
    if (!canonicalEmail) return;

    if (usedRememberToken) {
      if (response.remember_token) {
        setRememberedLogin(canonicalEmail, response.remember_token, email, {
          enabled: true,
          preserveExistingExpiry: true,
        });
      }
      return;
    }

    if (rememberMe) {
      if (response.remember_token) {
        setRememberedLogin(canonicalEmail, response.remember_token, email, {
          enabled: true,
        });
      }
      return;
    }

    if (getRememberStatus(canonicalEmail).available) {
      return;
    }

    const seededToken = await generateRememberToken(canonicalEmail);
    if (seededToken) {
      setRememberedLogin(canonicalEmail, seededToken, email, {
        enabled: false,
      });
    }
  };

  const handleLogin = async () => {
    setLoading(true);
    setError("");
    setForgotMessage("");

    try {
      clearUserScopedFrontendState();

      const response = canSkipPassword && rememberToken && rememberLoginEmail
        ? await rememberLogin(rememberLoginEmail, rememberToken)
        : await login(email, password, rememberMe);

      if (!canSkipPassword && isLoginChallengeResponse(response)) {
        setChallengeToken(response.challenge_token);
        setOtpEmail(response.email);
        setOtpCode("");
        setOtpSent(false);
        setOtpCountdown(0);
        setOtpMessage("");
        setOtpFormatValid(true);
        setInvalidPasswordAttempts(0);
        setPassword("");
        return;
      }

      const successResponse = response as LoginSuccessResponse;
      setAccessToken(successResponse.access_token);
      await syncRememberedLoginAfterSuccess(successResponse, canSkipPassword);
      finishAuth(successResponse.access_token, successResponse.user?.email || email);

      setInvalidPasswordAttempts(0);
    } catch (err: unknown) {
      if (canSkipPassword) {
        if (rememberLoginEmail) {
          clearRememberedLogin(rememberLoginEmail);
        }
        if (normalizedIdentifier && normalizedIdentifier !== rememberLoginEmail) {
          clearRememberedLogin(normalizedIdentifier);
        }
      }
      const errorMessage =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      if (
        !canSkipPassword &&
        /invalid credentials|incorrect password|incorrect/i.test(errorMessage)
      ) {
        setInvalidPasswordAttempts((prev) => prev + 1);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!challengeToken || !otpCode.trim() || !otpSent || !otpFormatValid) return;

    setLoading(true);
    setError("");
    setOtpMessage("");

    try {
      const response = await verifyLoginCode(challengeToken, otpCode.trim());
      setAccessToken(response.access_token);
      await syncRememberedLoginAfterSuccess(response, false);
      finishAuth(response.access_token, response.user?.email || email);

      setChallengeToken(null);
      setOtpCode("");
      setOtpEmail("");
      setOtpFormatValid(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!challengeToken) return;

    setLoading(true);
    setError("");

    try {
      const response = await sendLoginCode(challengeToken);
      setOtpEmail(response.email);
      setOtpSent(true);
      setOtpCountdown(response.resend_available_in_seconds);
      setOtpMessage("Verification code sent.");
      setOtpFormatValid(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to send verification code."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleForgotPassword = async () => {
    setError("");
    setForgotMessage("");
    setForgotResetLink(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter your email first to receive a reset link.");
      return;
    }

    try {
      setForgotLoading(true);
      const currentPath = `${pathname}${searchParams.toString() ? `?${searchParams.toString()}` : ""}`;
      const result = await forgotPassword(normalizedEmail, currentPath);
      setForgotCountdown(30);
      setForgotResetLink(result.reset_link || null);
      setForgotMessage(`Reset link sent to ${maskEmailAddress(normalizedEmail)}. Open it to choose a new password.`);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Unable to request password reset."
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && !loading) {
      if (awaitingOtp) {
        if (!otpSent) {
          handleSendCode();
          return;
        }
        if (!otpFormatValid) {
          return;
        }
        handleVerifyCode();
        return;
      }
      handleLogin();
    }
  };

  return (
    <AuthShell
      eyebrow="Account Access"
      title={awaitingOtp ? "Verify your login code" : "Sign in to Analysis Studio"}
      description="Access saved analyses, experiment history, and account tools behind authenticated access."
    >
      <div>

        <div className="space-y-4">
          {!awaitingOtp && (
          <div>
            <label htmlFor="email" className="block text-sm font-medium mb-2">
              Email
            </label>
            <input
              id="email"
              type="email"
              enterKeyHint="done"
              placeholder="you@example.com"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
              onKeyPress={handleKeyPress}
              disabled={loading}
              className="w-full p-3 rounded-lg bg-[#111827] border border-[#a78bfa]/15 focus:outline-none focus:border-blue-500 disabled:opacity-50"
            />
          </div>
          )}

          {!awaitingOtp && !canSkipPassword && (
          <div>
            <label htmlFor="password" className="block text-sm font-medium mb-2">
              Password
            </label>
            <div className="relative">
              <input
                id="password"
                type={showPassword ? "text" : "password"}
                enterKeyHint="done"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                onKeyPress={handleKeyPress}
                disabled={loading}
                className="w-full p-3 pr-11 rounded-lg bg-[#111827] border border-[#a78bfa]/15 focus:outline-none focus:border-blue-500 disabled:opacity-50"
              />
              <PasswordToggleButton shown={showPassword} onToggle={() => setShowPassword((prev) => !prev)} />
            </div>
          </div>
          )}

          {!awaitingOtp && canSkipPassword && (
            <p className="text-sm text-white/70">
              Remembered on this device. Password skipped because this email has a valid 30-day remember session.
            </p>
          )}

          {!awaitingOtp && !canSkipPassword && (
            <label className="mt-0.5 inline-flex w-fit cursor-pointer items-center gap-1.5 pl-0.5 text-[11px] text-white/60">
              <input
                type="checkbox"
                checked={rememberMe}
                onChange={(e) => setRememberMe(e.target.checked)}
                disabled={loading}
                className="h-3.5 w-3.5 cursor-pointer align-middle"
              />
              Remember me
            </label>
          )}

          {awaitingOtp && (
            <>
              {otpMessage && (
                <div className="bg-emerald-900/25 border border-emerald-700 text-emerald-200 text-sm p-3 rounded-lg">
                  {otpMessage}
                </div>
              )}
              <div className="rounded-lg border border-white/10 bg-white/5 p-3 text-sm text-white/75">
                {otpSent
                  ? `Enter the 6-digit code sent to ${maskEmailAddress(otpEmail || email.trim())}.`
                  : `Click below to send a 6-digit code to ${maskEmailAddress(otpEmail || email.trim())}.`}
              </div>
              {otpSent && (
              <div>
                <label htmlFor="otpCode" className="block text-sm font-medium mb-2">
                  Verification code
                </label>
                <OtpCodeInput
                  value={otpCode}
                  onChange={setOtpCode}
                  onValidityChange={setOtpFormatValid}
                  onEnter={() => {
                    if (loading) return;
                    if (!otpSent) { handleSendCode(); return; }
                    if (otpFormatValid) handleVerifyCode();
                  }}
                  disabled={loading}
                  idPrefix="login-otp"
                />
              </div>
              )}
              <div className="flex items-center justify-between gap-3 text-sm text-white/65">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || otpCountdown > 0}
                  className="inline-flex items-center gap-2 underline decoration-white/25 underline-offset-4 disabled:no-underline disabled:opacity-50"
                >
                  {loading ? (
                    <>
                      <span className="button-live-loader" aria-hidden="true" />
                      Sending...
                    </>
                  ) : otpSent ? "Resend code" : "Send code"}
                </button>
                {otpSent && (
                  <span>
                    {otpCountdown > 0
                      ? `Resend available in ${formatCountdown(otpCountdown)}`
                      : "You can resend the code now."}
                  </span>
                )}
              </div>
            </>
          )}

          {!awaitingOtp && invalidPasswordAttempts >= 3 && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotLoading || loading || forgotCountdown > 0}
                className="inline-flex items-center gap-2 text-left text-sm text-white/75 underline decoration-white/35 underline-offset-4 hover:text-white disabled:no-underline disabled:opacity-50"
              >
                {forgotLoading
                  ? (
                    <>
                      <span className="button-live-loader" aria-hidden="true" />
                      {`Sending reset link to ${maskedForgotEmail}...`}
                    </>
                  )
                  : forgotCountdown > 0
                    ? "Reset link sent"
                    : "Forgot password?"}
              </button>
              {forgotCountdown > 0 && (
                <p className="text-xs text-white/55">
                  You can request another reset link in {formatCountdown(forgotCountdown)}.
                </p>
              )}
            </div>
          )}

          {forgotMessage && (
            <div className="bg-emerald-900/25 border border-emerald-700 text-emerald-200 text-sm p-3 rounded-lg">
              <p>{forgotMessage}</p>
              {forgotResetLink && (
                <a href={forgotResetLink} className="mt-2 inline-flex underline underline-offset-4">
                  Open reset link
                </a>
              )}
            </div>
          )}

          {error && (
            <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-200 text-sm p-3 rounded-lg">
              {error}
            </div>
          )}

          <button
            onClick={awaitingOtp ? handleVerifyCode : handleLogin}
            disabled={
              loading ||
              (!awaitingOtp && (!email || (!canSkipPassword && !password))) ||
              (awaitingOtp && (!otpSent || otpCode.trim().length !== 6 || !otpFormatValid))
            }
            className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] p-3 font-medium transition hover:from-[#8b5cf6] hover:to-[#7c3aed] disabled:bg-gray-600 disabled:opacity-50"
          >
            {loading ? (
              <>
                <span className="button-live-loader" aria-hidden="true" />
                {awaitingOtp ? "Verifying..." : "Logging in..."}
              </>
            ) : awaitingOtp
              ? "Verify code"
              : canSkipPassword
              ? "Continue"
              : "Login"}
          </button>

          {awaitingOtp && (
            <button
              type="button"
              onClick={() => {
                setChallengeToken(null);
                setOtpCode("");
                setOtpEmail("");
                setOtpCountdown(0);
                setOtpSent(false);
                setOtpMessage("");
                setOtpFormatValid(true);
                setError("");
              }}
              disabled={loading}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 font-medium transition hover:bg-white/10 disabled:opacity-50"
            >
              {loading ? (
                <>
                  <span className="button-live-loader" aria-hidden="true" />
                  Back
                </>
              ) : "Back"}
            </button>
          )}
        </div>

        <p className="text-sm text-center mt-6 text-gray-400">
          Don&apos;t have an account?{" "}
          <Link href="/signup" className="text-blue-400 hover:text-blue-300">
            Sign up here
          </Link>
        </p>
      </div>
    </AuthShell>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={null}>
      <LoginPageContent />
    </Suspense>
  );
}
