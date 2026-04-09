"use client";

import { useLayoutEffect, useRef } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileMenu from "@/components/ui/ProfileMenu";
import BrandMark from "@/components/ui/BrandMark";

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
  const collapsed = false;
  const interactive = true;

  useLayoutEffect(() => {
    const sidebar = surfaceRef.current?.closest<HTMLElement>("[data-desktop-sidebar]");
    if (sidebar) {
      sidebar.dataset.collapsed = "false";
      sidebar.dataset.interactive = "true";
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
      tabIndex={-1}
      aria-label="Workspace navigation"
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
        <ProfileMenu variant="sidebar" />
      </div>
    </div>
  );
}
