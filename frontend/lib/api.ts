import { refreshAccessToken } from "./auth";
import { clearUserScopedFrontendState } from "./helpers";
const ACCESS_TOKEN_STORAGE_KEY = "accessToken";
const PASSWORD_CHANGED_QUERY_PARAM = "password_changed";
const PASSWORD_CHANGED_REAUTH_DETAIL = "Your password was changed. Please log in again.";

// I keep this in memory so repeated requests do not keep touching localStorage.
let accessToken: string | null = null;

export function setAccessToken(token: string | null) {
  accessToken = token;

  if (typeof window === "undefined") return;

  if (token) {
    localStorage.setItem(ACCESS_TOKEN_STORAGE_KEY, token);
  } else {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

export function getAccessToken(): string | null {
  if (!accessToken && typeof window !== "undefined") {
    accessToken = localStorage.getItem(ACCESS_TOKEN_STORAGE_KEY);
  }

  return accessToken;
}

export function clearAccessToken() {
  accessToken = null;

  if (typeof window !== "undefined") {
    localStorage.removeItem(ACCESS_TOKEN_STORAGE_KEY);
  }
}

export async function parseJsonSafely(response: Response) {
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

  return trimmedTextPayload ? { detail: trimmedTextPayload } : null;
}

function isPasswordChangedReauthMessage(message: unknown): boolean {
  return (
    typeof message === "string" &&
    message.trim().toLowerCase() === PASSWORD_CHANGED_REAUTH_DETAIL.toLowerCase()
  );
}

function isPasswordChangedPayload(payload: unknown): boolean {
  if (!payload || typeof payload !== "object") {
    return false;
  }

  const payloadRecord = payload as Record<string, unknown>;
  const detail = payloadRecord.detail;
  if (typeof detail === "string" && isPasswordChangedReauthMessage(detail)) {
    return true;
  }

  const message = payloadRecord.message;
  return typeof message === "string" && isPasswordChangedReauthMessage(message);
}

function redirectToLogin(passwordChanged = false) {
  if (typeof window !== "undefined") {
    // I clear the browser session first so the login page starts clean.
    clearAccessToken();
    clearUserScopedFrontendState();
    window.location.href = passwordChanged
      ? `/login?${PASSWORD_CHANGED_QUERY_PARAM}=1`
      : "/login";
  }
}

interface FetchOptions extends RequestInit {
  headers?: Record<string, string>;
  suppressAuthRedirect?: boolean;
}

export async function fetchWithAuth(url: string, options: FetchOptions = {}) {
  const { suppressAuthRedirect = false, ...requestOptions } = options;
  const headers = { ...requestOptions.headers };
  let token = getAccessToken();
  let passwordChangedDuringRefresh = false;

  // If memory is empty, I try the refresh cookie once before treating the session as gone.
  if (!token) {
    try {
      const refreshResponse = await refreshAccessToken();
      setAccessToken(refreshResponse.access_token);
      token = refreshResponse.access_token;
    } catch (error) {
      passwordChangedDuringRefresh = isPasswordChangedReauthMessage(
        error instanceof Error ? error.message : null
      );
      token = null;
    }
  }

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  let response: Response;

  try {
    response = await fetch(url, {
      ...requestOptions,
      credentials: "include",
      headers,
    });
  } catch {
    const isMlRequest = /\/analysis\/[^/]+\/ml\//.test(url);
    throw new Error(
      isMlRequest
        ? "Unable to reach the API. The ML run likely timed out or the backend restarted while processing it."
        : "Unable to reach the API. Check that the backend server is running."
    );
  }

  // One retry is enough here because an expired access token is the usual 401 case.
  if (response.status === 401) {
    const initialUnauthorizedPayload = await parseJsonSafely(response);
    const passwordChangedResponse =
      passwordChangedDuringRefresh ||
      isPasswordChangedPayload(initialUnauthorizedPayload);

    try {
      const refreshResponse = await refreshAccessToken();
      setAccessToken(refreshResponse.access_token);

      headers["Authorization"] = `Bearer ${refreshResponse.access_token}`;
      response = await fetch(url, {
        ...requestOptions,
        credentials: "include",
        headers,
      });
    } catch (error) {
      if (!suppressAuthRedirect) {
        redirectToLogin(
          passwordChangedResponse ||
            isPasswordChangedReauthMessage(
              error instanceof Error ? error.message : null
            )
        );
      }
      throw error;
    }
  }

  if (response.status === 401 && !suppressAuthRedirect) {
    const payload = await parseJsonSafely(response);
    redirectToLogin(
      passwordChangedDuringRefresh || isPasswordChangedPayload(payload)
    );
  }

  return response;
}