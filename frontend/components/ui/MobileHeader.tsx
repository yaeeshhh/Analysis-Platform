import { Suspense, type ReactNode } from "react";
import BrandMark from "@/components/ui/BrandMark";
import ProfileMenu from "@/components/ui/ProfileMenu";

type MobileHeaderProps = {
  eyebrow?: ReactNode;
  title?: ReactNode;
};

export default function MobileHeader({ eyebrow, title }: MobileHeaderProps) {
  return (
    <header className="mobile-header phone-only">
      <span className="mobile-header-glare" aria-hidden="true" />
      <BrandMark compact withCopy={false} />
      <div className="mobile-header-copy">
        {eyebrow ? <span className="mobile-header-kicker">{eyebrow}</span> : null}
        <span className="mobile-header-title">{title || "Analysis Studio"}</span>
      </div>
      <Suspense fallback={<div className="profile-menu-compact-button profile-menu-compact-button-loading" />}>
        <ProfileMenu />
      </Suspense>
    </header>
  );
}
