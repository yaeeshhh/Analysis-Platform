import SwiftUI
import UIKit
import WebKit

struct EmbeddedWebTabContainer: View {
    let selectedTab: AppTab

    var body: some View {
        if AppEnvironment.webBaseURL == nil {
            configurationErrorView
        } else {
            ZStack {
                ForEach(AppTab.allCases) { tab in
                    EmbeddedWebScreen(path: tab.routePath)
                        .opacity(selectedTab == tab ? 1 : 0)
                        .allowsHitTesting(selectedTab == tab)
                        .accessibilityHidden(selectedTab != tab)
                }
            }
        }
    }

    private var configurationErrorView: some View {
        VStack(spacing: 14) {
            Image(systemName: "gearshape.2")
                .font(.system(size: 32, weight: .semibold))
                .foregroundStyle(.white.opacity(0.88))

            Text("Set the web frontend URL before running the app.")
                .font(.headline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white)

            Text("Update ANALYSIS_STUDIO_WEB_BASE_URL in ios/project.yml to the deployed frontend domain, then regenerate the Xcode project.")
                .font(.subheadline)
                .multilineTextAlignment(.center)
                .foregroundStyle(.white.opacity(0.72))
                .frame(maxWidth: 420)
        }
        .padding(28)
    }
}

@MainActor
private struct EmbeddedWebScreen: View {
    @StateObject private var store: WebViewStore

    init(path: String) {
        _store = StateObject(wrappedValue: WebViewStore(path: path))
    }

    var body: some View {
        ZStack {
            HostedWebView(webView: store.webView, navigationDelegate: store)
                .background(Color.clear)
                .opacity(store.hasCompletedInitialLoad && store.loadErrorMessage == nil ? 1 : 0.001)
                .allowsHitTesting(store.hasCompletedInitialLoad && store.loadErrorMessage == nil)

            if let loadErrorMessage = store.loadErrorMessage {
                WebLoadFailureView(message: loadErrorMessage, retry: store.retry)
            } else if !store.hasCompletedInitialLoad {
                WebLoadPlaceholderView()
            }
        }
    }
}

@MainActor
private final class WebViewStore: NSObject, ObservableObject, WKNavigationDelegate {
    let webView: WKWebView
    private let path: String

    @Published private(set) var hasCompletedInitialLoad = false
    @Published private(set) var loadErrorMessage: String?

    init(path: String) {
        self.path = path
        webView = AppWebSession.makeWebView(path: path)
        super.init()
    }

    func retry() {
        loadErrorMessage = nil
        hasCompletedInitialLoad = false

        if let currentURL = webView.url ?? AppEnvironment.embeddedRouteURL(path: path) {
            webView.load(URLRequest(url: currentURL))
        }
    }

    func webView(
        _ webView: WKWebView,
        decidePolicyFor navigationAction: WKNavigationAction,
        decisionHandler: @escaping (WKNavigationActionPolicy) -> Void
    ) {
        guard let requestURL = navigationAction.request.url else {
            decisionHandler(.allow)
            return
        }

        if let scheme = requestURL.scheme,
           scheme != "http",
           scheme != "https" {
            UIApplication.shared.open(requestURL)
            decisionHandler(.cancel)
            return
        }

        if let appHost = AppEnvironment.webBaseURL?.host,
           let requestHost = requestURL.host,
           requestHost != appHost {
            UIApplication.shared.open(requestURL)
            decisionHandler(.cancel)
            return
        }

        if let rewrittenURL = AppEnvironment.ensureEmbeddedShellQuery(for: requestURL),
           rewrittenURL != requestURL {
            self.webView.load(URLRequest(url: rewrittenURL))
            decisionHandler(.cancel)
            return
        }

        decisionHandler(.allow)
    }

    func webView(_ webView: WKWebView, didStartProvisionalNavigation navigation: WKNavigation!) {
        if !hasCompletedInitialLoad {
            loadErrorMessage = nil
        }
    }

    func webView(_ webView: WKWebView, didFinish navigation: WKNavigation!) {
        loadErrorMessage = nil
        hasCompletedInitialLoad = true
    }

    func webView(
        _ webView: WKWebView,
        didFailProvisionalNavigation navigation: WKNavigation!,
        withError error: Error
    ) {
        handleNavigationFailure(error)
    }

    func webView(_ webView: WKWebView, didFail navigation: WKNavigation!, withError error: Error) {
        handleNavigationFailure(error)
    }

    private func handleNavigationFailure(_ error: Error) {
        guard !hasCompletedInitialLoad else {
            return
        }

        let nsError = error as NSError
        if nsError.domain == NSURLErrorDomain,
           nsError.code == NSURLErrorCancelled {
            return
        }

        loadErrorMessage = error.localizedDescription
    }
}

@MainActor
private struct HostedWebView: UIViewRepresentable {
    let webView: WKWebView
    let navigationDelegate: WKNavigationDelegate

    func makeUIView(context: Context) -> WKWebView {
        webView.navigationDelegate = navigationDelegate
        return webView
    }

    func updateUIView(_ uiView: WKWebView, context: Context) {
        uiView.navigationDelegate = navigationDelegate
    }

}

private struct WebLoadPlaceholderView: View {
    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.08, blue: 0.12),
                    Color(red: 0.04, green: 0.06, blue: 0.10),
                    Color(red: 0.08, green: 0.11, blue: 0.18),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 14) {
                ProgressView()
                    .progressViewStyle(.circular)
                    .tint(.white.opacity(0.9))
                    .scaleEffect(1.15)

                Text("Opening Analysis Studio")
                    .font(.headline)
                    .foregroundStyle(.white)

                Text("Loading your workspace from the deployed web app.")
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.72))
                    .frame(maxWidth: 260)
            }
            .padding(28)
        }
        .ignoresSafeArea()
    }
}

private struct WebLoadFailureView: View {
    let message: String
    let retry: () -> Void

    var body: some View {
        ZStack {
            LinearGradient(
                colors: [
                    Color(red: 0.05, green: 0.08, blue: 0.12),
                    Color(red: 0.04, green: 0.06, blue: 0.10),
                    Color(red: 0.08, green: 0.11, blue: 0.18),
                ],
                startPoint: .topLeading,
                endPoint: .bottomTrailing
            )

            VStack(spacing: 14) {
                Image(systemName: "wifi.exclamationmark")
                    .font(.system(size: 30, weight: .semibold))
                    .foregroundStyle(.white.opacity(0.88))

                Text("Unable to load the web workspace")
                    .font(.headline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white)

                Text(message)
                    .font(.subheadline)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.white.opacity(0.72))
                    .frame(maxWidth: 280)

                Button(action: retry) {
                    Text("Try again")
                        .font(.system(size: 15, weight: .semibold))
                        .padding(.horizontal, 18)
                        .padding(.vertical, 10)
                }
                .buttonStyle(.borderedProminent)
                .tint(Color(red: 0.34, green: 0.46, blue: 1.0))
            }
            .padding(28)
        }
        .ignoresSafeArea()
    }
}