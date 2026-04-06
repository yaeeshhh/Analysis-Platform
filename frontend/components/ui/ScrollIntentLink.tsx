"use client";

import Link from "next/link";
import type { ComponentProps } from "react";

type ScrollIntentLinkProps = Omit<ComponentProps<typeof Link>, "href"> & {
  href: string;
  targetId?: string | null;
  delay?: number;
};

/**
 * Thin wrapper around Next.js Link. Scroll intent behavior has been removed;
 * navigation happens with default Next.js Link semantics.
 */
export default function ScrollIntentLink({
  href,
  targetId: _targetId,
  delay: _delay,
  scroll,
  ...props
}: ScrollIntentLinkProps) {
  return <Link href={href} scroll={scroll} {...props} />;
}