"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileMenu from "@/components/ui/ProfileMenu";

const SIDEBAR_STORAGE_KEY = "analysis-studio:desktop-sidebar-collapsed";

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
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    let frame = 0;

    try {
      const nextCollapsed = window.localStorage.getItem(SIDEBAR_STORAGE_KEY) === "true";
      if (nextCollapsed) {
        frame = window.requestAnimationFrame(() => {
          setCollapsed(true);
        });
      }
    } catch {
      // Ignore storage failures so the sidebar still works in restricted browsers.
    }

    return () => {
      if (frame) {
        window.cancelAnimationFrame(frame);
      }
    };
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_STORAGE_KEY, collapsed ? "true" : "false");
    } catch {
      // Ignore storage failures so the sidebar still works in restricted browsers.
    }

    const sidebar = surfaceRef.current?.closest<HTMLElement>("[data-desktop-sidebar]");
    if (sidebar) {
      sidebar.dataset.collapsed = collapsed ? "true" : "false";
    }

    return () => {
      if (sidebar) {
        delete sidebar.dataset.collapsed;
      }
    };
  }, [collapsed]);

  useEffect(() => {
    if (collapsed) return;

    const sidebar = surfaceRef.current?.closest<HTMLElement>("[data-desktop-sidebar]");
    if (!sidebar) return;

    const desktopMediaQuery = window.matchMedia("(min-width: 600px)");

    const handleOutsideInteraction = (event: PointerEvent | FocusEvent) => {
      if (!desktopMediaQuery.matches) return;
      const target = event.target as Node | null;
      if (!target || sidebar.contains(target)) return;
      setCollapsed(true);
    };

    document.addEventListener("pointerdown", handleOutsideInteraction);
    document.addEventListener("focusin", handleOutsideInteraction);

    return () => {
      document.removeEventListener("pointerdown", handleOutsideInteraction);
      document.removeEventListener("focusin", handleOutsideInteraction);
    };
  }, [collapsed]);

  const linkClass = (match: string) =>
    `nav-link ${
      pathname === match || pathname.startsWith(`${match}/`)
        ? "nav-link-active"
        : ""
    }`;

  return (
    <div
      ref={surfaceRef}
      className={`nav-surface ${collapsed ? "nav-surface-collapsed" : ""}`}
      onClick={(event) => {
        if (!collapsed) return;
        const target = event.target as HTMLElement;
        if (target.closest("a, button")) return;
        setCollapsed(false);
      }}
    >
      <div className="desktop-sidebar-brand">
        <div className="desktop-sidebar-brand-lockup">
          {collapsed ? (
            <span className="nav-brand-monogram">AS</span>
          ) : (
            <div className="nav-brand-copy">
              <p className="nav-brand-title">Analysis Studio</p>
              <p className="nav-brand-subtitle">Tabular analysis workspace</p>
            </div>
          )}
        </div>
      </div>

      <p className="desktop-sidebar-label">Workspace</p>

      <div className="nav-links-scroll">
        <div className="nav-links-track">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.match)}
              title={collapsed ? item.label : undefined}
              aria-label={collapsed ? item.label : undefined}
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
        <ProfileMenu variant="sidebar" />
      </div>
    </div>
  );
}
