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
      <BrandMark compact withCopy={false} />
      <div className="mobile-header-copy">
        {eyebrow ? <span className="mobile-header-kicker">{eyebrow}</span> : null}
        <span className="mobile-header-title">{title || "Analysis Studio"}</span>
      </div>
      <Suspense fallback={<div className="h-9 w-16 rounded-lg border border-white/10 bg-white/5" />}>
        <ProfileMenu />
      </Suspense>
    </header>
  );
}
