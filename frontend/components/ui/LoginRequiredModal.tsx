"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";
import {
  checkSignupAvailability,
  checkLoginIdentifier,
  clearRememberedLogin,
  forgotPassword,
  generateRememberToken,
  getValidRememberToken,
  getRememberStatus,
  isLoginChallengeResponse,
  login,
  rememberLogin,
  sendLoginCode,
  sendSignupCode,
  setRememberedLogin,
  startSignup,
  verifySignupCode,
  verifyLoginCode,
} from "@/lib/auth";
import {
  getPasswordStrengthState,
  validatePasswordPolicy,
} from "@/lib/passwordPolicy";
import { getEmailValidationError, isSignupEmailValid } from "@/lib/emailValidation";
import OtpCodeInput from "@/components/ui/OtpCodeInput";
import { clearUserScopedFrontendState, formatCountdown, maskEmailAddress, moveInputCaretToEnd } from "@/lib/helpers";
import { setAccessToken } from "@/lib/api";
import { setActiveAccountEmail, shouldSuppressDefaultLoginModal } from "@/lib/session";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";
import PasswordStrengthBar from "@/components/ui/PasswordStrengthBar";

type FieldAvailability = "idle" | "invalid" | "checking" | "available" | "taken";

type LoginRequiredModalProps = {
  open: boolean;
  title?: string;
  message?: string;
  loginHref?: string;
  bypassFlowSuppression?: boolean;
  onDismiss?: () => void;
  onLoginSuccess?: () => void | Promise<void>;
};

function resolvePostLoginPath(loginHref: string): string | null {
  if (!loginHref.startsWith("/")) return null;

  if (loginHref.startsWith("/login")) {
    const query = loginHref.split("?")[1] || "";
    const params = new URLSearchParams(query);
    const redirect = params.get("redirect");
    if (redirect && redirect.startsWith("/")) {
      return redirect;
    }
    return null;
  }

  return loginHref;
}

export default function LoginRequiredModal({
  open,
  title = "Login to continue",
  message = "You need to be logged in to access this page.",
  loginHref = "/login",
  bypassFlowSuppression = false,
  onDismiss,
  onLoginSuccess,
}: LoginRequiredModalProps) {
  const router = useRouter();
  const postLoginPath = useMemo(() => resolvePostLoginPath(loginHref), [loginHref]);
  const suppressedByResetFlow =
    !bypassFlowSuppression && shouldSuppressDefaultLoginModal();

  useEffect(() => {
    if (typeof document === "undefined") return;
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    return () => {
      document.body.style.overflow = previousOverflow;
    };
  }, [open]);

  const [mode, setMode] = useState<"login" | "signup">("login");

  // I keep the login flow state together so it is easier to reset step by step.
  const [identifier, setIdentifier] = useState("");
  const [resolvedLoginEmail, setResolvedLoginEmail] = useState<string | null>(null);
  const [loginStep, setLoginStep] = useState<"identifier" | "password" | "otp">("identifier");
  const [rememberMe, setRememberMe] = useState(false);
  const [invalidPasswordAttempts, setInvalidPasswordAttempts] = useState(0);
  const [forgotLoading, setForgotLoading] = useState(false);
  const [forgotCountdown, setForgotCountdown] = useState(0);
  const [forgotMessage, setForgotMessage] = useState("");
  const [forgotResetLink, setForgotResetLink] = useState<string | null>(null);

  // These form fields get reused by both auth modes.
  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  // This block is just for the login verification-code step.
  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpFormatValid, setOtpFormatValid] = useState(true);

  // This block is just for the signup verification-code step.
  const [signupChallengeToken, setSignupChallengeToken] = useState<string | null>(null);
  const [signupOtpCode, setSignupOtpCode] = useState("");
  const [signupOtpEmail, setSignupOtpEmail] = useState("");
  const [signupOtpSent, setSignupOtpSent] = useState(false);
  const [signupOtpCountdown, setSignupOtpCountdown] = useState(0);
  const [signupOtpMessage, setSignupOtpMessage] = useState("");
  const [signupOtpFormatValid, setSignupOtpFormatValid] = useState(true);
  const [signupVerifying, setSignupVerifying] = useState(false);

  // The simple show/hide and focus toggles live here.
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const [emailAvailability, setEmailAvailability] = useState<FieldAvailability>("idle");
  const [usernameAvailability, setUsernameAvailability] = useState<FieldAvailability>("idle");

  const passwordsMatch = password === confirmPassword;
  const passwordStrength = getPasswordStrengthState(password);
  const showPasswordStrengthBar = mode === "signup" && password.length > 0;
  const showPasswordAdequacyMessage =
    mode === "signup" &&
    password.length > 0 &&
    (passwordStrength.level === "weak" || passwordFocused);
  const showPasswordMatchStatus =
    mode === "signup" &&
    confirmPassword.length > 0 &&
    password.length > 0;

  const rawEmailInput = email;
  const rawUsernameInput = username;
  const trimmedEmail = rawEmailInput.trim().toLowerCase();
  const trimmedUsername = rawUsernameInput.trim().toLowerCase();

  const emailHasWhitespace = /\s/.test(rawEmailInput);
  const emailLooksValid = !emailHasWhitespace && isSignupEmailValid(rawEmailInput);

  const usernameHasSpace = /\s/.test(rawUsernameInput);
  const usernameLooksValid = trimmedUsername.length >= 3 && !usernameHasSpace;

  const emailFieldIsAvailable = emailAvailability === "available";
  const usernameFieldIsAvailable = usernameAvailability === "available";

  const emailFieldStyle = emailFieldIsAvailable
    ? {
        borderColor: "#34d399",
        boxShadow: "0 0 0 1px rgba(16, 185, 129, 0.35)",
        backgroundColor: "transparent",
      }
    : undefined;

  const usernameFieldStyle = usernameFieldIsAvailable
    ? {
        borderColor: "#34d399",
        boxShadow: "0 0 0 1px rgba(16, 185, 129, 0.35)",
        backgroundColor: "transparent",
      }
    : undefined;

  const usernameErrorMessage =
    usernameAvailability === "invalid"
      ? usernameHasSpace
        ? "Username cannot contain spaces."
        : "Username must be at least 3 characters."
      : usernameAvailability === "taken"
      ? "Username exists."
      : "";

  const emailErrorMessage =
    emailAvailability === "invalid"
      ? getEmailValidationError(rawEmailInput)
      : emailAvailability === "taken"
      ? "Email already exists."
      : "";

  const emailStatusMessage =
    rawEmailInput.trim().length === 0
      ? ""
      : emailAvailability === "checking"
      ? "Checking email availability..."
      : emailAvailability === "available"
      ? "Email available."
      : emailErrorMessage;

  const usernameStatusMessage =
    rawUsernameInput.trim().length === 0
      ? ""
      : usernameAvailability === "checking"
      ? "Checking username availability..."
      : usernameAvailability === "available"
      ? "Username available."
      : usernameErrorMessage;

  const signupReady =
    mode === "signup" &&
    !!trimmedUsername &&
    !!trimmedEmail &&
    !!password &&
    !!confirmPassword &&
    passwordsMatch &&
    !validatePasswordPolicy(password) &&
    emailAvailability === "available" &&
    usernameAvailability === "available";

  const signupAwaitingOtp = !!signupChallengeToken;

  const resetModalState = () => {
    setMode("login");

    setIdentifier("");
    setResolvedLoginEmail(null);
    setLoginStep("identifier");
    setRememberMe(false);
    setInvalidPasswordAttempts(0);
    setForgotLoading(false);
    setForgotCountdown(0);
    setForgotMessage("");
    setForgotResetLink(null);

    setEmail("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");

    setOtpCode("");
    setOtpEmail("");
    setChallengeToken(null);
    setOtpCountdown(0);
    setOtpSent(false);
    setOtpMessage("");
    setOtpFormatValid(true);

    setSignupChallengeToken(null);
    setSignupOtpCode("");
    setSignupOtpEmail("");
    setSignupOtpSent(false);
    setSignupOtpCountdown(0);
    setSignupOtpMessage("");
    setSignupOtpFormatValid(true);
    setSignupVerifying(false);

    setShowPassword(false);
    setShowConfirmPassword(false);
    setPasswordFocused(false);
    setUsernameFocused(false);
    setEmailFocused(false);

    setLoading(false);
    setError("");
    setEmailAvailability("idle");
    setUsernameAvailability("idle");
  };

  const dismissModal = () => {
    resetModalState();
    onDismiss?.();
  };

  useEffect(() => {
    if (!open) {
      resetModalState();
    }
  }, [open]);

  useEffect(() => {
    if (!otpCountdown) return;
    const timer = window.setInterval(() => {
      setOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  useEffect(() => {
    if (!signupOtpCountdown) return;
    const timer = window.setInterval(() => {
      setSignupOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [signupOtpCountdown]);

  useEffect(() => {
    if (!forgotCountdown) return;
    const timer = window.setInterval(() => {
      setForgotCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [forgotCountdown]);

  useEffect(() => {
    if (mode !== "signup" || signupAwaitingOtp) return;

    const hasUsername = trimmedUsername.length > 0;
    if (!hasUsername) {
      setUsernameAvailability("idle");
      return;
    }

    if (!usernameLooksValid) {
      setUsernameAvailability("invalid");
      return;
    }

    setUsernameAvailability("checking");

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const availability = await checkSignupAvailability(undefined, trimmedUsername);
        if (!active) return;
        setUsernameAvailability(availability.username_exists ? "taken" : "available");
      } catch {
        if (!active) return;
        setUsernameAvailability("idle");
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, signupAwaitingOtp, trimmedUsername, usernameLooksValid]);

  useEffect(() => {
    if (mode !== "signup" || signupAwaitingOtp) return;

    const hasEmail = trimmedEmail.length > 0;
    if (!hasEmail) {
      setEmailAvailability("idle");
      return;
    }

    if (!emailLooksValid) {
      setEmailAvailability("invalid");
      return;
    }

    setEmailAvailability("checking");

    let active = true;
    const timer = window.setTimeout(async () => {
      try {
        const availability = await checkSignupAvailability(trimmedEmail, undefined);
        if (!active) return;
        setEmailAvailability(availability.email_exists ? "taken" : "available");
      } catch {
        if (!active) return;
        setEmailAvailability("idle");
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [mode, signupAwaitingOtp, trimmedEmail, emailLooksValid]);

  const finishAuth = async (emailValue?: string | null) => {
    clearUserScopedFrontendState();
    setActiveAccountEmail(emailValue || null);

    if (typeof window !== "undefined") {
      window.dispatchEvent(new CustomEvent("auth:logged-in"));
    }

    await onLoginSuccess?.();
    onDismiss?.();

    if (postLoginPath) {
      router.replace(postLoginPath);
    }
  };

  const syncRememberedLoginAfterSuccess = async (
    response: { user: { email: string }; remember_token?: string | null },
    usedRememberToken: boolean,
    identifierValue: string,
    rememberRequested: boolean
  ) => {
    const canonicalEmail = (response.user?.email || identifierValue).trim().toLowerCase();
    if (!canonicalEmail) return;

    if (usedRememberToken) {
      if (response.remember_token) {
        setRememberedLogin(canonicalEmail, response.remember_token, identifierValue, {
          enabled: true,
          preserveExistingExpiry: true,
        });
      }
      return;
    }

    if (rememberRequested) {
      if (response.remember_token) {
        setRememberedLogin(canonicalEmail, response.remember_token, identifierValue, {
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
      setRememberedLogin(canonicalEmail, seededToken, identifierValue, {
        enabled: false,
      });
    }
  };

  const handleIdentifierContinue = async () => {
    if (!identifier.trim() || loading) return;

    try {
      setLoading(true);
      setError("");
      setForgotMessage("");
      setForgotResetLink(null);
      setInvalidPasswordAttempts(0);

      const check = await checkLoginIdentifier(identifier.trim());
      if (!check.exists) {
        setError("Account not found.");
        return;
      }

      const loginEmail = (check.email || "").trim().toLowerCase();
      setResolvedLoginEmail(loginEmail || null);

      const normalizedIdentifier = identifier.trim().toLowerCase();
      const rememberToken =
        (loginEmail ? getValidRememberToken(loginEmail) : null) ||
        getValidRememberToken(normalizedIdentifier);

      if (rememberToken && loginEmail) {
        try {
          const response = await rememberLogin(loginEmail, rememberToken);
          setAccessToken(response.access_token);
          await syncRememberedLoginAfterSuccess(response, true, identifier, true);
          if (normalizedIdentifier && normalizedIdentifier !== loginEmail) {
            clearRememberedLogin(normalizedIdentifier);
          }
          await finishAuth(response.user?.email || loginEmail);
          return;
        } catch {
          clearRememberedLogin(loginEmail);
          if (normalizedIdentifier && normalizedIdentifier !== loginEmail) {
            clearRememberedLogin(normalizedIdentifier);
          }
        }
      }

      setPassword("");
      setShowPassword(false);
      setLoginStep("password");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Unable to continue login.");
    } finally {
      setLoading(false);
    }
  };

  const handlePasswordLogin = async () => {
    if (!identifier.trim() || !password || loading) return;

    try {
      setLoading(true);
      setError("");
      setForgotMessage("");
      setForgotResetLink(null);

      const response = await login(identifier.trim(), password, rememberMe);
      if (isLoginChallengeResponse(response)) {
        setChallengeToken(response.challenge_token);
        setOtpEmail(response.email);
        setOtpCode("");
        setOtpCountdown(0);
        setOtpSent(false);
        setOtpMessage("");
        setOtpFormatValid(true);
        setLoginStep("otp");
        setPassword("");
        return;
      }

      setAccessToken(response.access_token);
      await syncRememberedLoginAfterSuccess(response, false, identifier, rememberMe);

      setInvalidPasswordAttempts(0);
      await finishAuth(response.user?.email || identifier.trim());
    } catch (err: unknown) {
      const errorMessage =
        err instanceof Error ? err.message : "Login failed. Please try again.";
      if (/invalid credentials|incorrect password|incorrect/i.test(errorMessage)) {
        setInvalidPasswordAttempts((prev) => prev + 1);
      }
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleOtpVerification = async () => {
    if (!challengeToken || !otpCode.trim() || !otpSent || !otpFormatValid || loading) return;

    try {
      setLoading(true);
      setError("");

      const response = await verifyLoginCode(challengeToken, otpCode.trim());
      setAccessToken(response.access_token);
      await syncRememberedLoginAfterSuccess(response, false, identifier, rememberMe);

      setInvalidPasswordAttempts(0);
      setOtpFormatValid(true);
      await finishAuth(response.user?.email || identifier.trim());
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Verification failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!challengeToken || loading) return;

    try {
      setLoading(true);
      setError("");
      setOtpMessage("");

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

    const normalizedEmail =
      resolvedLoginEmail ||
      (identifier.trim().includes("@") ? identifier.trim().toLowerCase() : "");

    if (!normalizedEmail || !normalizedEmail.includes("@")) {
      setError("Enter your email first to receive a reset link.");
      return;
    }

    try {
      setForgotLoading(true);
      const currentPath =
        typeof window !== "undefined"
          ? `${window.location.pathname}${window.location.search}`
          : "/login";
      const result = await forgotPassword(normalizedEmail, currentPath);
      setForgotCountdown(30);
      setForgotMessage(`Current action: open the reset link sent to ${maskEmailAddress(normalizedEmail)} and choose a new password.`);
      setForgotResetLink(result.reset_link || null);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to request password reset."
      );
    } finally {
      setForgotLoading(false);
    }
  };

  const handleSignup = async () => {
    if (!signupReady || loading) return;

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      setError(policyError);
      return;
    }

    try {
      setLoading(true);
      setError("");

      const resp = await startSignup(trimmedEmail, trimmedUsername, password);

      setSignupChallengeToken(resp.challenge_token);
      setSignupOtpEmail(resp.email || trimmedEmail);
      setSignupOtpCode("");
      setSignupOtpSent(false);
      setSignupOtpCountdown(0);
      setSignupOtpMessage("");
      setSignupOtpFormatValid(true);
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Signup failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  const handleSignupSendCode = async () => {
    if (!signupChallengeToken || loading) return;

    try {
      setLoading(true);
      setError("");
      setSignupOtpMessage("");

      const response = await sendSignupCode(signupChallengeToken);
      setSignupOtpEmail(response.email);
      setSignupOtpSent(true);
      setSignupOtpCountdown(response.resend_available_in_seconds);
      setSignupOtpMessage("Verification code sent.");
      setSignupOtpFormatValid(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to send verification code."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSignupVerifyCode = async () => {
    if (
      !signupChallengeToken ||
      !signupOtpSent ||
      !signupOtpCode.trim() ||
      !signupOtpFormatValid ||
      signupVerifying
    ) {
      return;
    }

    setSignupVerifying(true);
    setError("");

    try {
      const response = await verifySignupCode(
        signupChallengeToken,
        signupOtpCode.trim()
      );

      setAccessToken(response.access_token);

      if (response.remember_token) {
        setRememberedLogin(
          response.user?.email || trimmedEmail,
          response.remember_token,
          response.user?.email || trimmedEmail
        );
      }

      setSignupChallengeToken(null);
      setSignupOtpCode("");
      setSignupOtpEmail("");
      setSignupOtpSent(false);
      setSignupOtpCountdown(0);
      setSignupOtpMessage("");
      setSignupOtpFormatValid(true);

      await finishAuth(response.user?.email || trimmedEmail);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Verification failed. Please try again."
      );
    } finally {
      setSignupVerifying(false);
    }
  };

  const switchMode = (nextMode: "login" | "signup") => {
    setMode(nextMode);

    setIdentifier("");
    setResolvedLoginEmail(null);
    setLoginStep("identifier");

    setEmail("");
    setUsername("");
    setPassword("");
    setConfirmPassword("");

    setOtpCode("");
    setOtpEmail("");
    setChallengeToken(null);
    setOtpCountdown(0);
    setOtpSent(false);
    setOtpMessage("");
    setOtpFormatValid(true);

    setSignupChallengeToken(null);
    setSignupOtpCode("");
    setSignupOtpEmail("");
    setSignupOtpSent(false);
    setSignupOtpCountdown(0);
    setSignupOtpMessage("");
    setSignupOtpFormatValid(true);
    setSignupVerifying(false);

    setRememberMe(false);
    setShowPassword(false);
    setShowConfirmPassword(false);
    setPasswordFocused(false);
    setUsernameFocused(false);
    setEmailFocused(false);
    setInvalidPasswordAttempts(0);
    setForgotCountdown(0);
    setForgotMessage("");
    setForgotResetLink(null);
    setError("");
    setEmailAvailability("idle");
    setUsernameAvailability("idle");
  };

  const handleModalEnter = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || loading || signupVerifying) return;

    if (mode === "signup") {
      if (signupAwaitingOtp) {
        if (!signupOtpSent) {
          handleSignupSendCode();
          return;
        }
        if (signupOtpFormatValid) {
          handleSignupVerifyCode();
        }
        return;
      }
      handleSignup();
      return;
    }

    if (loginStep === "identifier") {
      handleIdentifierContinue();
      return;
    }
    if (loginStep === "password") {
      handlePasswordLogin();
      return;
    }
  };

  if (!open || suppressedByResetFlow || typeof document === "undefined") return null;

  const modal = (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/50 px-4 backdrop-blur-[2px]"
      onClick={dismissModal}
    >
      <div
        className="w-full max-w-md rounded-xl border border-white/10 bg-[#15151a] p-6 text-white"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 className="text-2xl font-semibold tracking-tight text-white">{title}</h2>
        <p className="mt-3 text-sm leading-7 text-white/65">{message}</p>

        <div className="mt-4 inline-flex rounded-full border border-white/10 bg-white/5 p-1">
          {mode === "login" && loginStep !== "identifier" ? (
            <span
              aria-current="page"
              className="rounded-full bg-white px-4 py-1.5 text-sm font-medium text-black"
            >
              Log in
            </span>
          ) : (
            <button
              type="button"
              onClick={() => switchMode("login")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "login" ? "bg-white text-black" : "text-white/75"
              }`}
            >
              Log in
            </button>
          )}
          {!(mode === "login" && loginStep !== "identifier") && (
            <button
              type="button"
              onClick={() => switchMode("signup")}
              className={`rounded-full px-4 py-1.5 text-sm font-medium transition ${
                mode === "signup" ? "bg-white text-black" : "text-white/75"
              }`}
            >
              Sign up
            </button>
          )}
        </div>

        <div className="mt-5 space-y-3">
          {mode === "signup" && !signupAwaitingOtp && (
            <div>
              <input
                type="text"
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                onFocus={(e) => {
                  setUsernameFocused(true);
                  moveInputCaretToEnd(e.currentTarget);
                }}
                onBlur={() => setUsernameFocused(false)}
                onKeyDown={handleModalEnter}
                placeholder="Username"
                disabled={loading}
                className={`w-full rounded-[14px] bg-[#111116] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60 ${
                  usernameFieldIsAvailable
                    ? "border border-emerald-400 ring-1 ring-emerald-500/30"
                    : "border border-white/10"
                }`}
                style={usernameFieldStyle}
              />
              {usernameStatusMessage &&
                (usernameFocused || rawUsernameInput.trim().length > 0) && (
                  <p
                    className={`mt-1 text-xs ${
                      usernameAvailability === "available"
                        ? "text-emerald-300"
                        : usernameErrorMessage
                        ? "text-red-300"
                        : "text-white/60"
                    }`}
                  >
                    {usernameStatusMessage}
                  </p>
                )}
            </div>
          )}

          {mode === "signup" && !signupAwaitingOtp && (
            <div>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                onFocus={(e) => {
                  setEmailFocused(true);
                  moveInputCaretToEnd(e.currentTarget);
                }}
                onBlur={() => setEmailFocused(false)}
                onKeyDown={handleModalEnter}
                placeholder="Email"
                disabled={loading}
                className={`w-full rounded-[14px] bg-[#111116] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60 ${
                  emailFieldIsAvailable
                    ? "border border-emerald-400 ring-1 ring-emerald-500/30"
                    : "border border-white/10"
                }`}
                style={emailFieldStyle}
              />
              {emailStatusMessage &&
                (emailFocused || rawEmailInput.trim().length > 0) && (
                  <p
                    className={`mt-1 text-xs ${
                      emailAvailability === "available"
                        ? "text-emerald-300"
                        : emailErrorMessage
                        ? "text-red-300"
                        : "text-white/60"
                    }`}
                  >
                    {emailStatusMessage}
                  </p>
                )}
            </div>
          )}

          {mode === "signup" && !signupAwaitingOtp && (
            <div>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => {
                    setPasswordFocused(true);
                    moveInputCaretToEnd(e.currentTarget);
                  }}
                  onBlur={() => setPasswordFocused(false)}
                  onKeyDown={handleModalEnter}
                  placeholder="Password"
                  disabled={loading}
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
                barMarginTop
              />
            </div>
          )}

          {mode === "signup" && !signupAwaitingOtp && (
            <div>
              <div className="relative">
                <input
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                  onKeyDown={handleModalEnter}
                  placeholder="Confirm password"
                  disabled={loading}
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
                  className={`mt-1 text-xs ${
                    passwordsMatch ? "text-emerald-300" : "text-red-300"
                  }`}
                >
                  {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                </p>
              )}
            </div>
          )}

          {mode === "signup" && signupAwaitingOtp && (
            <>
              {signupOtpMessage && (
                <p className="rounded-[12px] border border-[#224c37] bg-[#13241c] px-3 py-2 text-xs text-[#6ee7a8]">
                  {signupOtpMessage}
                </p>
              )}

              <p className="text-xs leading-6 text-white/65">
                {signupOtpSent
                  ? `Enter the 6-digit code sent to ${maskEmailAddress(signupOtpEmail || trimmedEmail)}.`
                  : `Click below to send a 6-digit code to ${maskEmailAddress(signupOtpEmail || trimmedEmail)}.`}
              </p>

              {signupOtpSent && (
                <OtpCodeInput
                  value={signupOtpCode}
                  onChange={setSignupOtpCode}
                  onValidityChange={setSignupOtpFormatValid}
                  onEnter={() => {
                    if (loading || signupVerifying) return;
                    if (!signupOtpSent) {
                      handleSignupSendCode();
                      return;
                    }
                    if (signupOtpFormatValid) {
                      handleSignupVerifyCode();
                    }
                  }}
                  disabled={loading || signupVerifying}
                  idPrefix="modal-signup-otp"
                />
              )}

              <div className="flex items-center justify-between gap-3 text-xs text-white/65">
                <button
                  type="button"
                  onClick={handleSignupSendCode}
                  disabled={loading || signupVerifying || signupOtpCountdown > 0}
                  className="underline decoration-white/25 underline-offset-4 disabled:no-underline disabled:opacity-50"
                >
                  {signupOtpSent ? "Resend code" : "Send code"}
                </button>
                {signupOtpSent && (
                  <span>
                    {signupOtpCountdown > 0
                      ? `Resend available in ${formatCountdown(signupOtpCountdown)}`
                      : "You can resend the code now."}
                  </span>
                )}
              </div>
            </>
          )}

          {mode === "login" && loginStep === "identifier" && (
            <>
              <input
                type="text"
                value={identifier}
                onChange={(e) => setIdentifier(e.target.value)}
                onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                onKeyDown={handleModalEnter}
                placeholder="Email or username"
                disabled={loading}
                className="w-full rounded-[14px] border border-white/10 bg-[#111116] px-3 py-2.5 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
              />

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
            </>
          )}

          {mode === "login" && loginStep === "password" && (
            <>
              <p className="text-xs text-white/65">{identifier.trim()}</p>
              <div className="relative">
                <input
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                  onKeyDown={handleModalEnter}
                  placeholder="Password"
                  disabled={loading}
                  className="w-full rounded-[14px] border border-white/10 bg-[#111116] px-3 py-2.5 pr-14 text-sm text-white outline-none placeholder:text-white/35 disabled:opacity-60"
                />
                <PasswordToggleButton
                  shown={showPassword}
                  onToggle={() => setShowPassword((prev) => !prev)}
                  variant="modal"
                />
              </div>
            </>
          )}

          {mode === "login" && loginStep === "otp" && (
            <>
              {otpMessage && (
                <p className="rounded-[12px] border border-[#224c37] bg-[#13241c] px-3 py-2 text-xs text-[#6ee7a8]">
                  {otpMessage}
                </p>
              )}
              <p className="text-xs leading-6 text-white/65">
                {otpSent
                  ? `Enter the 6-digit code sent to ${maskEmailAddress(
                      otpEmail || resolvedLoginEmail || identifier.trim()
                    )}.`
                  : `Click below to send a 6-digit code to ${maskEmailAddress(
                      otpEmail || resolvedLoginEmail || identifier.trim()
                    )}.`}
              </p>
              {otpSent && (
                <OtpCodeInput
                  value={otpCode}
                  onChange={setOtpCode}
                  onValidityChange={setOtpFormatValid}
                  onEnter={() => {
                    if (loading) return;
                    if (!otpSent) {
                      handleSendCode();
                      return;
                    }
                    if (otpFormatValid) handleOtpVerification();
                  }}
                  disabled={loading}
                  idPrefix="modal-otp"
                />
              )}
              <div className="flex items-center justify-between gap-3 text-xs text-white/65">
                <button
                  type="button"
                  onClick={handleSendCode}
                  disabled={loading || otpCountdown > 0}
                  className="underline decoration-white/25 underline-offset-4 disabled:no-underline disabled:opacity-50"
                >
                  {otpSent ? "Resend code" : "Send code"}
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

          {mode === "login" && loginStep === "password" && invalidPasswordAttempts >= 3 && (
            <div className="space-y-1">
              <button
                type="button"
                onClick={handleForgotPassword}
                disabled={forgotLoading || loading || forgotCountdown > 0}
                className="text-left text-sm text-white/75 underline decoration-white/35 underline-offset-4 hover:text-white disabled:no-underline disabled:opacity-50"
              >
                {forgotLoading
                  ? `Sending reset link to ${maskEmailAddress(resolvedLoginEmail || (identifier.trim().includes("@") ? identifier.trim() : "your email"))}...`
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
            <p className="rounded-[12px] border border-[#224c37] bg-[#13241c] px-3 py-2 text-xs text-[#6ee7a8]">
              {forgotMessage}
              {forgotResetLink && (
                <a
                  href={forgotResetLink}
                  className="mt-2 inline-flex underline underline-offset-4"
                >
                  Open reset link
                </a>
              )}
            </p>
          )}

          {error && (
            <p className="rounded-[12px] border border-[#5a2328] bg-[#2a1215] px-3 py-2 text-xs text-[#ff8b94]">
              {error}
            </p>
          )}
        </div>

        <div className="mt-6 flex items-center gap-3">
          {mode === "login" && loginStep !== "identifier" && (
            <button
              type="button"
              onClick={() => {
                setLoginStep(loginStep === "otp" ? "password" : "identifier");
                if (loginStep !== "otp") {
                  setIdentifier("");
                }
                setPassword("");
                setOtpCode("");
                setOtpEmail("");
                setChallengeToken(null);
                setOtpCountdown(0);
                setOtpSent(false);
                setOtpMessage("");
                setOtpFormatValid(true);
                setError("");
                setForgotMessage("");
                setForgotResetLink(null);
                setInvalidPasswordAttempts(0);
              }}
              disabled={loading}
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              Back
            </button>
          )}

          {mode === "signup" && signupAwaitingOtp && (
            <button
              type="button"
              onClick={() => {
                setSignupChallengeToken(null);
                setSignupOtpCode("");
                setSignupOtpEmail("");
                setSignupOtpSent(false);
                setSignupOtpCountdown(0);
                setSignupOtpMessage("");
                setSignupOtpFormatValid(true);
                setError("");
              }}
              disabled={loading || signupVerifying}
              className="inline-flex rounded-full border border-white/10 bg-white/5 px-5 py-3 text-sm font-medium text-white/80 transition hover:bg-white/10 disabled:opacity-50"
            >
              Back
            </button>
          )}

          <button
            type="button"
            onClick={
              mode === "login"
                ? loginStep === "identifier"
                  ? handleIdentifierContinue
                  : loginStep === "password"
                  ? handlePasswordLogin
                  : handleOtpVerification
                : signupAwaitingOtp
                ? handleSignupVerifyCode
                : handleSignup
            }
            disabled={
              loading ||
              signupVerifying ||
              (mode === "login" && loginStep === "identifier" && !identifier.trim()) ||
              (mode === "login" && loginStep === "password" && !password) ||
              (mode === "login" &&
                loginStep === "otp" &&
                (!otpSent || otpCode.trim().length !== 6 || !otpFormatValid)) ||
              (mode === "signup" && !signupAwaitingOtp && !signupReady) ||
              (mode === "signup" &&
                signupAwaitingOtp &&
                (!signupOtpSent ||
                  signupOtpCode.trim().length !== 6 ||
                  !signupOtpFormatValid))
            }
            className="inline-flex rounded-full bg-white px-5 py-3 text-sm font-medium text-black transition hover:bg-white/90 disabled:opacity-50"
          >
            {loading
              ? mode === "login"
                ? loginStep === "identifier"
                  ? "Checking..."
                  : loginStep === "password"
                  ? "Logging in..."
                  : "Verifying..."
                : signupAwaitingOtp
                ? "Verifying..."
                : "Creating account..."
              : mode === "login"
              ? loginStep === "identifier"
                ? "Continue"
                : loginStep === "password"
                ? "Log in"
                : "Verify code"
              : signupAwaitingOtp
              ? "Verify code"
              : "Sign up"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}