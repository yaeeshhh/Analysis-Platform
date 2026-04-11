import Foundation

enum AppArchitectureMode: String {
    case native
    case shell
}

enum AppEnvironment {
    static let nativeShellQueryName = "nativeShell"
    static let nativeShellQueryValue = "apple"
    static let defaultAPIBaseURLString = "https://ideal-integrity-production-40f0.up.railway.app"

    static var appMode: AppArchitectureMode {
        guard let rawValue = Bundle.main.object(forInfoDictionaryKey: "ANALYSIS_STUDIO_APP_MODE") as? String else {
            return .native
        }

        return AppArchitectureMode(rawValue: rawValue.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()) ?? .native
    }

    static var apiBaseURLString: String {
        if let configured = Bundle.main.object(forInfoDictionaryKey: "ANALYSIS_STUDIO_API_BASE_URL") as? String {
            let trimmed = configured.trimmingCharacters(in: .whitespacesAndNewlines)
            if !trimmed.isEmpty {
                return trimmed
            }
        }

        return defaultAPIBaseURLString
    }

    static var apiBaseURL: URL? {
        normalizeURL(from: apiBaseURLString)
    }

    static var webBaseURLString: String {
        (Bundle.main.object(forInfoDictionaryKey: "ANALYSIS_STUDIO_WEB_BASE_URL") as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
    }

    static var webBaseURL: URL? {
        normalizeURL(from: webBaseURLString)
    }

    static func embeddedRouteURL(path: String) -> URL? {
        guard let baseURL = webBaseURL else {
            return nil
        }

        let normalizedBase = baseURL.absoluteString.hasSuffix("/")
            ? String(baseURL.absoluteString.dropLast())
            : baseURL.absoluteString
        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"

        guard var components = URLComponents(string: normalizedBase + normalizedPath) else {
            return nil
        }

        var queryItems = components.queryItems ?? []
        if !queryItems.contains(where: { $0.name == nativeShellQueryName }) {
            queryItems.append(URLQueryItem(name: nativeShellQueryName, value: nativeShellQueryValue))
        }
        components.queryItems = queryItems

        return components.url
    }

    static func ensureEmbeddedShellQuery(for url: URL) -> URL? {
        guard let appHost = webBaseURL?.host,
              url.host == appHost,
              var components = URLComponents(url: url, resolvingAgainstBaseURL: false) else {
            return nil
        }

        var queryItems = components.queryItems ?? []
        if !queryItems.contains(where: { $0.name == nativeShellQueryName }) {
            queryItems.append(URLQueryItem(name: nativeShellQueryName, value: nativeShellQueryValue))
            components.queryItems = queryItems
            return components.url
        }

        return url
    }

    static func supportedAppLinkDestination(for url: URL) -> (tab: AppTab, url: URL)? {
        guard let appHost = webBaseURL?.host,
              url.host == appHost,
              let tab = AppTab.resolve(path: url.path),
              let embeddedURL = ensureEmbeddedShellQuery(for: url) else {
            return nil
        }

        return (tab, embeddedURL)
    }

    private static func normalizeURL(from rawValue: String) -> URL? {
        guard !rawValue.isEmpty,
              let url = URL(string: rawValue),
              let scheme = url.scheme,
              scheme == "https" || scheme == "http" else {
            return nil
        }

        return url
    }
}