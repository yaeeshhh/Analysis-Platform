import { clearCurrentAnalysisSelection } from "./currentAnalysis";
import { clearActiveAccountEmail } from "./session";
export function formatDate(value?: string): string {
  if (!value) return "Unknown date";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function formatCountdown(totalSeconds: number): string {
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${String(minutes).padStart(2, "0")}:${String(seconds).padStart(2, "0")}`;
}

export function clearUserScopedFrontendState(): void {
  if (typeof window === "undefined") return;
  clearActiveAccountEmail();
  clearCurrentAnalysisSelection();
}

export function maskEmailAddress(email: string): string {
  const trimmed = email.trim();
  if (!trimmed.includes("@")) return trimmed;

  const [localPart, domainPart] = trimmed.split("@");
  if (!localPart || !domainPart) return trimmed;

  if (localPart.length <= 5) {
    return `${localPart}@${domainPart}`;
  }

  const visibleHead = localPart.slice(0, 5);
  const maskedTail = "*".repeat(localPart.length - 5);
  return `${visibleHead}${maskedTail}@${domainPart}`;
}

export function moveInputCaretToEnd(input: HTMLInputElement): void {
  if (typeof window === "undefined") return;

  window.requestAnimationFrame(() => {
    const length = input.value.length;
    try {
      input.setSelectionRange(length, length);
    } catch {
      // Some inputs do not support this, so I just leave the caret alone.
    }
  });
}