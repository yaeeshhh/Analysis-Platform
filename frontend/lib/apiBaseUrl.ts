const LOCAL_API_BASE_URL = "http://localhost:8000";
const PRODUCTION_API_BASE_URL =
  "https://analysis-platform-production.up.railway.app";

function isLocalHost(hostname: string): boolean {
  return hostname === "localhost" || hostname === "127.0.0.1";
}

function isProductionEnvironment(): boolean {
  return process.env.NODE_ENV === "production" || !!process.env.VERCEL_URL;
}

function isLocalApiUrl(url: string): boolean {
  try {
    const parsedUrl = new URL(url);
    return isLocalHost(parsedUrl.hostname);
  } catch {
    return false;
  }
}

function normalizeApiBaseUrl(url: string): string {
  const trimmedUrl = url.trim();

  if (!trimmedUrl) {
    return LOCAL_API_BASE_URL;
  }

  if (/^https?:\/\//i.test(trimmedUrl)) {
    return trimmedUrl.replace(/\/+$/, "");
  }

  if (
    trimmedUrl === "localhost" ||
    trimmedUrl === "127.0.0.1" ||
    trimmedUrl.startsWith("localhost:") ||
    trimmedUrl.startsWith("127.0.0.1:")
  ) {
    return `http://${trimmedUrl}`.replace(/\/+$/, "");
  }

  return `https://${trimmedUrl}`.replace(/\/+$/, "");
}

export function getApiBaseUrl(configuredUrl?: string | null): string {
  if (configuredUrl?.trim()) {
    const normalizedConfiguredUrl = normalizeApiBaseUrl(configuredUrl);

    if (isProductionEnvironment() && isLocalApiUrl(normalizedConfiguredUrl)) {
      return PRODUCTION_API_BASE_URL;
    }

    return normalizedConfiguredUrl;
  }

  if (typeof window !== "undefined") {
    return isLocalHost(window.location.hostname)
      ? LOCAL_API_BASE_URL
      : PRODUCTION_API_BASE_URL;
  }

  if (process.env.NODE_ENV === "production" || process.env.VERCEL_URL) {
    return PRODUCTION_API_BASE_URL;
  }

  return LOCAL_API_BASE_URL;
}

export { PRODUCTION_API_BASE_URL };