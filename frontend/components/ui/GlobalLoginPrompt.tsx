"use client";

import { useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";

function removeLoginPrompt(pathname: string, searchParams: URLSearchParams): string {
  const next = new URLSearchParams(searchParams.toString());
  next.delete("login_prompt");
  const qs = next.toString();
  return qs ? `${pathname}?${qs}` : pathname;
}

export default function GlobalLoginPrompt() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const open =
    !searchParams.get("reset_token") &&
    !searchParams.get("token") &&
    searchParams.get("login_prompt") === "1";

  const loginHref = useMemo(() => {
    const next = new URLSearchParams(searchParams.toString());
    next.delete("login_prompt");
    const redirect = next.get("redirect");

    if (pathname === "/login" && (!redirect || !redirect.startsWith("/"))) {
      next.set("redirect", "/dashboard");
    }

    const qs = next.toString();
    return qs ? `${pathname}?${qs}` : pathname;
  }, [pathname, searchParams]);

  const close = () => {
    router.replace(removeLoginPrompt(pathname, searchParams), { scroll: false });
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
