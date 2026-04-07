import { getAccessToken } from "@/lib/api";
import { getApiBaseUrl, PRODUCTION_API_BASE_URL } from "@/lib/apiBaseUrl";

const API_BASE_URL = getApiBaseUrl(process.env.NEXT_PUBLIC_API_BASE_URL);

function getApiBaseCandidates(): string[] {
  // I collect a few safe API base URLs here so localhost and deployed pages can share the same auth flow.
  const candidates = [API_BASE_URL];

  if (
    process.env.NODE_ENV === "production" &&
    API_BASE_URL !== PRODUCTION_API_BASE_URL &&
    !candidates.includes(PRODUCTION_API_BASE_URL)
  ) {
    candidates.push(PRODUCTION_API_BASE_URL);
  }

  if (typeof window === "undefined") {
    return candidates;
  }

  const browserHost = window.location.hostname;
  const isBrowserLocal =
    browserHost === "localhost" || browserHost === "127.0.0.1";

  try {
    const configured = new URL(API_BASE_URL);
    const isLocalConfigured =
      configured.hostname === "localhost" || configured.hostname === "127.0.0.1";

    if (isLocalConfigured) {
      const alternateLocalHost =
        configured.hostname === "localhost" ? "127.0.0.1" : "localhost";
      const localFallback = `${configured.protocol}//${alternateLocalHost}:${
        configured.port || "8000"
      }`;
      if (!candidates.includes(localFallback)) {
        candidates.push(localFallback);
      }
    }

    if (isLocalConfigured && !isBrowserLocal) {
      const fallback = `${configured.protocol}//${browserHost}:${
        configured.port || "8000"
      }`;
      if (!candidates.includes(fallback)) {
        candidates.push(fallback);
      }
    }
  } catch {
    // If the configured URL is odd, I just keep it and skip the extra fallbacks.
  }

  if (!isBrowserLocal && !candidates.includes(PRODUCTION_API_BASE_URL)) {
    candidates.push(PRODUCTION_API_BASE_URL);
  }

  return candidates;
}

async function postAuthWithFallback(path: string, body: Record<string, unknown>) {
  const candidates = getApiBaseCandidates();
  let lastNetworkError: unknown = null;

  for (const base of candidates) {
    try {
      return await fetch(`${base}${path}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify(body),
      });
    } catch (error) {
      lastNetworkError = error;
    }
  }

  throw lastNetworkError ?? new Error("Unable to reach the API.");
}

function shouldFallbackFromProxy(response: Response): boolean {
  return (
    response.status === 404 ||
    response.status === 405 ||
    response.status === 502 ||
    response.status === 503 ||
    response.status === 504
  );
}

function getFrontendOrigin(): string | null {
  if (typeof window === "undefined") {
    return null;
  }

  try {
    const { origin } = window.location;
    return origin ? origin.replace(/\/+$/, "") : null;
  } catch {
    return null;
  }
}

function sanitizeForgotPasswordRedirectPath(redirectPath?: string): string | null {
  const trimmedPath = redirectPath?.trim() || "";
  if (!trimmedPath.startsWith("/")) {
    return null;
  }

  try {
    const parsed = new URL(trimmedPath, "http://local.reset");
    parsed.searchParams.delete("login_prompt");
    parsed.searchParams.delete("reset_token");
    parsed.searchParams.delete("token");
    const query = parsed.searchParams.toString();
    return `${parsed.pathname}${query ? `?${query}` : ""}${parsed.hash}`;
  } catch {
    return trimmedPath;
  }
}

export interface User {
  id: number;
  email: string;
  username: string | null;
  full_name: string | null;
  date_of_birth: string | null;
  two_factor_enabled: boolean;
  is_active: boolean;
  created_at: string;
}

export interface LoginSuccessResponse {
  requires_2fa?: false;
  access_token: string;
  token_type: string;
  user: User;
  remember_token?: string | null;
}

interface LoginChallengeResponse {
  requires_2fa: true;
  challenge_token: string;
  email: string;
  code_sent: boolean;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface SendLoginCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: true;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

type LoginResponse = LoginSuccessResponse | LoginChallengeResponse;

interface SignupStartResponse {
  challenge_token: string;
  email: string;
  code_sent: false;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface SendSignupCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: true;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface RefreshResponse {
  access_token: string;
  token_type: string;
}

interface GenericMessageResponse {
  message: string;
  reset_link?: string | null;
}

interface ResetPasswordContextResponse {
  email: string;
  username: string | null;
}

interface IdentifierCheckResponse {
  exists: boolean;
  email?: string | null;
}

interface SignupAvailabilityResponse {
  email_exists: boolean;
  username_exists: boolean;
}

interface UpdateProfileRequest {
  email?: string;
  username?: string;
  full_name?: string;
  date_of_birth?: string | null;
  two_factor_enabled?: boolean;
  password?: string;
  current_password?: string;
}

interface RequestProfileUpdateCodeRequest {
  email?: string;
  username?: string;
}

interface RequestProfileUpdateCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: false;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface SendProfileUpdateCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: true;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface RequestAccountDeletionCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: false;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

interface SendAccountDeletionCodeResponse {
  challenge_token: string;
  email: string;
  code_sent: true;
  expires_in_seconds: number;
  resend_available_in_seconds: number;
}

export function isLoginChallengeResponse(
  response: LoginResponse
): response is LoginChallengeResponse {
  return response.requires_2fa === true;
}

export const REMEMBER_LOGIN_STORAGE_KEY = "rememberedLogins";
const REMEMBER_LOGIN_WINDOW_MS = 30 * 24 * 60 * 60 * 1000;

type RememberRecord = {
  token: string;
  expiresAt: number;
  disabled?: boolean;
};

export type RememberStatus = {
  enabled: boolean;
  daysRemaining: number;
  available: boolean;
};

type SetRememberedLoginOptions = {
  enabled?: boolean;
  expiresAt?: number;
  preserveExistingExpiry?: boolean;
  days?: number;
};

function normalizeRememberLoginKey(value: string): string {
  return value.trim().toLowerCase();
}

function getRememberGroupKeys(
  map: Record<string, RememberRecord>,
  normalizedKey: string
): string[] {
  const token = map[normalizedKey]?.token;
  if (!token) {
    return [normalizedKey];
  }

  return Array.from(
    new Set(
      Object.keys(map)
        .filter((key) => map[key]?.token === token)
        .concat(normalizedKey)
    )
  );
}

function writeRememberGroup(
  map: Record<string, RememberRecord>,
  keys: Iterable<string>,
  record: RememberRecord
) {
  const nextRecord: RememberRecord = {
    token: record.token,
    expiresAt: Number(record.expiresAt),
    disabled: Boolean(record.disabled),
  };

  for (const key of keys) {
    map[key] = { ...nextRecord };
  }
}

function resolveRememberExpiry(
  existingRecord: RememberRecord | undefined,
  options: SetRememberedLoginOptions
): number {
  if (Number.isFinite(options.expiresAt)) {
    return Number(options.expiresAt);
  }

  if (options.preserveExistingExpiry && existingRecord) {
    const currentExpiry = Number(existingRecord.expiresAt);
    if (Number.isFinite(currentExpiry) && currentExpiry > Date.now()) {
      return currentExpiry;
    }
  }

  const days = Number.isFinite(options.days) ? Number(options.days) : 30;
  return Date.now() + days * 24 * 60 * 60 * 1000;
}

function getRememberMap(): Record<string, RememberRecord> {
  if (typeof window === "undefined") return {};
  const raw = localStorage.getItem(REMEMBER_LOGIN_STORAGE_KEY);
  if (!raw) return {};
  try {
    return JSON.parse(raw) as Record<string, RememberRecord>;
  } catch {
    return {};
  }
}

function saveRememberMap(map: Record<string, RememberRecord>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(REMEMBER_LOGIN_STORAGE_KEY, JSON.stringify(map));
}

export function setRememberedLogin(
  email: string,
  token: string,
  identifier?: string,
  options: SetRememberedLoginOptions = {}
) {
  const map = getRememberMap();
  const normalized = normalizeRememberLoginKey(email);
  const normalizedIdentifier = identifier
    ? normalizeRememberLoginKey(identifier)
    : "";
  const existingKey = [normalized, normalizedIdentifier]
    .filter(Boolean)
    .find((key) => !!map[key]?.token);
  const existingRecord = existingKey ? map[existingKey] : undefined;
  const keys = new Set<string>(existingKey ? getRememberGroupKeys(map, existingKey) : []);
  keys.add(normalized);

  if (normalizedIdentifier && normalizedIdentifier !== normalized) {
    keys.add(normalizedIdentifier);
  }

  writeRememberGroup(map, keys, {
    token,
    expiresAt: resolveRememberExpiry(existingRecord, options),
    disabled: options.enabled === undefined ? false : !options.enabled,
  });

  saveRememberMap(map);
}

export function getValidRememberToken(email: string): string | null {
  if (!email.trim()) return null;
  const normalized = normalizeRememberLoginKey(email);
  const map = getRememberMap();
  const item = map[normalized];
  if (!item) return null;
  if (!item.token) {
    clearRememberedLogin(normalized);
    return null;
  }
  if (item.disabled) {
    return null;
  }

  const expiresAt = Number(item.expiresAt);
  if (Number.isFinite(expiresAt) && expiresAt <= Date.now()) {
    clearRememberedLogin(normalized);
    return null;
  }
  return item.token;
}

export function clearRememberedLogin(email: string) {
  const map = getRememberMap();
  const normalized = normalizeRememberLoginKey(email);
  const token = map[normalized]?.token || null;

  delete map[normalized];

  if (token) {
    Object.keys(map).forEach((key) => {
      if (map[key]?.token === token) {
        delete map[key];
      }
    });
  }

  saveRememberMap(map);
}

export function clearRememberedLogins() {
  if (typeof window === "undefined") return;
  localStorage.removeItem(REMEMBER_LOGIN_STORAGE_KEY);
}

export function getRememberStatus(email: string): RememberStatus {
  const normalized = normalizeRememberLoginKey(email);
  if (!normalized) {
    return { enabled: false, daysRemaining: 0, available: false };
  }

  const map = getRememberMap();
  const item = map[normalized];
  if (!item?.token) {
    return { enabled: false, daysRemaining: 0, available: false };
  }

  const expiresAt = Number(item.expiresAt);
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) {
    clearRememberedLogin(normalized);
    return { enabled: false, daysRemaining: 0, available: false };
  }

  const daysRemaining = Math.max(
    0,
    Math.ceil((expiresAt - Date.now()) / (24 * 60 * 60 * 1000))
  );

  return {
    enabled: !item.disabled,
    daysRemaining,
    available: true,
  };
}

export function resetRememberedLogin(email: string, days = 30): boolean {
  const normalized = normalizeRememberLoginKey(email);
  if (!normalized) return false;

  const map = getRememberMap();
  const item = map[normalized];
  if (!item?.token) return false;

  writeRememberGroup(map, getRememberGroupKeys(map, normalized), {
    token: item.token,
    expiresAt: Date.now() + days * 24 * 60 * 60 * 1000,
    disabled: item.disabled,
  });
  saveRememberMap(map);
  return true;
}

export function setRememberEnabled(email: string, enabled: boolean): boolean {
  const normalized = normalizeRememberLoginKey(email);
  if (!normalized) return false;

  const map = getRememberMap();
  const item = map[normalized];
  if (!item?.token) return false;

  writeRememberGroup(map, getRememberGroupKeys(map, normalized), {
    token: item.token,
    expiresAt: item.expiresAt,
    disabled: !enabled,
  });
  saveRememberMap(map);
  return true;
}

export async function generateRememberToken(email: string): Promise<string | null> {
  const accessToken = getAccessToken();
  if (!accessToken) {
    throw new Error("Not authenticated");
  }

  const candidates = getApiBaseCandidates();
  let lastNetworkError: unknown = null;

  for (const base of candidates) {
    try {
      const response = await fetch(`${base}/auth/me/generate-remember-token`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${accessToken}`,
        },
        credentials: "include",
      });

      const payload = await parseJsonSafely(response);

      if (!response.ok) {
        throw new Error(payload?.detail || "Failed to generate remember token");
      }

      const rememberToken = payload.remember_token || payload.remember_token;
      if (!rememberToken) {
        throw new Error("No token in response");
      }

      setRememberedLogin(email, rememberToken, undefined, {
        enabled: true,
        expiresAt: Date.now() + REMEMBER_LOGIN_WINDOW_MS,
      });

      return rememberToken;
    } catch (error) {
      lastNetworkError = error;
    }
  }

  throw lastNetworkError;
}

async function parseJsonSafely(response: Response) {
  const cloned = response.clone();
  const jsonPayload = await cloned.json().catch(() => null);
  if (jsonPayload !== null) {
    return jsonPayload;
  }

  const textPayload = await response.text().catch(() => "");
  const trimmedTextPayload = textPayload.trim();

  if (
    trimmedTextPayload.startsWith("<!DOCTYPE html") ||
    trimmedTextPayload.startsWith("<html")
  ) {
    return {
      detail:
        "Received an HTML error page instead of an API response. Check NEXT_PUBLIC_API_BASE_URL and make sure it includes https://.",
    };
  }

  if (trimmedTextPayload) {
    return { detail: trimmedTextPayload };
  }

  return null;
}

function getErrorMessage(payload: unknown, fallback: string): string {
  if (!payload || typeof payload !== "object") {
    return fallback;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const detail = payloadRecord.detail;

  if (typeof detail === "string" && detail.trim()) {
    return detail;
  }

  if (Array.isArray(detail) && detail.length > 0) {
    const first = detail[0];
    if (typeof first === "string" && first.trim()) {
      return first;
    }
    if (first && typeof first === "object") {
      if (typeof (first as { msg?: unknown }).msg === "string" && (first as { msg: string }).msg.trim()) {
        return (first as { msg: string }).msg;
      }
      if (
        typeof (first as { message?: unknown }).message === "string" &&
        (first as { message: string }).message.trim()
      ) {
        return (first as { message: string }).message;
      }
    }
  }

  const message = payloadRecord.message;
  if (typeof message === "string" && message.trim()) {
    return message;
  }

  return fallback;
}

export async function startSignup(
  email: string,
  username: string,
  password: string,
  fullName?: string,
): Promise<SignupStartResponse> {
  const response = await postAuthWithFallback("/auth/signup/start", {
    email,
    username,
    full_name: fullName || undefined,
    password,
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Signup failed. Please try again."));
  }
  return payload as SignupStartResponse;
}

export async function sendSignupCode(
  challengeToken: string
): Promise<SendSignupCodeResponse> {
  const response = await postAuthWithFallback("/auth/signup/send-code", {
    challenge_token: challengeToken,
  });
  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Unable to send verification code.")
    );
  }
  return payload as SendSignupCodeResponse;
}

export async function verifySignupCode(
  challengeToken: string,
  code: string
): Promise<LoginSuccessResponse> {
  const response = await postAuthWithFallback("/auth/signup/verify", {
    challenge_token: challengeToken,
    code,
  });

  const payload = await parseJsonSafely(response);
  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Verification failed. Please try again.")
    );
  }

  return payload as LoginSuccessResponse;
}

export async function login(
  identifier: string,
  password: string,
  rememberMe = false
): Promise<LoginResponse> {
  const response = await postAuthWithFallback("/auth/login", {
    identifier,
    password,
    remember_me: rememberMe,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Login failed. Please try again."));
  }

  return payload;
}

export async function rememberLogin(
  email: string,
  rememberToken: string
): Promise<LoginSuccessResponse> {
  const response = await postAuthWithFallback("/auth/remember-login", {
    email,
    remember_token: rememberToken,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Remember login failed"));
  }

  return payload;
}

export async function verifyLoginCode(
  challengeToken: string,
  code: string
): Promise<LoginSuccessResponse> {
  const response = await postAuthWithFallback("/auth/verify-login-code", {
    challenge_token: challengeToken,
    code,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Verification failed. Please try again.")
    );
  }

  return payload;
}

export async function sendLoginCode(
  challengeToken: string
): Promise<SendLoginCodeResponse> {
  let response: Response;

  try {
    response = await fetch("/api/auth/send-login-code", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ challenge_token: challengeToken }),
    });

    if (shouldFallbackFromProxy(response)) {
      response = await postAuthWithFallback("/auth/send-login-code", {
        challenge_token: challengeToken,
      });
    }
  } catch {
    response = await postAuthWithFallback("/auth/send-login-code", {
      challenge_token: challengeToken,
    });
  }

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    if (response.status === 401) {
      throw new Error("Verification session expired. Please log in again.");
    }
    throw new Error(getErrorMessage(payload, "Unable to send verification code"));
  }

  return payload;
}

export async function checkLoginIdentifier(
  identifier: string
): Promise<IdentifierCheckResponse> {
  const response = await postAuthWithFallback("/auth/check-identifier", {
    identifier,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Unable to verify account"));
  }

  return payload;
}

export async function checkSignupAvailability(
  email?: string,
  username?: string
): Promise<SignupAvailabilityResponse> {
  const response = await postAuthWithFallback("/auth/check-signup-availability", {
    email: email || null,
    username: username || null,
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Unable to check signup availability"));
  }

  return payload;
}

export async function forgotPassword(
  email: string,
  redirectPath?: string
): Promise<GenericMessageResponse> {
  const frontendOrigin = getFrontendOrigin();
  const sanitizedRedirectPath = sanitizeForgotPasswordRedirectPath(redirectPath);
  const requestBody = {
    email,
    redirect_path: sanitizedRedirectPath,
    frontend_origin: frontendOrigin,
  };
  let response: Response;

  try {
    response = await fetch("/api/auth/forgot-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(requestBody),
    });

    if (shouldFallbackFromProxy(response)) {
      response = await postAuthWithFallback("/auth/forgot-password", requestBody);
    }
  } catch {
    response = await postAuthWithFallback("/auth/forgot-password", requestBody);
  }

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Unable to request password reset"));
  }

  return payload;
}

export async function resetPassword(
  token: string,
  newPassword: string
): Promise<GenericMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/reset-password`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
    body: JSON.stringify({ token, new_password: newPassword }),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Password reset failed"));
  }

  return payload;
}

export async function getResetPasswordContext(
  token: string
): Promise<ResetPasswordContextResponse> {
  const response = await fetch(
    `${API_BASE_URL}/auth/reset-password-context?token=${encodeURIComponent(token)}`,
    {
      method: "GET",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
    }
  );

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Invalid or expired reset token"));
  }

  return payload;
}

export async function refreshAccessToken(): Promise<RefreshResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    credentials: "include",
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Token refresh failed"));
  }

  return payload;
}

export async function getCurrentUser(accessToken: string): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "GET",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to fetch user"));
  }

  return payload;
}

export async function logout(accessToken: string): Promise<void> {
  const response = await fetch(`${API_BASE_URL}/auth/logout`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  if (!response.ok) {
    const payload = await parseJsonSafely(response);
    throw new Error(getErrorMessage(payload, "Logout failed"));
  }
}

export async function updateCurrentUser(
  accessToken: string,
  data: UpdateProfileRequest
): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me`, {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(getErrorMessage(payload, "Failed to update profile"));
  }

  return payload;
}

export async function requestProfileUpdateCode(
  accessToken: string,
  data: RequestProfileUpdateCodeRequest
): Promise<RequestProfileUpdateCodeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me/request-profile-update-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify(data),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to send profile verification code")
    );
  }

  return payload;
}

export async function verifyProfileUpdateCode(
  accessToken: string,
  challengeToken: string,
  code: string
): Promise<User> {
  const response = await fetch(`${API_BASE_URL}/auth/me/verify-profile-update-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to verify profile update code")
    );
  }

  return payload;
}

export async function sendProfileUpdateCode(
  accessToken: string,
  challengeToken: string
): Promise<SendProfileUpdateCodeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me/send-profile-update-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ challenge_token: challengeToken }),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to send profile update verification code")
    );
  }

  return payload;
}

export async function requestAccountDeletionCode(
  accessToken: string
): Promise<RequestAccountDeletionCodeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me/request-account-deletion-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to start account deletion verification")
    );
  }

  return payload;
}

export async function sendAccountDeletionCode(
  accessToken: string,
  challengeToken: string
): Promise<SendAccountDeletionCodeResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me/send-account-deletion-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ challenge_token: challengeToken }),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to send account deletion verification code")
    );
  }

  return payload;
}

export async function verifyAccountDeletionCode(
  accessToken: string,
  challengeToken: string,
  code: string
): Promise<GenericMessageResponse> {
  const response = await fetch(`${API_BASE_URL}/auth/me/verify-account-deletion-code`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${accessToken}`,
    },
    credentials: "include",
    body: JSON.stringify({ challenge_token: challengeToken, code }),
  });

  const payload = await parseJsonSafely(response);

  if (!response.ok) {
    throw new Error(
      getErrorMessage(payload, "Failed to verify account deletion code")
    );
  }

  return payload;
}