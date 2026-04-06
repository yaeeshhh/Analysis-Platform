type PasswordStrengthLevel = "weak" | "medium" | "strong";

type PasswordStrengthState = {
  level: PasswordStrengthLevel;
  progressPercent: number;
  statusMessage: string | null;
  textClassName: string;
  barClassName: string;
};

function countMatches(password: string, pattern: RegExp): number {
  return (password.match(pattern) || []).length;
}

export function getFirstUnmetPasswordRequirement(password: string): string | null {
  if (password.length < 8) {
    return "Password must be at least 8 characters.";
  }

  if (!/[A-Z]/.test(password)) {
    return "Password must include at least one uppercase letter.";
  }

  if (!/\d/.test(password)) {
    return "Password must include at least one number.";
  }

  if (!/[^A-Za-z0-9]/.test(password)) {
    return "Password must include at least one symbol.";
  }

  if (/\s/.test(password)) {
    return "Password cannot contain spaces.";
  }

  return null;
}

export function validatePasswordPolicy(password: string): string | null {
  return getFirstUnmetPasswordRequirement(password);
}

export function getPasswordStrengthState(password: string): PasswordStrengthState {
  const trimmedPassword = password.trim();
  const baseRequirementError = getFirstUnmetPasswordRequirement(trimmedPassword);
  const hasMinLength = trimmedPassword.length >= 8;
  const hasUppercase = /[A-Z]/.test(trimmedPassword);
  const hasNumber = /\d/.test(trimmedPassword);
  const hasSymbol = /[^A-Za-z0-9]/.test(trimmedPassword);
  const hasNoSpaces = !/\s/.test(trimmedPassword);
  const baseRequirementsMet = [
    hasMinLength,
    hasUppercase,
    hasNumber,
    hasSymbol,
    hasNoSpaces,
  ].filter(Boolean).length;
  const numberCount = countMatches(trimmedPassword, /\d/g);
  const symbolCount = countMatches(trimmedPassword, /[^A-Za-z0-9]/g);
  const strongReady =
    !baseRequirementError &&
    trimmedPassword.length >= 11 &&
    numberCount >= 2 &&
    symbolCount >= 2 &&
    hasUppercase &&
    hasSymbol;

  if (!trimmedPassword) {
    return {
      level: "weak",
      progressPercent: 0,
      statusMessage: null,
      textClassName: "text-red-300",
      barClassName: "bg-red-400",
    };
  }

  if (strongReady) {
    return {
      level: "strong",
      progressPercent: 100,
      statusMessage: "Strong password.",
      textClassName: "text-emerald-300",
      barClassName: "bg-emerald-400",
    };
  }

  if (!baseRequirementError) {
    return {
      level: "medium",
      progressPercent: 68,
      statusMessage: "Medium password.",
      textClassName: "text-amber-300",
      barClassName: "bg-amber-400",
    };
  }

  return {
    level: "weak",
    progressPercent: Math.max(18, Math.round((baseRequirementsMet / 5) * 52)),
    statusMessage: baseRequirementError,
    textClassName: "text-red-300",
    barClassName: "bg-red-400",
  };
}
