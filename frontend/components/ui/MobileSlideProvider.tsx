"use client";

import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from "react";
import { usePathname } from "next/navigation";

type SlidePageEntry = {
  id: string;
  title: string;
  accent?: string;
  content: ReactNode;
};

type MobileSlideContextType = {
  push: (entry: SlidePageEntry) => void;
  pop: () => void;
  stack: SlidePageEntry[];
};

const MobileSlideContext = createContext<MobileSlideContextType>({
  push: () => {},
  pop: () => {},
  stack: [],
});

export function useMobileSlide() {
  return useContext(MobileSlideContext);
}

export function MobileSlideProvider({ children }: { children: ReactNode }) {
  const [stack, setStack] = useState<SlidePageEntry[]>([]);
  const scrollPositions = useRef<number[]>([]);
  const pathname = usePathname();

  const push = useCallback((entry: SlidePageEntry) => {
    scrollPositions.current.push(window.scrollY);
    setStack((prev) => [...prev, entry]);
    requestAnimationFrame(() => window.scrollTo(0, 0));
  }, []);

  const pop = useCallback(() => {
    setStack((prev) => {
      const next = prev.slice(0, -1);
      const savedScroll = scrollPositions.current.pop();
      if (savedScroll !== undefined) {
        requestAnimationFrame(() => window.scrollTo(0, savedScroll));
      }
      return next;
    });
  }, []);

  // Close all slides on route change
  useEffect(() => {
    if (stack.length > 0) {
      setStack([]);
      scrollPositions.current = [];
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  // Close all slides on browser back
  useEffect(() => {
    const handlePopState = () => {
      if (stack.length > 0) {
        setStack([]);
        scrollPositions.current = [];
      }
    };
    window.addEventListener("popstate", handlePopState);
    return () => window.removeEventListener("popstate", handlePopState);
  }, [stack.length]);

  return (
    <MobileSlideContext.Provider value={{ push, pop, stack }}>
      {children}
      {stack.map((entry, index) => (
        <SlidePage key={entry.id} entry={entry} onBack={pop} depth={index} />
      ))}
    </MobileSlideContext.Provider>
  );
}

function SlidePage({ entry, onBack, depth }: { entry: SlidePageEntry; onBack: () => void; depth: number }) {
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    requestAnimationFrame(() => setVisible(true));
  }, []);

  return (
    <div
      className="mobile-slide-page"
      style={{
        transform: visible ? "translateX(0)" : "translateX(100%)",
        zIndex: 60 + depth,
      }}
    >
      <header className="mobile-slide-header">
        <button type="button" onClick={onBack} className="mobile-slide-back">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" className="h-5 w-5">
            <polyline points="15 18 9 12 15 6" />
          </svg>
          <span>Back</span>
        </button>
        <p className="mobile-slide-title">
          {entry.accent ? (
            <span className="text-xs uppercase tracking-[0.2em] opacity-60" style={{ color: entry.accent }}>{entry.title}</span>
          ) : (
            entry.title
          )}
        </p>
      </header>
      <div className="mobile-slide-body">
        {entry.content}
      </div>
    </div>
  );
}
