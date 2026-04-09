"use client";

import { type CSSProperties, useEffect, useEffectEvent, useRef, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { clearAccessToken, getAccessToken } from "@/lib/api";
import { logout, type User } from "@/lib/auth";
import { clearUserScopedFrontendState } from "@/lib/helpers";
import { clearActiveAccountEmail, resolveAuthenticatedUser } from "@/lib/session";
import LoginRequiredModal from "@/components/ui/LoginRequiredModal";
import { LOGOUT_BROADCAST_KEY } from "@/components/ui/GlobalOverlays";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";

type ProfileMenuProps = {
  variant?: "default" | "sidebar";
  onSidebarAction?: () => void;
  disabled?: boolean;
};

function getInitials(user: User | null) {
  if (!user) return "?";

  const source = user.full_name || user.username || user.email || "Profile";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || source.charAt(0).toUpperCase();
}

function getCompactLabel(user: User | null) {
  if (!user) return "Log in";

  const primary = user.full_name || user.username || user.email || "Profile";
  return primary.split(/\s+/).filter(Boolean)[0] || primary;
}

export default function ProfileMenu({ variant = "default", onSidebarAction, disabled = false }: ProfileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [user, setUser] = useState<User | null | undefined>(undefined);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const currentPath = pathname || "/dashboard";
  const isSidebar = variant === "sidebar";
  const loading = user === undefined;
  const resolvedUser = user ?? null;
  const initials = getInitials(resolvedUser);
  const compactLabel = getCompactLabel(resolvedUser);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      const authenticatedUser = await resolveAuthenticatedUser();
      if (!active) return;
      setUser(authenticatedUser);
    };

    void bootstrap();

    const handleAuthChange = () => {
      if (!active) return;
      void bootstrap();
    };

    window.addEventListener("auth:logged-in", handleAuthChange);
    window.addEventListener("auth:logged-out", handleAuthChange);

    return () => {
      active = false;
      window.removeEventListener("auth:logged-in", handleAuthChange);
      window.removeEventListener("auth:logged-out", handleAuthChange);
    };
  }, []);

  const closeMenu = useEffectEvent(() => {
    setMenuOpen(false);
  });

  useEffect(() => {
    if (!menuOpen) return;

    const handleOutsideClick = (event: MouseEvent) => {
      if (!menuRef.current) return;
      if (!menuRef.current.contains(event.target as Node)) {
        closeMenu();
      }
    };

    document.addEventListener("mousedown", handleOutsideClick);
    return () => {
      document.removeEventListener("mousedown", handleOutsideClick);
    };
  }, [menuOpen]);

  useEffect(() => {
    closeMenu();
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen || !isSidebar) {
      setPopoverStyle(null);
      return;
    }

    const updateSidebarPopoverPosition = () => {
      if (!buttonRef.current || !popoverRef.current) return;

      const buttonRect = buttonRef.current.getBoundingClientRect();
      const popoverRect = popoverRef.current.getBoundingClientRect();
      const gutter = 16;
      const sidebarCollapsed =
        menuRef.current?.closest<HTMLElement>("[data-desktop-sidebar]")?.dataset.collapsed === "true";
      const popoverWidth = Math.min(popoverRect.width || 320, window.innerWidth - gutter * 2);

      let left = sidebarCollapsed ? buttonRect.right + 14 : buttonRect.left;
      left = Math.max(gutter, Math.min(left, window.innerWidth - popoverWidth - gutter));

      let top = buttonRect.top - popoverRect.height - 12;
      if (top < gutter) {
        top = Math.min(window.innerHeight - popoverRect.height - gutter, buttonRect.bottom + 12);
      }
      top = Math.max(gutter, top);

      setPopoverStyle({
        left: `${Math.round(left)}px`,
        top: `${Math.round(top)}px`,
        width: `${Math.round(popoverWidth)}px`,
      });
    };

    let scrollRafId = 0;
    const debouncedUpdate = () => {
      window.cancelAnimationFrame(scrollRafId);
      scrollRafId = window.requestAnimationFrame(updateSidebarPopoverPosition);
    };

    const frame = window.requestAnimationFrame(updateSidebarPopoverPosition);
    window.addEventListener("resize", debouncedUpdate);
    window.addEventListener("scroll", debouncedUpdate, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.cancelAnimationFrame(scrollRafId);
      window.removeEventListener("resize", debouncedUpdate);
      window.removeEventListener("scroll", debouncedUpdate, true);
    };
  }, [isSidebar, menuOpen]);

  async function handleLoginSuccess() {
    const authenticatedUser = await resolveAuthenticatedUser();
    setUser(authenticatedUser);
    setShowLoginModal(false);
  }

  async function handleLogout() {
    const token = getAccessToken();

    try {
      if (token) {
        await logout(token);
      }
    } catch {
      // Even if logout fails server-side, I still clear the local session so the UI does not get stuck.
    } finally {
      clearAccessToken();
      clearActiveAccountEmail();
      clearUserScopedFrontendState();
      localStorage.setItem(LOGOUT_BROADCAST_KEY, Date.now().toString());
      setMenuOpen(false);
      setUser(null);
      window.dispatchEvent(new CustomEvent("auth:logged-out"));
      router.replace("/dashboard");
    }
  }

  if (loading) {
    return (
      <div className={isSidebar ? "profile-menu-sidebar-button profile-menu-sidebar-button-loading" : "profile-menu-compact-button profile-menu-compact-button-loading"}>
        {isSidebar ? (
          <>
            <span className="profile-menu-avatar profile-menu-avatar-loading">
              <span className="button-live-loader" aria-hidden="true" />
            </span>
            <span className="profile-menu-copy">
              <span className="profile-menu-name">Loading</span>
              <span className="profile-menu-subtitle">Account tools</span>
            </span>
          </>
        ) : (
          <>
            <span className="profile-menu-compact-avatar">
              <span className="button-live-loader" aria-hidden="true" />
            </span>
            <span className="profile-menu-compact-label">Loading</span>
          </>
        )}
      </div>
    );
  }

  return (
    <div className={isSidebar ? "profile-menu-shell profile-menu-shell-sidebar" : "relative"} ref={menuRef}>
      <LoginRequiredModal
        open={showLoginModal}
        title="Login to continue"
        message="Log in to access your account, saved runs, and history."
        loginHref={currentPath}
        onDismiss={() => setShowLoginModal(false)}
        onLoginSuccess={() => {
          void handleLoginSuccess();
        }}
      />

      <button
        ref={buttonRef}
        type="button"
        onClick={() => {
          if (disabled) {
            return;
          }

          if (!user) {
            if (isSidebar) {
              onSidebarAction?.();
            }
            setMenuOpen(false);
            setShowLoginModal(true);
            return;
          }

          if (isSidebar) {
            setMenuOpen(false);
            onSidebarAction?.();
            if (currentPath !== "/account") {
              router.push("/account");
            }
            return;
          }

          setMenuOpen((previous) => !previous);
        }}
        className={isSidebar ? "profile-menu-sidebar-button" : "profile-menu-compact-button"}
        disabled={disabled}
        aria-haspopup={!isSidebar && user ? "menu" : undefined}
        aria-expanded={!isSidebar && user ? menuOpen : undefined}
        aria-disabled={disabled || undefined}
        tabIndex={disabled ? -1 : undefined}
      >
        {isSidebar ? (
          <>
            <span className="profile-menu-avatar">{initials}</span>
            <span className="profile-menu-copy">
              <span className="profile-menu-name">{user ? user.full_name || user.username || "Profile" : "Log in"}</span>
              <span className="profile-menu-subtitle">{user ? "Open account page" : "Access saved runs"}</span>
            </span>
          </>
        ) : (
          <>
            <span className="profile-menu-compact-avatar">{user ? initials : "?"}</span>
            <span className="profile-menu-compact-label">{compactLabel}</span>
            <span className="profile-menu-compact-chevron" aria-hidden="true">
              <svg viewBox="0 0 24 24" className="h-3.5 w-3.5" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="m9 6 6 6-6 6" />
              </svg>
            </span>
          </>
        )}
      </button>

      {!isSidebar && menuOpen && user ? (
        <div
          ref={popoverRef}
          className={isSidebar ? "profile-menu-popover profile-menu-popover-sidebar" : "profile-menu-popover profile-menu-popover-default"}
          style={
            isSidebar
              ? popoverStyle
                ? { ...popoverStyle, visibility: "visible" }
                : { visibility: "hidden" }
              : undefined
          }
        >
          <div className="space-y-4">
            <div className="rounded-[18px] border border-[#a78bfa]/20 bg-[#111827] p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-[#a78bfa]">Signed in</p>
              <p className="mt-2 truncate text-sm font-medium text-[#f1f5f9]">{user.full_name || user.username || "Profile"}</p>
              <p className="mt-1 truncate text-sm text-[#94a3b8]">{user.email}</p>
            </div>

            <div className="space-y-2">
              <ScrollIntentLink
                href="/account"
                targetId="account-first-block"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/5 bg-[#111827] px-4 py-2.5 text-sm font-medium text-[#f1f5f9] transition hover:bg-[#1a2332]"
              >
                Account center
              </ScrollIntentLink>
              <ScrollIntentLink
                href="/batch"
                targetId="batch-primary-section"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/5 bg-[#111827] px-4 py-2.5 text-sm font-medium text-[#f1f5f9] transition hover:bg-[#1a2332]"
              >
                Upload studio
              </ScrollIntentLink>
              <ScrollIntentLink
                href="/history"
                targetId="history-first-block"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/5 bg-[#111827] px-4 py-2.5 text-sm font-medium text-[#f1f5f9] transition hover:bg-[#1a2332]"
              >
                History archive
              </ScrollIntentLink>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              className="w-full rounded-lg border border-[#dc2626]/25 bg-[#dc2626]/10 px-4 py-2.5 text-left text-sm font-medium text-[#f87171] transition hover:bg-[#dc2626]/15"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}