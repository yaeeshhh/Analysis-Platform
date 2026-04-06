"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import GlobalLoginPrompt from "@/components/ui/GlobalLoginPrompt";
import GlobalResetPasswordModal from "@/components/ui/GlobalResetPasswordModal";
import PasswordChangedNoticeModal from "@/components/ui/PasswordChangedNoticeModal";
import {
  type PasswordChangedNoticePayload,
  getPasswordChangedNoticeToShow,
  markPasswordChangedNoticeSeen,
  primePasswordChangedNoticeForCurrentTab,
} from "@/lib/session";

export const LOGOUT_BROADCAST_KEY = "auth:logout-broadcast";

function withLoginPrompt(pathname: string, query: URLSearchParams): string {
  const next = new URLSearchParams(query.toString());
  next.delete("reset_token");
  next.delete("token");
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

    const notice = getPasswordChangedNoticeToShow();
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
