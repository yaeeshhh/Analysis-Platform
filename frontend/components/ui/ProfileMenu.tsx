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
};

function getInitials(user: User | null) {
  if (!user) return "?";

  const source = user.username || user.email || "Profile";
  return source
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part.charAt(0).toUpperCase())
    .join("") || source.charAt(0).toUpperCase();
}

export default function ProfileMenu({ variant = "default" }: ProfileMenuProps) {
  const router = useRouter();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement | null>(null);
  const buttonRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [loading, setLoading] = useState(true);
  const [user, setUser] = useState<User | null>(null);
  const [popoverStyle, setPopoverStyle] = useState<CSSProperties | null>(null);

  const currentPath = pathname || "/dashboard";
  const isSidebar = variant === "sidebar";
  const initials = getInitials(user);

  useEffect(() => {
    let active = true;

    const bootstrap = async () => {
      if (!active) return;
      setLoading(true);
      const authenticatedUser = await resolveAuthenticatedUser();
      if (!active) return;
      setUser(authenticatedUser);
      setLoading(false);
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

    const frame = window.requestAnimationFrame(updateSidebarPopoverPosition);
    window.addEventListener("resize", updateSidebarPopoverPosition);
    window.addEventListener("scroll", updateSidebarPopoverPosition, true);

    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("resize", updateSidebarPopoverPosition);
      window.removeEventListener("scroll", updateSidebarPopoverPosition, true);
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
      <div className={isSidebar ? "profile-menu-sidebar-button" : "rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm text-white/70"}>
        {isSidebar ? (
          <>
            <span className="profile-menu-avatar">...</span>
            <span className="profile-menu-copy">
              <span className="profile-menu-name">Loading</span>
              <span className="profile-menu-subtitle">Account tools</span>
            </span>
          </>
        ) : (
          "Profile"
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
          if (!user) {
            setMenuOpen(false);
            setShowLoginModal(true);
            return;
          }

          setMenuOpen((previous) => !previous);
        }}
        className={isSidebar ? "profile-menu-sidebar-button" : "max-w-[12rem] rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"}
        aria-haspopup="menu"
        aria-expanded={menuOpen}
      >
        {isSidebar ? (
          <>
            <span className="profile-menu-avatar">{initials}</span>
            <span className="profile-menu-copy">
              <span className="profile-menu-name">{user ? user.username || "Profile" : "Log in"}</span>
              <span className="profile-menu-subtitle">{user ? "Open account tools" : "Access saved runs"}</span>
            </span>
          </>
        ) : (
          <span className="block truncate">{user ? user.username || "Profile" : "Log in"}</span>
        )}
      </button>

      {menuOpen && user ? (
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
            <div className="rounded-[18px] border border-white/10 bg-black/10 p-4">
              <p className="text-xs uppercase tracking-[0.18em] text-white/42">Signed in</p>
              <p className="mt-2 truncate text-sm font-medium text-white">{user.username || "Profile"}</p>
              <p className="mt-1 truncate text-sm text-white/62">{user.email}</p>
            </div>

            <div className="space-y-2">
              <ScrollIntentLink
                href="/account"
                targetId="account-first-block"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                Account center
              </ScrollIntentLink>
              <ScrollIntentLink
                href="/batch"
                targetId="batch-primary-section"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                Upload studio
              </ScrollIntentLink>
              <ScrollIntentLink
                href="/history"
                targetId="history-first-block"
                onClick={() => setMenuOpen(false)}
                className="block rounded-lg border border-white/10 bg-white/5 px-4 py-2.5 text-sm font-medium text-white/85 transition hover:bg-white/10"
              >
                History archive
              </ScrollIntentLink>
            </div>
            <button
              type="button"
              onClick={() => {
                void handleLogout();
              }}
              className="w-full rounded-lg border border-[#5a2328] bg-[#2a1215] px-4 py-2.5 text-left text-sm font-medium text-[#ff8b94] transition hover:bg-[#34171b]"
            >
              Log out
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}