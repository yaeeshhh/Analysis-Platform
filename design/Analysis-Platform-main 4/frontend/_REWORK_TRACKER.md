# UI Rework — Phase Tracker

## Status: Phase 3 COMPLETE — Phase 4 next

---

## Phase 1 — Fix immediate desktop bugs ✅ (commit a3d0752)
- [x] Nav above hero spacing
- [x] Stat cards fluid sizing with clamp()
- [x] Hero-with-stats side-by-side at >=1024px

## Phase 2 — PWA safe areas on iPhone ✅ (commit a3d0752)
- [x] viewport-fit=cover, apple-mobile-web-app-capable
- [x] Safe-area-inset-top/left/right on mobile-header
- [x] Safe-area-inset-left/right on mobile-shell-body and bottom nav

## Phase 3 — Mobile native-app flow ✅ (commits 4fca9e6, 9b81a36)
- [x] MobileSlideProvider — context with push/pop stack, slide-in pages
- [x] MobileSectionList — phone-only tappable rows → slide pages
- [x] CSS: .mobile-slide-page, .mobile-section-list, etc.
- [x] Dashboard: 6 slide sections (workflow, pages, tabs, history, features, latest run)
- [x] Batch: phone upload form + 2 slide sections (dataset stats, saved runs)
- [x] Account: 4 slide sections (snapshot, profile, access, saved work)
- [x] History: search/filter + per-run slide sections with stats and actions
- [x] Analysis: 8 tab components as tappable slide sections on phone
- [x] All accordions marked tablet-up on converted pages
- [x] TypeScript clean

## Phase 4 — Desktop app-like navigation (NOT STARTED)
Goal: Desktop feels like a real app — pages from pages, popups, sidebar nav.
Like Apple Music, Instagram web, WhatsApp web.

1. [ ] Sidebar nav (left rail) instead of top nav bar
2. [ ] Main content area with page transitions
3. [ ] Detail panels/popups instead of everything on one page
4. [ ] Keep scroll actions but content is paginated
5. [ ] Analysis tabs as a proper tabbed interface in main content

## Key breakpoints
- < 600px: phone
- 600-1023px: tablet
- 1024-1199px: narrow desktop
- >= 1200px: wide desktop
