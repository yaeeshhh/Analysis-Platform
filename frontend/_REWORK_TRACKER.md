# UI Rework — Phase Tracker

## Status: Phase 1 in progress

---

## Phase 1 — Fix immediate desktop bugs ✅
1. [ ] Nav above hero spacing — add margin-top to hero so it doesn't overlap sticky nav
2. [ ] Stat cards sizing — add fluid sizing so cards scale between breakpoints
3. [ ] Hero-with-stats should go side-by-side at >=1024px not just >=1200px

## Phase 2 — PWA safe areas on iPhone
1. [ ] Add viewport-fit=cover meta tag in layout.tsx
2. [ ] Add safe-area-inset-top to mobile-header
3. [ ] Add safe-area-inset-left/right padding to mobile-shell-body
4. [ ] Test that content doesn't go off edges

## Phase 3 — Mobile native-app flow (major rework)
Goal: Remove block-based layout on mobile. Tappable sections open as "pages within tabs"
instead of expanding accordions. Like Teams, Instagram, etc.

1. [ ] Create MobilePageSlide component — slides in from right when a section is tapped
2. [ ] Each accordion becomes a list item that opens a slide-in page
3. [ ] Mobile analysis tabs: each tab opens as a slide page, not inline
4. [ ] Smaller font, tighter spacing on mobile
5. [ ] Dashboard: list items → slide pages
6. [ ] Batch: upload form stays, other sections → slide pages
7. [ ] History: list → tap to slide-in detail
8. [ ] Account: tool groups → slide-in pages

## Phase 4 — Desktop app-like navigation (major rework)
Goal: Desktop feels like a real app — pages from pages, popups, sidebar nav.
Like Apple Music, Instagram web, WhatsApp web.

1. [ ] Sidebar nav (left rail) instead of top nav bar
2. [ ] Main content area with page transitions
3. [ ] Detail panels/popups instead of everything on one page
4. [ ] Keep scroll actions but content is paginated
5. [ ] Analysis tabs as a proper tabbed interface in main content

---

## File inventory
- AppShell.tsx — main page wrapper, needs rework for both mobile and desktop
- TopNav.tsx — desktop nav, will become sidebar
- MobileNav.tsx — bottom tab bar (keep)
- MobileHeader.tsx — phone sticky header (keep)
- globals.css — all custom CSS
- layout.tsx — needs PWA meta tags
- DesktopAccordionOpener.tsx — may be removed if we change the pattern

## Key breakpoints
- < 600px: phone
- 600-1023px: tablet
- 1024-1199px: narrow desktop
- >= 1200px: wide desktop
