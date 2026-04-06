import { Suspense } from "react";
import BrandMark from "@/components/ui/BrandMark";
import ProfileMenu from "@/components/ui/ProfileMenu";

export default function MobileHeader() {
  return (
    <header className="mobile-header md:hidden">
      <BrandMark compact withCopy={false} />
      <span className="mobile-header-title">Analysis Studio</span>
      <Suspense fallback={<div className="h-9 w-16 rounded-full border border-white/10 bg-white/5" />}>
        <ProfileMenu />
      </Suspense>
    </header>
  );
}
