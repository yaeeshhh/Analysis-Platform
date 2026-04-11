import Foundation
import UIKit
import WebKit

private final class WeakWebViewBox {
    weak var webView: WKWebView?

    init(webView: WKWebView) {
        self.webView = webView
    }
}

@MainActor
enum AppWebSession {
    private static let websiteDataStore = WKWebsiteDataStore.default()
    private static let registeredWebViews = NSHashTable<WKWebView>.weakObjects()
    private static var registeredWebViewsByPath: [String: WeakWebViewBox] = [:]
    private static var pendingURLsByPath: [String: URL] = [:]
    private static let shellBackgroundColor = UIColor(
        red: 0.05,
        green: 0.08,
        blue: 0.12,
        alpha: 1
    )

    static func makeWebView(path: String) -> WKWebView {
        let configuration = WKWebViewConfiguration()
        configuration.websiteDataStore = websiteDataStore
        configuration.defaultWebpagePreferences.allowsContentJavaScript = true

        let userContentController = WKUserContentController()
        userContentController.addUserScript(NativeAppBridge.bootstrapUserScript)
        userContentController.add(NativeAppBridgeMessageHandler.shared, name: NativeAppBridge.messageHandlerName)
        configuration.userContentController = userContentController

        let webView = WKWebView(frame: .zero, configuration: configuration)
        webView.allowsBackForwardNavigationGestures = true
        webView.isOpaque = false
        webView.backgroundColor = shellBackgroundColor
        webView.scrollView.backgroundColor = shellBackgroundColor
        webView.customUserAgent = "AnalysisStudioAppleApp/1.0"

        if #available(iOS 17.0, *) {
            webView.underPageBackgroundColor = shellBackgroundColor
        }

        if let initialURL = pendingURLsByPath.removeValue(forKey: path) ?? AppEnvironment.embeddedRouteURL(path: path) {
            webView.load(URLRequest(url: initialURL))
        }

        registeredWebViews.add(webView)
        registeredWebViewsByPath[path] = WeakWebViewBox(webView: webView)
        return webView
    }

    static func load(url: URL, for path: String) {
        pruneReleasedWebViews()

        if let webView = registeredWebViewsByPath[path]?.webView {
            webView.load(URLRequest(url: url))
            return
        }

        pendingURLsByPath[path] = url
    }

    static func loadBaseRoute(for path: String) {
        guard let baseURL = AppEnvironment.embeddedRouteURL(path: path) else {
            return
        }

        load(url: baseURL, for: path)
    }

    static func reloadRegisteredWebViews() {
        pruneReleasedWebViews()

        for webView in registeredWebViews.allObjects {
            guard let currentURL = webView.url else {
                if let fallbackURL = AppEnvironment.embeddedRouteURL(path: "/dashboard") {
                    webView.load(URLRequest(url: fallbackURL))
                }
                continue
            }

            if let rewrittenURL = AppEnvironment.ensureEmbeddedShellQuery(for: currentURL) {
                webView.load(URLRequest(url: rewrittenURL))
            } else {
                webView.reload()
            }
        }
    }

    private static func pruneReleasedWebViews() {
        registeredWebViewsByPath = registeredWebViewsByPath.filter { $0.value.webView != nil }
    }
}