import { clearAccessToken, getAccessToken, setAccessToken } from "./api";
import { getCurrentUser, refreshAccessToken, User } from "./auth";

const ACTIVE_ACCOUNT_EMAIL_SESSION_KEY = "auth:active-account-email";
const PASSWORD_CHANGED_NOTICE_KEY = "auth:password-changed-notice";
const LAST_SEEN_PASSWORD_CHANGED_NOTICE_KEY = "auth:last-password-changed-notice-id";
const FORCED_PASSWORD_CHANGED_NOTICE_KEY = "auth:force-password-changed-notice-id";
const PASSWORD_CHANGED_REAUTH_DETAIL = "Your password was changed. Please log in again.";
const AUTHENTICATED_USER_CACHE_WINDOW_MS = 30000;
export const PASSWORD_CHANGED_QUERY_PARAM = "password_changed";

type CachedAuthenticatedUser = {
  cacheKey: string;
  expiresAt: number;
  user: User | null;
};

let cachedAuthenticatedUser: CachedAuthenticatedUser | null = null;
let authenticatedUserPromise:
  | {
      cacheKey: string;
      promise: Promise<User | null>;
    }
  | null = null;

export type PasswordChangedNoticePayload = {
  id: string;
  email: string;
};

export function setActiveAccountEmail(email: string | null): void {
  if (typeof window === "undefined") return;

  const normalizedEmail = email?.trim().toLowerCase() || "";
  if (normalizedEmail) {
    sessionStorage.setItem(ACTIVE_ACCOUNT_EMAIL_SESSION_KEY, normalizedEmail);
    return;
  }

  sessionStorage.removeItem(ACTIVE_ACCOUNT_EMAIL_SESSION_KEY);
}

export function getActiveAccountEmail(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(ACTIVE_ACCOUNT_EMAIL_SESSION_KEY);
}

export function clearActiveAccountEmail(): void {
  if (typeof window === "undefined") return;
  sessionStorage.removeItem(ACTIVE_ACCOUNT_EMAIL_SESSION_KEY);
}

function getAuthenticatedUserCacheKey(): string {
  return getAccessToken() ?? "__anonymous__";
}

function readCachedAuthenticatedUser(cacheKey: string): User | null | undefined {
  if (
    cachedAuthenticatedUser &&
    cachedAuthenticatedUser.cacheKey === cacheKey &&
    cachedAuthenticatedUser.expiresAt > Date.now()
  ) {
    return cachedAuthenticatedUser.user;
  }

  return undefined;
}

function storeCachedAuthenticatedUser(user: User | null): User | null {
  cachedAuthenticatedUser = {
    cacheKey: getAuthenticatedUserCacheKey(),
    expiresAt: Date.now() + AUTHENTICATED_USER_CACHE_WINDOW_MS,
    user,
  };

  return user;
}

function getPendingPasswordChangedNotice(): PasswordChangedNoticePayload | null {
  if (typeof window === "undefined") return null;

  const raw = localStorage.getItem(PASSWORD_CHANGED_NOTICE_KEY);
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as Partial<PasswordChangedNoticePayload>;
    const id = typeof parsed.id === "string" ? parsed.id : "";
    const email =
      typeof parsed.email === "string" ? parsed.email.trim().toLowerCase() : "";

    if (!id || !email) return null;
    return { id, email };
  } catch {
    return null;
  }
}

function getForcedPasswordChangedNoticeId(): string | null {
  if (typeof window === "undefined") return null;
  return sessionStorage.getItem(FORCED_PASSWORD_CHANGED_NOTICE_KEY);
}

export function queuePasswordChangedNotice(
  email: string | null | undefined
): PasswordChangedNoticePayload | null {
  if (typeof window === "undefined") return null;

  const normalizedEmail = email?.trim().toLowerCase() || "";
  if (!normalizedEmail) return null;

  const notice = {
    id: Date.now().toString(),
    email: normalizedEmail,
  };

  localStorage.setItem(PASSWORD_CHANGED_NOTICE_KEY, JSON.stringify(notice));
  sessionStorage.setItem(FORCED_PASSWORD_CHANGED_NOTICE_KEY, notice.id);
  return notice;
}

export function isPasswordChangedReauthMessage(message: unknown): boolean {
  return (
    typeof message === "string" &&
    message.trim().toLowerCase() === PASSWORD_CHANGED_REAUTH_DETAIL.toLowerCase()
  );
}

function redirectToPasswordChangedLogin(): void {
  if (typeof window === "undefined") return;
  window.location.replace(`/login?${PASSWORD_CHANGED_QUERY_PARAM}=1`);
}

export function primePasswordChangedNoticeForCurrentTab(): void {
  if (typeof window === "undefined") return;

  const notice = getPendingPasswordChangedNotice();
  if (!notice) return;

  const activeEmail = getActiveAccountEmail();
  if (activeEmail === notice.email) {
    sessionStorage.setItem(FORCED_PASSWORD_CHANGED_NOTICE_KEY, notice.id);
  }
}

export function getPasswordChangedNoticeToShow(): PasswordChangedNoticePayload | null {
  if (typeof window === "undefined") return null;

  const notice = getPendingPasswordChangedNotice();
  if (!notice) return null;

  const lastSeenId = sessionStorage.getItem(LAST_SEEN_PASSWORD_CHANGED_NOTICE_KEY);
  if (lastSeenId === notice.id) return null;

  const forcedId = getForcedPasswordChangedNoticeId();
  const activeEmail = getActiveAccountEmail();

  if (forcedId === notice.id || activeEmail === notice.email) {
    return notice;
  }

  return null;
}

export function markPasswordChangedNoticeSeen(noticeId: string): void {
  if (typeof window === "undefined" || !noticeId) return;

  sessionStorage.setItem(LAST_SEEN_PASSWORD_CHANGED_NOTICE_KEY, noticeId);

  if (sessionStorage.getItem(FORCED_PASSWORD_CHANGED_NOTICE_KEY) === noticeId) {
    sessionStorage.removeItem(FORCED_PASSWORD_CHANGED_NOTICE_KEY);
  }
}

export function shouldSuppressDefaultLoginModal(): boolean {
  if (typeof window === "undefined") return false;

  const params = new URLSearchParams(window.location.search);

  if (params.get("reset_token") || params.get("token")) {
    return true;
  }

  if (params.get("login_prompt") === "1") {
    return true;
  }

  if (params.get(PASSWORD_CHANGED_QUERY_PARAM) === "1") {
    return true;
  }

  return !!getPasswordChangedNoticeToShow();
}

export async function resolveAuthenticatedUser(): Promise<User | null> {
  const cacheKey = getAuthenticatedUserCacheKey();
  const cachedUser = readCachedAuthenticatedUser(cacheKey);

  if (cachedUser !== undefined) {
    return cachedUser;
  }

  if (authenticatedUserPromise?.cacheKey === cacheKey) {
    return authenticatedUserPromise.promise;
  }

  const request = (async () => {
    const existingToken = getAccessToken();

    if (existingToken) {
      try {
        const user = await getCurrentUser(existingToken);
        setActiveAccountEmail(user.email);
        return storeCachedAuthenticatedUser(user);
      } catch (error) {
        if (isPasswordChangedReauthMessage(error instanceof Error ? error.message : "")) {
          clearAccessToken();
          clearActiveAccountEmail();
          storeCachedAuthenticatedUser(null);
          redirectToPasswordChangedLogin();
          return null;
        }

        // If the old access token is bad, I try refresh before giving up.
      }
    }

    try {
      const refreshResponse = await refreshAccessToken();
      setAccessToken(refreshResponse.access_token);
      const user = await getCurrentUser(refreshResponse.access_token);
      setActiveAccountEmail(user.email);
      return storeCachedAuthenticatedUser(user);
    } catch (error) {
      if (isPasswordChangedReauthMessage(error instanceof Error ? error.message : "")) {
        clearAccessToken();
        clearActiveAccountEmail();
        storeCachedAuthenticatedUser(null);
        redirectToPasswordChangedLogin();
        return null;
      }

      clearAccessToken();
      clearActiveAccountEmail();
      return storeCachedAuthenticatedUser(null);
    }
  })();

  authenticatedUserPromise = { cacheKey, promise: request };

  try {
    return await request;
  } finally {
    if (authenticatedUserPromise?.promise === request) {
      authenticatedUserPromise = null;
    }
  }
}
