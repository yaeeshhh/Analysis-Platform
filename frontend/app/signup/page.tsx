"use client";

import { Suspense, useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  checkSignupAvailability,
  sendSignupCode,
  startSignup,
  verifySignupCode,
} from "@/lib/auth";
import OtpCodeInput from "@/components/ui/OtpCodeInput";
import {
  clearUserScopedFrontendState,
  formatCountdown,
  maskEmailAddress,
  moveInputCaretToEnd,
} from "@/lib/helpers";
import { setAccessToken } from "@/lib/api";
import { setActiveAccountEmail } from "@/lib/session";
import {
  getPasswordStrengthState,
  validatePasswordPolicy,
} from "@/lib/passwordPolicy";
import {
  isSignupEmailValid,
  getEmailValidationError,
} from "@/lib/emailValidation";
import Link from "next/link";
import PasswordToggleButton from "@/components/ui/PasswordToggleButton";
import PasswordStrengthBar from "@/components/ui/PasswordStrengthBar";
import AuthShell from "@/components/ui/AuthShell";

type FieldAvailability = "idle" | "invalid" | "checking" | "available" | "taken";

function SignupPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [email, setEmail] = useState("");
  const [username, setUsername] = useState("");
  const [fullName, setFullName] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");

  const [otpCode, setOtpCode] = useState("");
  const [otpEmail, setOtpEmail] = useState("");
  const [challengeToken, setChallengeToken] = useState<string | null>(null);
  const [otpCountdown, setOtpCountdown] = useState(0);
  const [otpSent, setOtpSent] = useState(false);
  const [otpMessage, setOtpMessage] = useState("");
  const [otpFormatValid, setOtpFormatValid] = useState(true);
  const [sendingCode, setSendingCode] = useState(false);

  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [passwordFocused, setPasswordFocused] = useState(false);
  const [usernameFocused, setUsernameFocused] = useState(false);
  const [emailFocused, setEmailFocused] = useState(false);

  const [loading, setLoading] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [error, setError] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const [emailAvailability, setEmailAvailability] =
    useState<FieldAvailability>("idle");
  const [usernameAvailability, setUsernameAvailability] =
    useState<FieldAvailability>("idle");

  const awaitingOtp = !!challengeToken;
  const passwordsMatch = password === confirmPassword;
  const passwordStrength = getPasswordStrengthState(password);

  const rawEmailInput = email;
  const rawUsernameInput = username;
  const trimmedEmail = rawEmailInput.trim().toLowerCase();
  const trimmedUsername = rawUsernameInput.trim().toLowerCase();

  const emailHasWhitespace = /\s/.test(rawEmailInput);
  const emailLooksValid =
    !emailHasWhitespace && isSignupEmailValid(rawEmailInput);

  const usernameHasSpace = /\s/.test(rawUsernameInput);
  const usernameLooksValid =
    trimmedUsername.length >= 3 && !usernameHasSpace;

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
    rawEmailInput.length === 0
      ? ""
      : emailAvailability === "checking"
      ? "Checking email availability..."
      : emailAvailability === "available"
      ? "Email available."
      : emailErrorMessage;

  const usernameStatusMessage =
    rawUsernameInput.length === 0
      ? ""
      : usernameAvailability === "checking"
      ? "Checking username availability..."
      : usernameAvailability === "available"
      ? "Username available."
      : usernameErrorMessage;

  const signupReady =
    !awaitingOtp &&
    !!trimmedUsername &&
    !!trimmedEmail &&
    !!password &&
    !!confirmPassword &&
    passwordsMatch &&
    !validatePasswordPolicy(password) &&
    emailAvailability === "available" &&
    usernameAvailability === "available";

  useEffect(() => {
    if (awaitingOtp) return;

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
        const availability = await checkSignupAvailability(
          undefined,
          trimmedUsername
        );
        if (!active) return;
        setUsernameAvailability(
          availability.username_exists ? "taken" : "available"
        );
      } catch {
        if (!active) return;
        setUsernameAvailability("idle");
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [awaitingOtp, trimmedUsername, usernameLooksValid]);

  useEffect(() => {
    if (awaitingOtp) return;

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
        const availability = await checkSignupAvailability(
          trimmedEmail,
          undefined
        );
        if (!active) return;
        setEmailAvailability(
          availability.email_exists ? "taken" : "available"
        );
      } catch {
        if (!active) return;
        setEmailAvailability("idle");
      }
    }, 350);

    return () => {
      active = false;
      window.clearTimeout(timer);
    };
  }, [awaitingOtp, trimmedEmail, emailLooksValid]);

  useEffect(() => {
    if (!otpCountdown) return;

    const timer = window.setInterval(() => {
      setOtpCountdown((current) => (current > 0 ? current - 1 : 0));
    }, 1000);

    return () => window.clearInterval(timer);
  }, [otpCountdown]);

  const validatePasswords = () => {
    if (password !== confirmPassword) {
      setPasswordError("Passwords do not match");
      return false;
    }

    const policyError = validatePasswordPolicy(password);
    if (policyError) {
      setPasswordError(policyError);
      return false;
    }

    setPasswordError("");
    return true;
  };

  const resetOtpState = () => {
    setChallengeToken(null);
    setOtpCode("");
    setOtpEmail("");
    setOtpCountdown(0);
    setOtpSent(false);
    setOtpMessage("");
    setOtpFormatValid(true);
    setError("");
    setSuccessMessage("");
  };

  const handleSignup = async () => {
    if (!signupReady || loading) return;

    setError("");
    setSuccessMessage("");
    setPasswordError("");

    if (!validatePasswords()) {
      return;
    }

    try {
      setLoading(true);
      clearUserScopedFrontendState();

      const resp = await startSignup(trimmedEmail, trimmedUsername, password, fullName.trim() || undefined);

      setChallengeToken(resp.challenge_token);
      setOtpEmail(resp.email || trimmedEmail);
      setOtpCode("");
      setOtpSent(false);
      setOtpCountdown(0);
      setOtpMessage("");
      setOtpFormatValid(true);
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Signup failed. Please try again."
      );
    } finally {
      setLoading(false);
    }
  };

  const handleSendCode = async () => {
    if (!challengeToken || loading || sendingCode) return;

    try {
      setSendingCode(true);
      setLoading(true);
      setError("");
      setSuccessMessage("");

      const resp = await sendSignupCode(challengeToken);

      setOtpEmail(resp.email);
      setOtpSent(true);
      setOtpCountdown(resp.resend_available_in_seconds);
      setOtpMessage("Verification code sent.");
      setOtpFormatValid(true);
      setOtpCode("");
    } catch (err: unknown) {
      setError(
        err instanceof Error ? err.message : "Unable to send verification code."
      );
    } finally {
      setSendingCode(false);
      setLoading(false);
    }
  };

  const handleVerifyCode = async () => {
    if (!challengeToken || !otpSent || !otpFormatValid || otpCode.trim().length !== 6 || verifying) {
      return;
    }

    try {
      setVerifying(true);
      setError("");
      setSuccessMessage("");

      const response = await verifySignupCode(challengeToken, otpCode.trim());

      setAccessToken(response.access_token);
      clearUserScopedFrontendState();
      setActiveAccountEmail(response.user?.email || trimmedEmail);

      const redirect = searchParams.get("redirect") || "/dashboard";
      const safeRedirect = redirect.startsWith("/") ? redirect : "/dashboard";
      router.push(safeRedirect);
    } catch (err: unknown) {
      setError(
        err instanceof Error
          ? err.message
          : "Verification failed. Please try again."
      );
    } finally {
      setVerifying(false);
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key !== "Enter" || loading || verifying) return;

    if (awaitingOtp) {
      if (!otpSent) {
        handleSendCode();
        return;
      }
      if (!otpFormatValid) return;
      handleVerifyCode();
      return;
    }

    handleSignup();
  };

  return (
    <AuthShell
      eyebrow="New Account"
      title={awaitingOtp ? "Verify your signup code" : "Create your Analysis Studio account"}
      description="Set up secure access to saved analyses, experiment history, and workspace tools in one place."
    >
      <div>

          <div className="space-y-4">
            {!awaitingOtp && (
              <>
                <div>
                  <label htmlFor="full-name" className="block text-sm font-medium mb-2">
                    Full name <span className="text-white/30 font-normal">(optional)</span>
                  </label>
                  <input
                    id="full-name"
                    type="text"
                    placeholder="Your full name"
                    value={fullName}
                    onChange={(e) => setFullName(e.target.value)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    className="w-full p-3 rounded-lg bg-[#111827] border border-[#a78bfa]/15 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                  />
                </div>

                <div>
                  <label htmlFor="username" className="block text-sm font-medium mb-2">
                    Username
                  </label>
                  <input
                    id="username"
                    type="text"
                    placeholder="yourname"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    onFocus={(e) => {
                      setUsernameFocused(true);
                      moveInputCaretToEnd(e.currentTarget);
                    }}
                    onBlur={() => setUsernameFocused(false)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    className={`w-full p-3 rounded-lg bg-[#111827] focus:outline-none disabled:opacity-50 ${
                      usernameFieldIsAvailable
                        ? "border border-emerald-400 ring-1 ring-emerald-500/30 focus:border-emerald-400"
                        : "border border-[#a78bfa]/15 focus:border-blue-500"
                    }`}
                    style={usernameFieldStyle}
                  />
                  {usernameStatusMessage &&
                    (usernameFocused || rawUsernameInput.length > 0) && (
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

                <div>
                  <label htmlFor="email" className="block text-sm font-medium mb-2">
                    Email
                  </label>
                  <input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    onFocus={(e) => {
                      setEmailFocused(true);
                      moveInputCaretToEnd(e.currentTarget);
                    }}
                    onBlur={() => setEmailFocused(false)}
                    onKeyPress={handleKeyPress}
                    disabled={loading}
                    className={`w-full p-3 rounded-lg bg-[#111827] focus:outline-none disabled:opacity-50 ${
                      emailFieldIsAvailable
                        ? "border border-emerald-400 ring-1 ring-emerald-500/30 focus:border-emerald-400"
                        : "border border-[#a78bfa]/15 focus:border-blue-500"
                    }`}
                    style={emailFieldStyle}
                  />
                  {emailStatusMessage &&
                    (emailFocused || rawEmailInput.length > 0) && (
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

                <div>
                  <label htmlFor="password" className="block text-sm font-medium mb-2">
                    Password
                  </label>
                  <div className="relative">
                    <input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      onFocus={(e) => {
                        setPasswordFocused(true);
                        moveInputCaretToEnd(e.currentTarget);
                      }}
                      onBlur={() => setPasswordFocused(false)}
                      onKeyPress={handleKeyPress}
                      disabled={loading}
                      className="w-full p-3 pr-11 rounded-lg bg-[#111827] border border-[#a78bfa]/15 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <PasswordToggleButton
                      shown={showPassword}
                      onToggle={() => setShowPassword((prev) => !prev)}
                    />
                  </div>
                  <PasswordStrengthBar
                    show={password.length > 0}
                    barClassName={passwordStrength.barClassName}
                    progressPercent={passwordStrength.progressPercent}
                    showMessage={
                      password.length > 0 &&
                      (passwordStrength.level === "weak" || passwordFocused)
                    }
                    message={passwordStrength.statusMessage}
                    textClassName={passwordStrength.textClassName}
                    barMarginTop
                  />
                </div>

                <div>
                  <label htmlFor="confirmPassword" className="block text-sm font-medium mb-2">
                    Confirm Password
                  </label>
                  <div className="relative">
                    <input
                      id="confirmPassword"
                      type={showConfirmPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={confirmPassword}
                      onChange={(e) => setConfirmPassword(e.target.value)}
                      onFocus={(e) => moveInputCaretToEnd(e.currentTarget)}
                      onKeyPress={handleKeyPress}
                      disabled={loading}
                      className="w-full p-3 pr-11 rounded-lg bg-[#111827] border border-[#a78bfa]/15 focus:outline-none focus:border-blue-500 disabled:opacity-50"
                    />
                    <PasswordToggleButton
                      shown={showConfirmPassword}
                      onToggle={() => setShowConfirmPassword((prev) => !prev)}
                      label="confirm password"
                    />
                  </div>
                  {confirmPassword.length > 0 && password.length > 0 && (
                    <p
                      className={`mt-1 text-xs ${
                        passwordsMatch ? "text-emerald-300" : "text-red-300"
                      }`}
                    >
                      {passwordsMatch ? "Passwords match" : "Passwords do not match"}
                    </p>
                  )}
                </div>
              </>
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
                        if (loading || verifying) return;
                        if (!otpSent) {
                          handleSendCode();
                          return;
                        }
                        if (otpFormatValid) handleVerifyCode();
                      }}
                      disabled={loading || verifying}
                      idPrefix="signup-otp"
                    />
                  </div>
                )}

                <div className="flex items-center justify-between gap-3 text-sm text-white/65">
                  <button
                    type="button"
                    onClick={handleSendCode}
                    disabled={loading || sendingCode || otpCountdown > 0}
                    className="inline-flex items-center gap-2 underline decoration-white/25 underline-offset-4 disabled:no-underline disabled:opacity-50"
                  >
                    {sendingCode ? (
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

            {!awaitingOtp && passwordError && (
              <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-200 text-sm p-3 rounded-lg">
                {passwordError}
              </div>
            )}

            {error && (
              <div className="bg-red-900 bg-opacity-30 border border-red-700 text-red-200 text-sm p-3 rounded-lg">
                {error}
              </div>
            )}

            {successMessage && (
              <div className="bg-emerald-900/25 border border-emerald-700 text-emerald-200 text-sm p-3 rounded-lg">
                {successMessage}
              </div>
            )}

            <button
              onClick={awaitingOtp ? handleVerifyCode : handleSignup}
              disabled={
                awaitingOtp
                  ? verifying || !otpSent || otpCode.trim().length !== 6 || !otpFormatValid
                  : loading || !signupReady
              }
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-gradient-to-r from-[#7c3aed] to-[#6d28d9] p-3 font-medium transition hover:from-[#8b5cf6] hover:to-[#7c3aed] disabled:bg-gray-600 disabled:opacity-50"
            >
              {awaitingOtp ? (
                verifying ? (
                  <>
                    <span className="button-live-loader" aria-hidden="true" />
                    Verifying...
                  </>
                ) : "Verify code"
              ) : loading ? (
                <>
                  <span className="button-live-loader" aria-hidden="true" />
                  Creating account...
                </>
              ) : "Sign Up"}
            </button>

            {awaitingOtp && (
              <button
                type="button"
                onClick={resetOtpState}
                disabled={loading || verifying}
                className="inline-flex w-full items-center justify-center gap-2 rounded-lg border border-white/10 bg-white/5 p-3 font-medium transition hover:bg-white/10 disabled:opacity-50"
              >
                {loading || verifying ? (
                  <>
                    <span className="button-live-loader" aria-hidden="true" />
                    Back
                  </>
                ) : "Back"}
              </button>
            )}
          </div>

          <p className="text-sm text-center mt-6 text-gray-400">
            Already have an account?{" "}
            <Link href="/login" className="text-blue-400 hover:text-blue-300">
              Log in here
            </Link>
          </p>
        </div>
    </AuthShell>
  );
}

export default function SignupPage() {
  return (
    <Suspense fallback={null}>
      <SignupPageContent />
    </Suspense>
  );
}