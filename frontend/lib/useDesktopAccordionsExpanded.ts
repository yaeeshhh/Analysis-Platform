"use client";

import { useSyncExternalStore } from "react";

const DESKTOP_ACCORDION_MEDIA_QUERY = "(min-width: 960px)";

function subscribe(onStoreChange: () => void) {
  if (typeof window === "undefined") {
    return () => {};
  }

  const mediaQueryList = window.matchMedia(DESKTOP_ACCORDION_MEDIA_QUERY);

  if (typeof mediaQueryList.addEventListener === "function") {
    mediaQueryList.addEventListener("change", onStoreChange);
    return () => mediaQueryList.removeEventListener("change", onStoreChange);
  }

  mediaQueryList.addListener(onStoreChange);
  return () => mediaQueryList.removeListener(onStoreChange);
}

function getSnapshot() {
  if (typeof window === "undefined") {
    return true;
  }

  return window.matchMedia(DESKTOP_ACCORDION_MEDIA_QUERY).matches;
}

function getServerSnapshot() {
  return true;
}

export function useDesktopAccordionsExpanded() {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}