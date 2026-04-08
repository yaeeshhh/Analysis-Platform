import { useRef, type TouchEventHandler } from "react";

type UseSwipeTabsOptions = {
  length: number;
  index: number;
  onChange: (nextIndex: number) => void;
  disabled?: boolean;
  threshold?: number;
};

export function useSwipeTabs({
  length,
  index,
  onChange,
  disabled = false,
  threshold = 44,
}: UseSwipeTabsOptions) {
  const startRef = useRef<{ x: number; y: number } | null>(null);
  const deltaRef = useRef({ x: 0, y: 0 });

  function resetGesture() {
    startRef.current = null;
    deltaRef.current = { x: 0, y: 0 };
  }

  const onTouchStart: TouchEventHandler<HTMLElement> = (event) => {
    if (disabled || length < 2) return;

    const touch = event.touches[0];
    if (!touch) return;

    startRef.current = { x: touch.clientX, y: touch.clientY };
    deltaRef.current = { x: 0, y: 0 };
  };

  const onTouchMove: TouchEventHandler<HTMLElement> = (event) => {
    if (!startRef.current) return;

    const touch = event.touches[0];
    if (!touch) return;

    deltaRef.current = {
      x: touch.clientX - startRef.current.x,
      y: touch.clientY - startRef.current.y,
    };
  };

  const onTouchEnd: TouchEventHandler<HTMLElement> = () => {
    if (!startRef.current) return;

    const { x, y } = deltaRef.current;
    resetGesture();

    if (Math.abs(x) < threshold || Math.abs(x) <= Math.abs(y) * 1.15) {
      return;
    }

    const direction = x < 0 ? 1 : -1;
    const nextIndex = Math.min(length - 1, Math.max(0, index + direction));
    if (nextIndex !== index) {
      onChange(nextIndex);
    }
  };

  const onTouchCancel: TouchEventHandler<HTMLElement> = () => {
    resetGesture();
  };

  return {
    onTouchStart,
    onTouchMove,
    onTouchEnd,
    onTouchCancel,
  };
}