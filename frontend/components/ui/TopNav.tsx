"use client";

import { useEffect, useLayoutEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileMenu from "@/components/ui/ProfileMenu";
import BrandMark from "@/components/ui/BrandMark";

const SIDEBAR_OPEN_DELAY_MS = 220;

const navItems = [
  { href: "/dashboard", label: "Dashboard", match: "/dashboard", icon: "dashboard" },
  { href: "/batch", label: "Uploads", match: "/batch", icon: "uploads" },
  { href: "/analysis", label: "Analysis", match: "/analysis", icon: "analysis" },
  { href: "/history", label: "History", match: "/history", icon: "history" },
  { href: "/account", label: "Account", match: "/account", icon: "account" },
];

function NavIcon({ kind }: { kind: (typeof navItems)[number]["icon"] }) {
  switch (kind) {
    case "dashboard":
      return (
        <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <rect x="1" y="1" width="5" height="5" rx="1.5" fill="currentColor" />
          <rect x="9" y="1" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5" />
          <rect x="1" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5" />
          <rect x="9" y="9" width="5" height="5" rx="1.5" fill="currentColor" opacity="0.5" />
        </svg>
      );
    case "uploads":
      return (
        <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <path d="M2 3h11M2 7h11M2 11h7" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
        </svg>
      );
    case "analysis":
      return (
        <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M5 7.5h5M7.5 5v5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "history":
      return (
        <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <circle cx="7.5" cy="7.5" r="5.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M7.5 4.5V7.5l2 2" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    case "account":
      return (
        <svg viewBox="0 0 15 15" fill="none" aria-hidden="true">
          <circle cx="7.5" cy="5" r="2.5" stroke="currentColor" strokeWidth="1.3" />
          <path d="M2.5 13c0-2.76 2.24-5 5-5s5 2.24 5 5" stroke="currentColor" strokeWidth="1.3" strokeLinecap="round" />
        </svg>
      );
    default:
      return null;
  }
}

export default function TopNav() {
  const pathname = usePathname();
  const surfaceRef = useRef<HTMLDivElement | null>(null);
  const interactiveTimerRef = useRef<number | null>(null);
  const [collapsed, setCollapsed] = useState(true);
  const [interactive, setInteractive] = useState(false);

  const clearInteractiveTimer = () => {
    if (interactiveTimerRef.current === null) {
      return;
    }

    window.clearTimeout(interactiveTimerRef.current);
    interactiveTimerRef.current = null;
  };

  const openNav = () => {
    if (!collapsed && interactive) {
      return;
    }

    setCollapsed(false);

    if (interactive) {
      return;
    }

    clearInteractiveTimer();
    interactiveTimerRef.current = window.setTimeout(() => {
      setInteractive(true);
      interactiveTimerRef.current = null;
    }, SIDEBAR_OPEN_DELAY_MS);
  };

  const closeNav = () => {
    clearInteractiveTimer();
    setInteractive(false);
    setCollapsed(true);
  };

  useEffect(() => {
    return () => {
      clearInteractiveTimer();
    };
  }, []);

  useLayoutEffect(() => {
    const sidebar = surfaceRef.current?.closest<HTMLElement>("[data-desktop-sidebar]");
    if (sidebar) {
      sidebar.dataset.collapsed = collapsed ? "true" : "false";
      sidebar.dataset.interactive = interactive ? "true" : "false";
    }

    return () => {
      if (sidebar) {
        delete sidebar.dataset.collapsed;
        delete sidebar.dataset.interactive;
      }
    };
  }, [collapsed, interactive]);

  const navInteractive = !collapsed && interactive;
  const contentCollapsed = collapsed;

  const linkClass = (match: string) =>
    `nav-link ${
      pathname === match || pathname.startsWith(`${match}/`)
        ? "nav-link-active"
        : ""
    }`;

  return (
    <div
      ref={surfaceRef}
      className={`nav-surface ${contentCollapsed ? "nav-surface-collapsed" : ""}`}
      data-interactive={navInteractive ? "true" : "false"}
      tabIndex={navInteractive ? -1 : 0}
      aria-label="Workspace navigation"
      onMouseEnter={openNav}
      onMouseLeave={closeNav}
      onFocusCapture={openNav}
      onBlurCapture={(event) => {
        const nextFocusTarget = event.relatedTarget as Node | null;
        if (!nextFocusTarget || !event.currentTarget.contains(nextFocusTarget)) {
          closeNav();
        }
      }}
      onKeyDown={(event) => {
        if (event.key !== "Escape") return;
        closeNav();
        const activeElement = document.activeElement;
        if (activeElement instanceof HTMLElement && event.currentTarget.contains(activeElement)) {
          activeElement.blur();
        }
      }}
    >
      <span className="nav-surface-glare" aria-hidden="true" />

      <div className="desktop-sidebar-brand">
        <div className="desktop-sidebar-brand-lockup">
          <BrandMark compact={contentCollapsed} withCopy={!contentCollapsed} withTagline={false} />
        </div>
      </div>

      <div className={`nav-links-scroll ${contentCollapsed ? "nav-links-scroll-collapsed" : ""}`}>
        <div className={`nav-links-track ${contentCollapsed ? "nav-links-track-collapsed" : ""}`}>
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={`${linkClass(item.match)} ${contentCollapsed ? "nav-link-collapsed" : ""}`}
              title={contentCollapsed ? item.label : undefined}
              aria-label={contentCollapsed ? item.label : undefined}
              aria-disabled={!navInteractive || undefined}
              tabIndex={navInteractive ? undefined : -1}
              onClick={(event) => {
                if (!navInteractive) {
                  event.preventDefault();
                }
              }}
            >
              <span className="nav-link-icon" aria-hidden="true">
                <NavIcon kind={item.icon} />
              </span>
              <span className="nav-link-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="desktop-sidebar-profile">
        <ProfileMenu variant="sidebar" disabled={!navInteractive} onSidebarAction={closeNav} />
      </div>
    </div>
  );
}
