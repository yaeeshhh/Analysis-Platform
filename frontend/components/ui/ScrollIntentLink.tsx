"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import type { MouseEvent } from "react";
import type { ComponentProps } from "react";
import {
  getDefaultNavigationTarget,
  queueNavigationScroll,
  triggerNavigationScroll,
} from "@/lib/navigationScroll";

type ScrollIntentLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  targetId?: string | null;
  delay?: number;
};

function getPathnameFromHref(href: string): string | null {
  if (!href.startsWith("/")) return null;
  return href.split("#")[0]?.split("?")[0] || "/";
}

function isModifiedEvent(event: MouseEvent<HTMLAnchorElement>) {
  return event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey;
}

export default function ScrollIntentLink({
  href,
  onClick,
  targetId,
  delay,
  scroll,
  ...props
}: ScrollIntentLinkProps) {
  const pathname = usePathname();
  const router = useRouter();
  const hrefPath = getPathnameFromHref(href);
  const resolvedTarget =
    targetId === undefined && hrefPath
      ? getDefaultNavigationTarget(hrefPath)
      : targetId ?? null;

  const handleClick = (event: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(event);
    if (event.defaultPrevented || !hrefPath || isModifiedEvent(event)) return;

    event.preventDefault();

    if (hrefPath === pathname) {
      triggerNavigationScroll(resolvedTarget, delay);
      return;
    }

    queueNavigationScroll(hrefPath, resolvedTarget, delay, true);
    router.push(href, { scroll: false });
  };

  return <Link href={href} scroll={hrefPath ? false : scroll} onClick={handleClick} {...props} />;
}