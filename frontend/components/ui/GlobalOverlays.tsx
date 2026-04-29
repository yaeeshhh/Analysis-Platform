"use client";

import { useEffect, useRef, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import GlobalLoginPrompt from "@/components/ui/GlobalLoginPrompt";
import GlobalResetPasswordModal from "@/components/ui/GlobalResetPasswordModal";
import PasswordChangedNoticeModal from "@/components/ui/PasswordChangedNoticeModal";
import {
  armReauthPrompt,
  LOGIN_BROADCAST_KEY,
  PASSWORD_CHANGED_QUERY_PARAM,
  type PasswordChangedNoticePayload,
  dispatchLoggedInEvent,
  getActiveAccountEmail,
  getPasswordChangedNoticeToShow,
  markPasswordChangedNoticeSeen,
  primePasswordChangedNoticeForCurrentTab,
  readLoggedInBroadcastEmail,
  resolveAuthenticatedUser,
} from "@/lib/session";

export const LOGOUT_BROADCAST_KEY = "auth:logout-broadcast";
export const REAUTH_PROMPT_EVENT = "auth:reauth-prompt";

function withoutAuthFlowParams(pathname: string, query: URLSearchParams): string {
  const next = new URLSearchParams(query.toString());
  next.delete("reset_token");
  next.delete("token");
  next.delete(PASSWORD_CHANGED_QUERY_PARAM);
  next.delete("login_prompt");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function GlobalOverlays() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [passwordChangedNotice, setPasswordChangedNotice] = useState<PasswordChangedNoticePayload | null>(null);
  const dismissedPasswordChangedNoticeIdRef = useRef<string | null>(null);
  const searchParamsKey = searchParams.toString();

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setMounted(true);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, []);

  useEffect(() => {
    if (!mounted) return;

    const currentSearchParams = new URLSearchParams(searchParamsKey);

    const notice =
      getPasswordChangedNoticeToShow() ??
      (currentSearchParams.get(PASSWORD_CHANGED_QUERY_PARAM) === "1"
        ? { id: "password-changed-query", email: "" }
        : null);

    if (!notice) {
      dismissedPasswordChangedNoticeIdRef.current = null;
      return;
    }

    if (dismissedPasswordChangedNoticeIdRef.current === notice.id) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      setPasswordChangedNotice(notice);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mounted, pathname, searchParamsKey]);

  useEffect(() => {
    function handleStorageAuth(e: StorageEvent) {
      if (e.key === LOGIN_BROADCAST_KEY && e.newValue) {
        dismissedPasswordChangedNoticeIdRef.current = null;
        setPasswordChangedNotice(null);
        dispatchLoggedInEvent(readLoggedInBroadcastEmail(e.newValue));
        return;
      }

      if (e.key === LOGOUT_BROADCAST_KEY && e.newValue) {
        primePasswordChangedNoticeForCurrentTab();
        window.location.reload();
      }
    }
    window.addEventListener("storage", handleStorageAuth);
    return () => window.removeEventListener("storage", handleStorageAuth);
  }, []);

  useEffect(() => {
    const handleLoggedIn = () => {
      dismissedPasswordChangedNoticeIdRef.current = null;
      setPasswordChangedNotice(null);

      if (
        searchParams.get("reset_token") ||
        searchParams.get("token") ||
        searchParams.get(PASSWORD_CHANGED_QUERY_PARAM) === "1" ||
        searchParams.get("login_prompt") === "1"
      ) {
        window.history.replaceState(
          null,
          "",
          withoutAuthFlowParams(pathname, searchParams)
        );
      }
    };

    window.addEventListener("auth:logged-in", handleLoggedIn);
    return () => {
      window.removeEventListener("auth:logged-in", handleLoggedIn);
    };
  }, [pathname, searchParams]);

  useEffect(() => {
    if (!mounted) return;
    if (["/login", "/signup", "/reset-password"].includes(pathname)) return;

    let disposed = false;

    const revalidateSession = async () => {
      if (disposed) return;
      if (document.visibilityState !== "visible") return;
      if (!getActiveAccountEmail()) return;

      await resolveAuthenticatedUser();
    };

    const handleVisibility = () => {
      void revalidateSession();
    };

    const intervalId = window.setInterval(() => {
      void revalidateSession();
    }, 120_000);

    window.addEventListener("focus", handleVisibility);
    document.addEventListener("visibilitychange", handleVisibility);
    void revalidateSession();

    return () => {
      disposed = true;
      window.clearInterval(intervalId);
      window.removeEventListener("focus", handleVisibility);
      document.removeEventListener("visibilitychange", handleVisibility);
    };
  }, [mounted, pathname]);

  if (!mounted) return null;

  return (
    <>
      <GlobalResetPasswordModal />
      <GlobalLoginPrompt />
      <PasswordChangedNoticeModal
        open={!!passwordChangedNotice}
        onContinue={() => {
          const nextPath = withoutAuthFlowParams(pathname, searchParams);
          const nextBasePath = nextPath.split("?", 1)[0] || pathname;

          const dismissedNoticeId = searchParams.get(PASSWORD_CHANGED_QUERY_PARAM)
            ? "password-changed-query"
            : passwordChangedNotice?.id ?? null;

          if (dismissedNoticeId) {
            dismissedPasswordChangedNoticeIdRef.current = dismissedNoticeId;
          }

          if (passwordChangedNotice) {
            markPasswordChangedNoticeSeen(passwordChangedNotice.id);
          }
          setPasswordChangedNotice(null);
          if (!["/login", "/signup", "/reset-password"].includes(nextBasePath)) {
            armReauthPrompt();
          }
          window.dispatchEvent(new CustomEvent(REAUTH_PROMPT_EVENT));
          window.history.replaceState(null, "", nextPath);
        }}
      />
    </>
  );
}
