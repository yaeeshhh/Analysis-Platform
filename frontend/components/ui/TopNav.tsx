"use client";

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

  const linkClass = (match: string) =>
    `nav-link ${
      pathname === match || pathname.startsWith(`${match}/`)
        ? "nav-link-active"
        : ""
    }`;

  return (
    <div className="nav-surface">
      <div className="desktop-sidebar-brand">
        <BrandMark compact withCopy={false} />
        <div className="nav-brand-copy">
          <p className="nav-brand-title">Analysis Studio</p>
          <p className="nav-brand-subtitle">Tabular analysis workspace</p>
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
