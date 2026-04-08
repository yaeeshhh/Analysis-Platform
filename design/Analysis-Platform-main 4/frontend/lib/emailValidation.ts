const SIGNUP_EMAIL_REGEX =
  /^[a-z0-9-]+(?:\.[a-z0-9-]+)*@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/i;

export function isSignupEmailValid(email: string): boolean {
  return SIGNUP_EMAIL_REGEX.test(email.trim().toLowerCase());
}

export function getEmailValidationError(email: string): string {
  if (/\s/.test(email)) return "Email can't contain whitespace";

  const raw = email.trim();
  if (!raw) return "Enter a valid email address";

  const invalidChar = raw.match(/[^a-z0-9@.\-]/i);
  if (invalidChar) return `Email cannot contain '${invalidChar[0]}'`;

  if (raw.endsWith(".")) {
    return "No trailing . in email";
  }

  if (/[@-]$/.test(raw)) {
    return "Email cannot end with a symbol";
  }

  const atIndex = raw.indexOf("@");
  const atCount = (raw.match(/@/g) || []).length;
  if (atIndex === -1 || atCount > 1) return "Enter a valid email address";

  const localPart = raw.slice(0, atIndex);
  const domainPart = raw.slice(atIndex + 1);

  if (!localPart || !domainPart) return "Enter a valid email address";
  if (domainPart.includes("..")) return "Email domain cannot contain consecutive dots";
  if (domainPart.startsWith(".") || domainPart.endsWith(".")) {
    return "Email domain is invalid";
  }

  return "Enter a valid email address";
}
