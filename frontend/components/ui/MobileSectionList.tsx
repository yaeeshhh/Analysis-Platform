"use client";

import { type ReactNode } from "react";
import { useMobileSlide } from "@/components/ui/MobileSlideProvider";

export type MobileSection = {
  id: string;
  title: string;
  hint?: string;
  accent?: string;
  content: ReactNode;
};

type MobileSectionListProps = {
  sections: MobileSection[];
};

/**
 * Phone-only list of tappable rows. Each row opens a slide-in page
 * containing the section's content. On desktop, this component renders nothing.
 */
export default function MobileSectionList({ sections }: MobileSectionListProps) {
  const { push } = useMobileSlide();

  return (
    <div className="mobile-section-list">
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className="mobile-section-item"
          onClick={() =>
            push({
              id: section.id,
              title: section.title,
              accent: section.accent,
              content: section.content,
            })
          }
        >
          {section.accent ? (
            <span
              className="h-2 w-2 shrink-0 rounded-full"
              style={{ backgroundColor: section.accent }}
            />
          ) : null}
          <div className="mobile-section-item-label">
            <p className="mobile-section-item-title">{section.title}</p>
            {section.hint ? (
              <p className="mobile-section-item-hint">{section.hint}</p>
            ) : null}
          </div>
          <span className="mobile-section-item-chevron" aria-hidden="true">›</span>
        </button>
      ))}
    </div>
  );
}
