import Foundation
import UIKit
import WebKit

enum NativeAppBridge {
    static let messageHandlerName = "analysisStudioNative"

    static let bootstrapUserScript = WKUserScript(
        source: """
(() => {
  const channelName = 'analysisStudioNative';

  if (window.AnalysisStudioNative?.available) {
    return;
  }

  const postMessage = (message) => {
    const handler = window.webkit?.messageHandlers?.[channelName];
    if (!handler || typeof handler.postMessage !== 'function') {
      return false;
    }

    handler.postMessage(message);
    return true;
  };

  window.AnalysisStudioNative = Object.freeze({
    available: true,
    platform: 'ios',
    nativeShell: 'apple',
    postMessage,
        downloadTextFile(payload) {
            return postMessage({ type: 'downloadTextFile', payload });
        },
    openExternal(href) {
      return postMessage({ type: 'openExternal', href });
    },
    share(payload) {
      return postMessage({ type: 'share', payload });
    },
    log(message) {
      return postMessage({ type: 'log', message });
    },
  });

  window.__ANALYSIS_STUDIO_NATIVE_SHELL__ = 'apple';
  document.documentElement.dataset.nativeShell = 'apple';

  window.addEventListener('auth:logged-in', () => {
    postMessage({ type: 'auth', event: 'logged-in' });
  });

  window.addEventListener('auth:logged-out', () => {
    postMessage({ type: 'auth', event: 'logged-out' });
  });

  window.dispatchEvent(
    new CustomEvent('analysis-studio:native-ready', {
      detail: { platform: 'ios', nativeShell: 'apple' },
    })
  );
})();
""",
        injectionTime: .atDocumentStart,
        forMainFrameOnly: false
    )
}

@MainActor
final class NativeAppBridgeMessageHandler: NSObject, WKScriptMessageHandler {
    static let shared = NativeAppBridgeMessageHandler()

    func userContentController(_ userContentController: WKUserContentController, didReceive message: WKScriptMessage) {
        guard message.name == NativeAppBridge.messageHandlerName,
              let payload = message.body as? [String: Any],
              let type = payload["type"] as? String else {
            return
        }

        switch type {
        case "auth":
            handleAuthEvent(payload)
        case "log":
            handleLog(payload)
        case "openExternal":
            handleOpenExternal(payload)
        case "downloadTextFile":
            handleDownloadTextFile(payload)
        case "share":
            handleShare(payload)
        default:
            return
        }
    }

    private func handleAuthEvent(_ payload: [String: Any]) {
        guard let event = payload["event"] as? String else {
            return
        }

        if event == "logged-out" {
            DispatchQueue.main.asyncAfter(deadline: .now() + 0.1) {
                AppWebSession.reloadRegisteredWebViews()
            }
        }

#if DEBUG
        print("AnalysisStudio native auth event: \(event)")
#endif
    }

    private func handleLog(_ payload: [String: Any]) {
#if DEBUG
        if let message = payload["message"] as? String, !message.isEmpty {
            print("AnalysisStudio bridge log: \(message)")
        }
#endif
    }

    private func handleOpenExternal(_ payload: [String: Any]) {
        guard let href = payload["href"] as? String,
              let url = URL(string: href) else {
            return
        }

        UIApplication.shared.open(url)
    }

    private func handleShare(_ payload: [String: Any]) {
        let activityItems = shareItems(from: payload["payload"])
        presentActivityController(with: activityItems)
    }

    private func handleDownloadTextFile(_ payload: [String: Any]) {
        guard let downloadPayload = payload["payload"] as? [String: Any],
              let filename = downloadPayload["filename"] as? String,
              let text = downloadPayload["text"] as? String,
              let fileURL = writeDownloadFile(filename: filename, text: text) else {
            return
        }

        presentActivityController(with: [fileURL])
    }

    private func presentActivityController(with activityItems: [Any]) {
        guard !activityItems.isEmpty,
                            let presenter = topViewController(base: currentRootViewController()) else {
            return
        }

        let activityController = UIActivityViewController(
            activityItems: activityItems,
            applicationActivities: nil
        )

        if let popover = activityController.popoverPresentationController {
            popover.sourceView = presenter.view
            popover.sourceRect = CGRect(
                x: presenter.view.bounds.midX,
                y: presenter.view.bounds.maxY - 44,
                width: 1,
                height: 1
            )
        }

        presenter.present(activityController, animated: true)
    }

    private func writeDownloadFile(filename: String, text: String) -> URL? {
        let sanitizedFilename = sanitize(filename: filename)
        guard !sanitizedFilename.isEmpty else {
            return nil
        }

        let fileManager = FileManager.default
        let downloadsDirectory = fileManager.temporaryDirectory.appendingPathComponent(
            "AnalysisStudioDownloads",
            isDirectory: true
        )

        do {
            try fileManager.createDirectory(at: downloadsDirectory, withIntermediateDirectories: true)

            let fileURL = downloadsDirectory.appendingPathComponent(sanitizedFilename)
            if fileManager.fileExists(atPath: fileURL.path) {
                try fileManager.removeItem(at: fileURL)
            }

            try text.write(to: fileURL, atomically: true, encoding: .utf8)
            return fileURL
        } catch {
#if DEBUG
            print("AnalysisStudio bridge download error: \(error.localizedDescription)")
#endif
            return nil
        }
    }

    private func sanitize(filename: String) -> String {
        let trimmed = filename.trimmingCharacters(in: .whitespacesAndNewlines)
        if trimmed.isEmpty {
            return "analysis-report.txt"
        }

        let invalidCharacters = CharacterSet(charactersIn: "/\\:?%*|\"<>")
        return String(String.UnicodeScalarView(
            trimmed.unicodeScalars.map { scalar in
                invalidCharacters.contains(scalar) ? "-".unicodeScalars.first! : scalar
            }
        ))
    }

    private func shareItems(from payload: Any?) -> [Any] {
        if let text = payload as? String {
            let trimmed = text.trimmingCharacters(in: .whitespacesAndNewlines)
            return trimmed.isEmpty ? [] : [trimmed]
        }

        guard let dictionary = payload as? [String: Any] else {
            return []
        }

        var items: [Any] = []

        if let title = dictionary["title"] as? String,
           !title.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(title)
        }

        if let text = dictionary["text"] as? String,
           !text.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty {
            items.append(text)
        }

        if let href = dictionary["url"] as? String,
           let url = URL(string: href) {
            items.append(url)
        }

        return items
    }

    private func currentRootViewController() -> UIViewController? {
        UIApplication.shared.connectedScenes
            .compactMap { $0 as? UIWindowScene }
            .flatMap { $0.windows }
            .first { $0.isKeyWindow }?
            .rootViewController
    }

    private func topViewController(base: UIViewController?) -> UIViewController? {
        if let navigationController = base as? UINavigationController {
            return topViewController(base: navigationController.visibleViewController)
        }

        if let tabBarController = base as? UITabBarController {
            return topViewController(base: tabBarController.selectedViewController)
        }

        if let presentedController = base?.presentedViewController {
            return topViewController(base: presentedController)
        }

        return base
    }
}