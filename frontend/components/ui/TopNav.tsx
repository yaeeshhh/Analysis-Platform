"use client";

import { usePathname } from "next/navigation";
import ProfileMenu from "@/components/ui/ProfileMenu";
import BrandMark from "@/components/ui/BrandMark";
import ScrollIntentLink from "@/components/ui/ScrollIntentLink";

const navItems = [
  { href: "/dashboard", label: "Dashboard", match: "/dashboard", targetId: null },
  { href: "/batch", label: "Uploads", match: "/batch", targetId: "batch-primary-section" },
  { href: "/analysis", label: "Analysis", match: "/analysis", targetId: "analysis-workspace-navigation" },
  { href: "/history", label: "History", match: "/history", targetId: "history-first-block" },
  { href: "/account", label: "Account", match: "/account", targetId: "account-first-block" },
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
    <div className="sticky top-0 z-40 -mx-4 px-4 md:-mx-6 md:px-6">
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
              <ScrollIntentLink
                key={item.href}
                href={item.href}
                targetId={item.targetId}
                scroll
                className={linkClass(item.match)}
              >
                <span className="nav-link-label">{item.label}</span>
              </ScrollIntentLink>
            ))}
          </div>
        </div>

        <div className="shrink-0">
          <ProfileMenu />
        </div>
      </div>
    </div>
  );
}
