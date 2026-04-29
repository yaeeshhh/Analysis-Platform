"use client";

import { useEffect, useMemo, useState } from "react";
import { usePathname, useSearchParams } from "next/navigation";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import {
  PASSWORD_CHANGED_QUERY_PARAM,
  REAUTH_PROMPT_STATE_EVENT,
  clearReauthPrompt,
  hasPendingReauthPrompt,
} from "@/lib/session";

function removeLoginPrompt(pathname: string, searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("login_prompt");
  next.delete(PASSWORD_CHANGED_QUERY_PARAM);
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function GlobalLoginPrompt() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [promptArmed, setPromptArmed] = useState(false);

  useEffect(() => {
    if (typeof window === "undefined") return;

    const syncPromptState = () => {
      setPromptArmed(hasPendingReauthPrompt());
    };

    syncPromptState();
    window.addEventListener(REAUTH_PROMPT_STATE_EVENT, syncPromptState);

    return () => {
      window.removeEventListener(REAUTH_PROMPT_STATE_EVENT, syncPromptState);
    };
  }, []);

  const onAuthPage = ["/login", "/signup", "/reset-password"].includes(pathname);
  const hasLoginPromptQuery = searchParams.get("login_prompt") === "1";
  const hasPasswordChangedQuery = searchParams.get(PASSWORD_CHANGED_QUERY_PARAM) === "1";

  const open =
    !onAuthPage &&
    !searchParams.get("reset_token") &&
    !searchParams.get("token") &&
    (hasLoginPromptQuery || promptArmed);

  const loginHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("login_prompt");
    next.delete(PASSWORD_CHANGED_QUERY_PARAM);
    const redirect = next.get("redirect");

    if (pathname === "/login" && (!redirect || !redirect.startsWith("/"))) {
      next.set("redirect", "/dashboard");
    }

    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const close = () => {
    clearReauthPrompt();

    if (hasLoginPromptQuery || hasPasswordChangedQuery) {
      window.history.replaceState(
        null,
        "",
        removeLoginPrompt(pathname, searchParams)
      );
    }
  };

  if (!open) return null;

  return (
    <LoginRequiredModal
      open={open}
      title="Sign in again"
      message="Use your new password to log back in."
      loginHref={loginHref}
      bypassFlowSuppression
      onDismiss={close}
      onLoginSuccess={close}
    />
  );
}
