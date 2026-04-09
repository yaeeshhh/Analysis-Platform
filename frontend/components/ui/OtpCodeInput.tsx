"use client";

import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type KeyboardEvent } from "react";

type OtpCodeInputProps = {
  value: string;
  onChange: (value: string) => void;
  onValidityChange?: (isValid: boolean) => void;
  onEnter?: () => void;
  disabled?: boolean;
  length?: number;
  idPrefix?: string;
};

export default function OtpCodeInput({
  value,
  onChange,
  onValidityChange,
  onEnter,
  disabled = false,
  length = 6,
  idPrefix = "otp-digit",
}: OtpCodeInputProps) {
  const [invalidIndices, setInvalidIndices] = useState<number[]>([]);
  const [focusedIndex, setFocusedIndex] = useState<number | null>(null);
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const hasAutoFocusedRef = useRef(false);

  const digits = useMemo(
    () => Array.from({ length }, (_, index) => value[index] || ""),
    [value, length]
  );

  useEffect(() => {
    onValidityChange?.(invalidIndices.length === 0);
  }, [invalidIndices, onValidityChange]);

  useEffect(() => {
    if (disabled) {
      hasAutoFocusedRef.current = false;
      return;
    }

    if (hasAutoFocusedRef.current) {
      return;
    }

    const firstEmptyIndex = digits.findIndex((digit) => digit === "");
    const targetIndex = firstEmptyIndex === -1 ? 0 : firstEmptyIndex;

    window.requestAnimationFrame(() => {
      inputRefs.current[targetIndex]?.focus();
      inputRefs.current[targetIndex]?.select();
    });

    hasAutoFocusedRef.current = true;
  }, [disabled, digits]);

  const invalidSet = useMemo(() => new Set(invalidIndices), [invalidIndices]);

  const emitDigits = (nextDigits: string[]) => {
    onChange(nextDigits.join(""));
  };

  const markInvalid = (index: number) => {
    setInvalidIndices((prev) => (prev.includes(index) ? prev : [...prev, index]));
  };

  const clearInvalid = (index: number) => {
    setInvalidIndices((prev) => prev.filter((item) => item !== index));
  };

  const handleDigitChange = (index: number, raw: string) => {
    const nextChar = raw.slice(-1);

    if (!nextChar) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      clearInvalid(index);
      emitDigits(nextDigits);
      return;
    }

    if (!/^[0-9]$/.test(nextChar)) {
      const nextDigits = [...digits];
      nextDigits[index] = "";
      markInvalid(index);
      emitDigits(nextDigits);
      return;
    }

    const nextDigits = [...digits];
    nextDigits[index] = nextChar;
    clearInvalid(index);
    emitDigits(nextDigits);

    if (index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      inputRefs.current[index + 1]?.select();
    }
  };

  const handleKeyDown = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === "Enter") {
      onEnter?.();
      return;
    }

    if (event.key === "Backspace") {
      if (digits[index]) {
        const nextDigits = [...digits];
        nextDigits[index] = "";
        clearInvalid(index);
        emitDigits(nextDigits);
        return;
      }

      if (index > 0) {
        const previousIndex = index - 1;
        const nextDigits = [...digits];
        nextDigits[previousIndex] = "";
        clearInvalid(previousIndex);
        emitDigits(nextDigits);
        inputRefs.current[previousIndex]?.focus();
      }
      return;
    }

    if (event.key === "ArrowLeft" && index > 0) {
      inputRefs.current[index - 1]?.focus();
      return;
    }

    if (event.key === "ArrowRight" && index < length - 1) {
      inputRefs.current[index + 1]?.focus();
      return;
    }
  };

  const handlePaste = (index: number, event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    const pasted = event.clipboardData.getData("text").trim();

    if (!pasted) return;

    const onlyDigits = pasted.replace(/\D/g, "");
    if (!onlyDigits) {
      markInvalid(index);
      return;
    }

    const nextDigits = [...digits];
    let writeIndex = index;
    for (const char of onlyDigits) {
      if (writeIndex >= length) break;
      nextDigits[writeIndex] = char;
      clearInvalid(writeIndex);
      writeIndex += 1;
    }
    emitDigits(nextDigits);

    const nextFocus = Math.min(writeIndex, length - 1);
    inputRefs.current[nextFocus]?.focus();
  };

  return (
    <div className="space-y-2">
      <div className="grid grid-cols-6 gap-2">
        {digits.map((digit, index) => (
          <div key={`${idPrefix}-${index}`}>
            <input
              id={`${idPrefix}-${index}`}
              ref={(node) => {
                inputRefs.current[index] = node;
              }}
              type="text"
              enterKeyHint="done"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]*"
              maxLength={1}
              value={digit}
              onChange={(event) => handleDigitChange(index, event.target.value)}
              onKeyDown={(event) => handleKeyDown(index, event)}
              onPaste={(event) => handlePaste(index, event)}
              onFocus={() => setFocusedIndex(index)}
              onBlur={() => setFocusedIndex((current) => (current === index ? null : current))}
              disabled={disabled}
              className={`w-full rounded-[10px] border px-0 py-2 text-center text-base text-white outline-none transition ${
                focusedIndex === index ? "scale-[1.07]" : "scale-100"
              } ${
                invalidSet.has(index)
                  ? "border-[#ff6b6b] bg-[#2a1215]"
                  : "border-white/10 bg-[#111116]"
              } disabled:opacity-60`}
            />
          </div>
        ))}
      </div>
      {invalidIndices.length > 0 && (
        <p className="text-[11px] leading-4 text-[#ff8b94]">Numeric format only</p>
      )}
    </div>
  );
}