type NativeShellDownloadPayload = {
  filename: string;
  text: string;
  mimeType?: string;
};

type AnalysisStudioNativeBridge = {
  available?: boolean;
  nativeShell?: string;
  downloadTextFile?: (payload: NativeShellDownloadPayload) => boolean | void;
};

declare global {
  interface Window {
    AnalysisStudioNative?: AnalysisStudioNativeBridge;
    __ANALYSIS_STUDIO_NATIVE_SHELL__?: string;
  }
}

function getNativeBridge() {
  if (typeof window === "undefined") {
    return null;
  }

  return window.AnalysisStudioNative ?? null;
}

export function isAppleNativeShell() {
  if (typeof window === "undefined") {
    return false;
  }

  if (window.__ANALYSIS_STUDIO_NATIVE_SHELL__ === "apple") {
    return true;
  }

  if (window.AnalysisStudioNative?.nativeShell === "apple") {
    return true;
  }

  return new URLSearchParams(window.location.search).get("nativeShell") === "apple";
}

export async function tryNativeTextDownload(filename: string, blob: Blob) {
  const bridge = getNativeBridge();
  if (!isAppleNativeShell() || typeof bridge?.downloadTextFile !== "function") {
    return false;
  }

  const text = await blob.text();
  return bridge.downloadTextFile({
    filename,
    text,
    mimeType: blob.type || "text/plain;charset=utf-8",
  }) !== false;
}