"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GlobalLoginPrompt from "@/components/ui/GlobalLoginPrompt";
import GlobalResetPasswordModal from "@/components/ui/GlobalResetPasswordModal";
import PasswordChangedNoticeModal from "@/components/ui/PasswordChangedNoticeModal";
import {
  PASSWORD_CHANGED_QUERY_PARAM,
  type PasswordChangedNoticePayload,
  getActiveAccountEmail,
  getPasswordChangedNoticeToShow,
  markPasswordChangedNoticeSeen,
  primePasswordChangedNoticeForCurrentTab,
  resolveAuthenticatedUser,
} from "@/lib/session";

export const LOGOUT_BROADCAST_KEY = "auth:logout-broadcast";

function withLoginPrompt(pathname: string, query: URLSearchParams): string {
  const next = new URLSearchParams(query.toString());
  next.delete("reset_token");
  next.delete("token");
  next.delete(PASSWORD_CHANGED_QUERY_PARAM);
  next.set("login_prompt", "1");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function GlobalOverlays() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [mounted, setMounted] = useState(false);
  const [passwordChangedNotice, setPasswordChangedNotice] = useState<PasswordChangedNoticePayload | null>(null);

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

    const notice =
      getPasswordChangedNoticeToShow() ??
      (searchParams.get(PASSWORD_CHANGED_QUERY_PARAM) === "1"
        ? { id: "password-changed-query", email: "" }
        : null);
    if (!notice) return;

    const frame = window.requestAnimationFrame(() => {
      setPasswordChangedNotice(notice);
    });

    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [mounted, pathname, searchParams]);

  useEffect(() => {
    function handleStorageLogout(e: StorageEvent) {
      if (e.key === LOGOUT_BROADCAST_KEY && e.newValue) {
        primePasswordChangedNoticeForCurrentTab();
        window.location.reload();
      }
    }
    window.addEventListener("storage", handleStorageLogout);
    return () => window.removeEventListener("storage", handleStorageLogout);
  }, []);

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
          if (passwordChangedNotice) {
            markPasswordChangedNoticeSeen(passwordChangedNotice.id);
          }
          setPasswordChangedNotice(null);
          router.replace(withLoginPrompt(pathname, searchParams), { scroll: false });
        }}
      />
    </>
  );
}
