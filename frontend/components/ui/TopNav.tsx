"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import ProfileMenu from "@/components/ui/ProfileMenu";
import BrandMark from "@/components/ui/BrandMark";

const navItems = [
  { href: "/dashboard", label: "Dashboard", match: "/dashboard" },
  { href: "/batch", label: "Uploads", match: "/batch" },
  { href: "/analysis", label: "Analysis", match: "/analysis" },
  { href: "/history", label: "History", match: "/history" },
  { href: "/account", label: "Account", match: "/account" },
];

export default function TopNav() {
  const pathname = usePathname();

  const linkClass = (match: string) =>
    `nav-link md:w-full ${
      pathname === match || pathname.startsWith(`${match}/`)
        ? "nav-link-active"
        : ""
    }`;

  return (
    <div className="nav-surface">
      <div className="flex min-w-0 flex-1 items-center gap-3 md:max-w-[18rem] md:flex-none md:pr-2">
        <BrandMark compact withCopy={false} />
        <div className="nav-brand-copy hidden sm:block">
          <p className="nav-brand-title">Analysis Studio</p>
          <p className="nav-brand-subtitle">Tabular analysis workspace</p>
        </div>
      </div>

      <div className="nav-links-scroll md:flex-1">
        <div className="nav-links-track">
          {navItems.map((item) => (
            <Link
              key={item.href}
              href={item.href}
              className={linkClass(item.match)}
            >
              <span className="nav-link-label">{item.label}</span>
            </Link>
          ))}
        </div>
      </div>

      <div className="shrink-0">
        <ProfileMenu />
      </div>
    </div>
  );
}
