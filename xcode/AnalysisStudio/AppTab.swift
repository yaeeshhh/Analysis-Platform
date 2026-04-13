import Foundation

enum AppTab: String, CaseIterable, Identifiable {
    case dashboard
    case uploads
    case analysis
    case history
    case account

    var id: Self { self }

    var title: String {
        switch self {
        case .dashboard:
            return "Home"
        case .uploads:
            return "Uploads"
        case .analysis:
            return "Analysis"
        case .history:
            return "History"
        case .account:
            return "Account"
        }
    }

    var symbolName: String {
        switch self {
        case .dashboard:
            return "house"
        case .uploads:
            return "arrow.up.doc"
        case .analysis:
            return "chart.bar.xaxis"
        case .history:
            return "clock.arrow.circlepath"
        case .account:
            return "person"
        }
    }

    var routePath: String {
        switch self {
        case .dashboard:
            return "/dashboard"
        case .uploads:
            return "/batch"
        case .analysis:
            return "/analysis"
        case .history:
            return "/history"
        case .account:
            return "/account"
        }
    }

    static func resolve(path: String) -> AppTab? {
        if path == "/" {
            return .dashboard
        }

        let normalizedPath = path.count > 1 && path.hasSuffix("/")
            ? String(path.dropLast())
            : path

        return allCases.first {
            normalizedPath == $0.routePath || normalizedPath.hasPrefix("\($0.routePath)/")
        }
    }
}
