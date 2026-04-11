import Security
import SwiftUI

struct AppRootView: View {
    var body: some View {
        switch AppEnvironment.appMode {
        case .native:
            NativeAppRootView()
        case .shell:
            ShellAppRootView()
        }
    }
}

private struct ShellAppRootView: View {
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass
    @State private var selectedTab: AppTab = .dashboard

    var body: some View {
        ZStack {
            NativeAppBackground()

            EmbeddedWebTabContainer(selectedTab: selectedTab)
                .frame(maxWidth: contentMaxWidth)
                .frame(maxWidth: .infinity, maxHeight: .infinity)
        }
        .safeAreaInset(edge: .bottom, spacing: 0) {
            GlassTabBar(
                selectedTab: Binding(
                    get: { selectedTab },
                    set: handleTabSelection
                )
            )
                .padding(.horizontal, tabBarHorizontalPadding)
                .padding(.top, 10)
                .padding(.bottom, 8)
        }
        .onOpenURL { url in
            handleIncomingAppLink(url)
        }
        .onContinueUserActivity(NSUserActivityTypeBrowsingWeb) { activity in
            guard let url = activity.webpageURL else {
                return
            }

            handleIncomingAppLink(url)
        }
    }

    private var contentMaxWidth: CGFloat {
        horizontalSizeClass == .regular ? 560 : .infinity
    }

    private var tabBarHorizontalPadding: CGFloat {
        horizontalSizeClass == .regular ? 120 : 16
    }

    private func handleIncomingAppLink(_ url: URL) {
        guard let destination = AppEnvironment.supportedAppLinkDestination(for: url) else {
            return
        }

        selectedTab = destination.tab
        AppWebSession.load(url: destination.url, for: destination.tab.routePath)
    }

    private func handleTabSelection(_ nextTab: AppTab) {
        guard nextTab != selectedTab else {
            return
        }

        AppWebSession.loadBaseRoute(for: nextTab.routePath)
        selectedTab = nextTab
    }
}

@MainActor
private struct NativeAppRootView: View {
    @StateObject private var sessionStore = NativeSessionStore()

    var body: some View {
        ZStack {
            NativeAppBackground()

            if sessionStore.isRestoring {
                NativeCenteredState(
                    icon: "bolt.horizontal.circle",
                    title: "Starting native iPhone app",
                    message: "Restoring your backend session and preparing the first native dashboard slice."
                ) {
                    ProgressView()
                        .tint(.white)
                }
            } else if sessionStore.user == nil {
                NativeLoginView(sessionStore: sessionStore)
            } else {
                NativeAuthenticatedRoot(sessionStore: sessionStore)
            }
        }
        .task {
            await sessionStore.restoreSessionIfNeeded()
        }
    }
}

@MainActor
private struct NativeAuthenticatedRoot: View {
    @ObservedObject var sessionStore: NativeSessionStore
    @State private var selectedTab: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selectedTab) {
            NativeDashboardView(accessToken: sessionStore.accessToken)
                .tabItem {
                    Label(AppTab.dashboard.title, systemImage: AppTab.dashboard.symbolName)
                }
                .tag(AppTab.dashboard)

            NativePlaceholderView(
                title: "Uploads are next",
                message: "The first native slice is auth plus dashboard. File import and multipart upload come next so this tab will replace the current shell upload flow.",
                symbolName: AppTab.uploads.symbolName
            )
            .tabItem {
                Label(AppTab.uploads.title, systemImage: AppTab.uploads.symbolName)
            }
            .tag(AppTab.uploads)

            NativePlaceholderView(
                title: "Analysis is next",
                message: "The next native milestone is a read-only analysis summary screen driven by the existing backend report payload.",
                symbolName: AppTab.analysis.symbolName
            )
            .tabItem {
                Label(AppTab.analysis.title, systemImage: AppTab.analysis.symbolName)
            }
            .tag(AppTab.analysis)

            NativePlaceholderView(
                title: "History is next",
                message: "Saved runs and experiment history will move into native views after dashboard and analysis overview are stable.",
                symbolName: AppTab.history.symbolName
            )
            .tabItem {
                Label(AppTab.history.title, systemImage: AppTab.history.symbolName)
            }
            .tag(AppTab.history)

            NativeAccountView(sessionStore: sessionStore)
                .tabItem {
                    Label(AppTab.account.title, systemImage: AppTab.account.symbolName)
                }
                .tag(AppTab.account)
        }
        .tint(Color(red: 0.49, green: 0.43, blue: 0.97))
    }
}

@MainActor
private struct NativeLoginView: View {
    @ObservedObject var sessionStore: NativeSessionStore
    @State private var identifier = ""
    @State private var password = ""
    @State private var code = ""

    var body: some View {
        ScrollView {
            VStack(alignment: .leading, spacing: 20) {
                VStack(alignment: .leading, spacing: 10) {
                    Text("Analysis Studio")
                        .font(.system(size: 15, weight: .semibold, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.72))

                    Text(sessionStore.loginChallenge == nil ? "Native sign in" : "Verify sign in")
                        .font(.system(size: 34, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text(sessionStore.loginChallenge == nil
                         ? "This is the first native iPhone slice. Sign in against the existing backend and load your saved analyses directly."
                         : "Enter the 6-digit code for \(sessionStore.loginChallenge?.email ?? "your account") to finish signing in.")
                        .font(.system(size: 15, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.68))
                        .fixedSize(horizontal: false, vertical: true)
                }

                VStack(spacing: 14) {
                    if sessionStore.loginChallenge == nil {
                        NativeTextField(
                            title: "Email or username",
                            text: $identifier,
                            contentType: .username,
                            autocapitalization: .never,
                            textInputAutocapitalization: .never
                        )

                        NativeSecureField(
                            title: "Password",
                            text: $password,
                            contentType: .password
                        )

                        Button {
                            let trimmedIdentifier = identifier.trimmingCharacters(in: .whitespacesAndNewlines)
                            let trimmedPassword = password.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task {
                                await sessionStore.login(identifier: trimmedIdentifier, password: trimmedPassword)
                            }
                        } label: {
                            HStack {
                                if sessionStore.isBusy {
                                    ProgressView()
                                        .tint(Color(red: 0.05, green: 0.08, blue: 0.12))
                                }
                                Text(sessionStore.isBusy ? "Signing in..." : "Sign in")
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.white)
                            .foregroundStyle(Color(red: 0.05, green: 0.08, blue: 0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(sessionStore.isBusy || identifier.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty || password.trimmingCharacters(in: .whitespacesAndNewlines).isEmpty)
                    } else {
                        NativeTextField(
                            title: "Verification code",
                            text: $code,
                            keyboardType: .numberPad,
                            contentType: .oneTimeCode,
                            autocapitalization: .never,
                            textInputAutocapitalization: .never
                        )

                        Button {
                            let trimmedCode = code.trimmingCharacters(in: .whitespacesAndNewlines)
                            Task {
                                await sessionStore.verifyLoginCode(code: trimmedCode)
                            }
                        } label: {
                            HStack {
                                if sessionStore.isBusy {
                                    ProgressView()
                                        .tint(Color(red: 0.05, green: 0.08, blue: 0.12))
                                }
                                Text(sessionStore.isBusy ? "Verifying..." : "Verify code")
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.white)
                            .foregroundStyle(Color(red: 0.05, green: 0.08, blue: 0.12))
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                        .disabled(sessionStore.isBusy || code.trimmingCharacters(in: .whitespacesAndNewlines).count != 6)

                        Button {
                            Task {
                                await sessionStore.resendLoginCode()
                            }
                        } label: {
                            Text(sessionStore.isBusy ? "Working..." : "Resend code")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.82))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 12)
                                .overlay(
                                    RoundedRectangle(cornerRadius: 16, style: .continuous)
                                        .stroke(Color.white.opacity(0.14), lineWidth: 1)
                                )
                        }
                        .buttonStyle(.plain)
                        .disabled(sessionStore.isBusy)
                    }
                }

                if let errorMessage = sessionStore.errorMessage, !errorMessage.isEmpty {
                    NativeBanner(message: errorMessage, tone: .danger)
                }

                NativeBanner(
                    message: "Current mode: native. Change ANALYSIS_STUDIO_APP_MODE to shell in Info.plist if you need the existing web fallback while the rewrite is in progress.",
                    tone: .info
                )
            }
            .padding(20)
        }
    }
}

private struct NativeDashboardView: View {
    let accessToken: String?

    @State private var analyses: [NativeAnalysisListItem] = []
    @State private var errorMessage = ""
    @State private var isLoading = false

    var body: some View {
        NavigationStack {
            Group {
                if isLoading && analyses.isEmpty {
                    NativeCenteredState(
                        icon: "chart.bar.doc.horizontal",
                        title: "Loading dashboard",
                        message: "Fetching saved analyses directly from the backend."
                    ) {
                        ProgressView()
                            .tint(.white)
                    }
                } else if !errorMessage.isEmpty && analyses.isEmpty {
                    NativeCenteredState(
                        icon: "exclamationmark.triangle",
                        title: "Dashboard unavailable",
                        message: errorMessage
                    ) {
                        Button("Try again") {
                            Task {
                                await loadAnalyses()
                            }
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else if analyses.isEmpty {
                    NativeCenteredState(
                        icon: "tray",
                        title: "No saved analyses yet",
                        message: "Once uploads move into native, this dashboard will list them here."
                    )
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 16) {
                            ForEach(analyses) { analysis in
                                NativeAnalysisCard(analysis: analysis)
                            }
                        }
                        .padding(16)
                    }
                    .refreshable {
                        await loadAnalyses(force: true)
                    }
                }
            }
            .navigationTitle("Dashboard")
            .toolbar {
                if !analyses.isEmpty {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task {
                                await loadAnalyses(force: true)
                            }
                        } label: {
                            if isLoading {
                                ProgressView()
                                    .tint(.white)
                            } else {
                                Image(systemName: "arrow.clockwise")
                            }
                        }
                    }
                }
            }
        }
        .task(id: accessToken) {
            await loadAnalyses(force: true)
        }
    }

    private func loadAnalyses(force: Bool = false) async {
        guard let accessToken, !accessToken.isEmpty else {
            analyses = []
            errorMessage = ""
            return
        }

        if isLoading && !force {
            return
        }

        isLoading = true
        defer { isLoading = false }

        do {
            analyses = try await NativeAnalysisService.fetchAnalyses(accessToken: accessToken)
            errorMessage = ""
        } catch {
            errorMessage = error.localizedDescription
        }
    }
}

private struct NativeAnalysisCard: View {
    let analysis: NativeAnalysisListItem

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(Color(red: 0.49, green: 0.43, blue: 0.97).opacity(0.18))
                    .frame(width: 44, height: 44)
                    .overlay(
                        Image(systemName: "chart.bar.doc.horizontal")
                            .foregroundStyle(Color(red: 0.82, green: 0.76, blue: 1.0))
                    )

                VStack(alignment: .leading, spacing: 4) {
                    Text(analysis.displayName)
                        .font(.system(size: 18, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text(analysis.sourceFilename)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.58))

                    Text(analysis.savedAt)
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.42))
                }

                Spacer(minLength: 0)

                Text(analysis.status.capitalized)
                    .font(.system(size: 11, weight: .semibold, design: .rounded))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.08))
                    .clipShape(Capsule())
                    .foregroundStyle(Color.white.opacity(0.78))
            }

            Text(analysis.insights.summary)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.72))

            HStack(spacing: 10) {
                NativeMetricChip(label: "Rows", value: analysis.overview.rowCount.formatted())
                NativeMetricChip(label: "Columns", value: analysis.overview.columnCount.formatted())
                NativeMetricChip(label: "Experiments", value: analysis.experimentCount.formatted())
            }

            if let firstFinding = analysis.insights.findings.first, !firstFinding.isEmpty {
                Text(firstFinding)
                    .font(.system(size: 13, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.62))
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.05))
        .overlay(
            RoundedRectangle(cornerRadius: 20, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))
    }
}

private struct NativeMetricChip: View {
    let label: String
    let value: String

    var body: some View {
        VStack(alignment: .leading, spacing: 2) {
            Text(label)
                .font(.system(size: 11, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.45))
            Text(value)
                .font(.system(size: 14, weight: .bold, design: .rounded))
                .foregroundStyle(.white)
        }
        .padding(.horizontal, 12)
        .padding(.vertical, 10)
        .background(Color.white.opacity(0.04))
        .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
    }
}

@MainActor
private struct NativeAccountView: View {
    @ObservedObject var sessionStore: NativeSessionStore

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 16) {
                    if let user = sessionStore.user {
                        VStack(alignment: .leading, spacing: 8) {
                            Text(user.fullName ?? user.email)
                                .font(.system(size: 26, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)

                            Text(user.email)
                                .font(.system(size: 15, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.68))
                        }

                        NativeBanner(message: user.twoFactorEnabled ? "Two-factor login is enabled for this account." : "Two-factor login is disabled for this account.", tone: .info)

                        VStack(alignment: .leading, spacing: 12) {
                            NativeAccountRow(label: "Username", value: user.username ?? "Not set")
                            NativeAccountRow(label: "Date of birth", value: user.dateOfBirth ?? "Not set")
                            NativeAccountRow(label: "Account status", value: user.isActive ? "Active" : "Inactive")
                            NativeAccountRow(label: "API base", value: AppEnvironment.apiBaseURLString)
                            NativeAccountRow(label: "App mode", value: AppEnvironment.appMode.rawValue)
                        }
                        .padding(16)
                        .background(Color.white.opacity(0.05))
                        .overlay(
                            RoundedRectangle(cornerRadius: 20, style: .continuous)
                                .stroke(Color.white.opacity(0.08), lineWidth: 1)
                        )
                        .clipShape(RoundedRectangle(cornerRadius: 20, style: .continuous))

                        Button(role: .destructive) {
                            Task {
                                await sessionStore.logout()
                            }
                        } label: {
                            HStack {
                                if sessionStore.isBusy {
                                    ProgressView()
                                        .tint(.white)
                                }
                                Text(sessionStore.isBusy ? "Signing out..." : "Sign out")
                                    .font(.system(size: 16, weight: .semibold, design: .rounded))
                            }
                            .frame(maxWidth: .infinity)
                            .padding(.vertical, 14)
                            .background(Color.red.opacity(0.88))
                            .foregroundStyle(.white)
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                        .buttonStyle(.plain)
                    }
                }
                .padding(16)
            }
            .navigationTitle("Account")
        }
    }
}

private struct NativeAccountRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.48))

            Spacer(minLength: 12)

            Text(value)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
        }
    }
}

private struct NativePlaceholderView: View {
    let title: String
    let message: String
    let symbolName: String

    var body: some View {
        NavigationStack {
            NativeCenteredState(icon: symbolName, title: title, message: message)
                .navigationTitle(title)
        }
    }
}

private struct NativeCenteredState<Accessory: View>: View {
    let icon: String
    let title: String
    let message: String
    @ViewBuilder let accessory: () -> Accessory

    init(
        icon: String,
        title: String,
        message: String,
        @ViewBuilder accessory: @escaping () -> Accessory = { EmptyView() }
    ) {
        self.icon = icon
        self.title = title
        self.message = message
        self.accessory = accessory
    }

    var body: some View {
        VStack(spacing: 18) {
            Image(systemName: icon)
                .font(.system(size: 42, weight: .semibold))
                .foregroundStyle(Color.white.opacity(0.86))

            Text(title)
                .font(.system(size: 26, weight: .bold, design: .rounded))
                .foregroundStyle(.white)

            Text(message)
                .font(.system(size: 15, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.64))
                .multilineTextAlignment(.center)
                .frame(maxWidth: 320)

            accessory()
        }
        .padding(28)
    }
}

private struct NativeAppBackground: View {
    var body: some View {
        LinearGradient(
            colors: [
                Color(red: 0.05, green: 0.08, blue: 0.12),
                Color(red: 0.04, green: 0.06, blue: 0.10),
                Color(red: 0.08, green: 0.11, blue: 0.18),
            ],
            startPoint: .topLeading,
            endPoint: .bottomTrailing
        )
        .ignoresSafeArea()
    }
}

private struct NativeTextField: View {
    let title: String
    @Binding var text: String
    var keyboardType: UIKeyboardType = .default
    var contentType: UITextContentType? = nil
    var autocapitalization: TextInputAutocapitalization? = .sentences
    var textInputAutocapitalization: TextInputAutocapitalization? = .sentences

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.58))

            TextField(title, text: $text)
                .textContentType(contentType)
                .keyboardType(keyboardType)
                .textInputAutocapitalization(textInputAutocapitalization)
                .autocorrectionDisabled(true)
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(Color.white.opacity(0.05))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

private struct NativeSecureField: View {
    let title: String
    @Binding var text: String
    var contentType: UITextContentType? = nil

    var body: some View {
        VStack(alignment: .leading, spacing: 8) {
            Text(title)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.58))

            SecureField(title, text: $text)
                .textContentType(contentType)
                .padding(.horizontal, 14)
                .padding(.vertical, 14)
                .background(Color.white.opacity(0.05))
                .foregroundStyle(.white)
                .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
        }
    }
}

private enum NativeBannerTone {
    case info
    case danger

    var background: Color {
        switch self {
        case .info:
            return Color.white.opacity(0.05)
        case .danger:
            return Color.red.opacity(0.18)
        }
    }

    var border: Color {
        switch self {
        case .info:
            return Color.white.opacity(0.08)
        case .danger:
            return Color.red.opacity(0.35)
        }
    }
}

private struct NativeBanner: View {
    let message: String
    let tone: NativeBannerTone

    var body: some View {
        Text(message)
            .font(.system(size: 13, weight: .medium, design: .rounded))
            .foregroundStyle(Color.white.opacity(0.82))
            .frame(maxWidth: .infinity, alignment: .leading)
            .padding(14)
            .background(tone.background)
            .overlay(
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .stroke(tone.border, lineWidth: 1)
            )
            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
    }
}

@MainActor
private final class NativeSessionStore: ObservableObject {
    @Published private(set) var user: NativeUser?
    @Published private(set) var accessToken: String?
    @Published private(set) var isRestoring = true
    @Published private(set) var isBusy = false
    @Published private(set) var loginChallenge: NativeLoginChallenge?
    @Published var errorMessage: String?

    private var didAttemptRestore = false

    func restoreSessionIfNeeded() async {
        guard !didAttemptRestore else {
            return
        }

        didAttemptRestore = true
        await restoreSession()
    }

    func restoreSession() async {
        isRestoring = true
        errorMessage = nil

        defer {
            isRestoring = false
        }

        if let storedToken = NativeSecureStore.readString(for: NativeSecureStore.accessTokenKey) {
            do {
                let authenticatedUser = try await NativeAuthService.getCurrentUser(accessToken: storedToken)
                accessToken = storedToken
                user = authenticatedUser
                return
            } catch {
                NativeSecureStore.deleteValue(for: NativeSecureStore.accessTokenKey)
                accessToken = nil
            }
        }

        do {
            let refresh = try await NativeAuthService.refreshAccessToken()
            let authenticatedUser = try await NativeAuthService.getCurrentUser(accessToken: refresh.accessToken)
            persist(accessToken: refresh.accessToken, user: authenticatedUser)
        } catch {
            clearSession()
        }
    }

    func login(identifier: String, password: String) async {
        guard !identifier.isEmpty, !password.isEmpty else {
            errorMessage = "Enter both your identifier and password."
            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            switch try await NativeAuthService.login(identifier: identifier, password: password) {
            case .success(let payload):
                persist(accessToken: payload.accessToken, user: payload.user)
            case .challenge(let challenge):
                loginChallenge = challenge
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func verifyLoginCode(code: String) async {
        guard let challenge = loginChallenge else {
            errorMessage = "The verification session expired. Please sign in again."
            return
        }

        guard code.count == 6 else {
            errorMessage = "Enter the 6-digit verification code."
            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            let payload = try await NativeAuthService.verifyLoginCode(challengeToken: challenge.challengeToken, code: code)
            persist(accessToken: payload.accessToken, user: payload.user)
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func resendLoginCode() async {
        guard let challenge = loginChallenge else {
            errorMessage = "The verification session expired. Please sign in again."
            return
        }

        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            let refreshedChallenge = try await NativeAuthService.sendLoginCode(challengeToken: challenge.challengeToken)
            loginChallenge = refreshedChallenge
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    func logout() async {
        isBusy = true
        defer { isBusy = false }

        if let accessToken {
            try? await NativeAuthService.logout(accessToken: accessToken)
        }

        clearSession()
    }

    private func persist(accessToken: String, user: NativeUser) {
        NativeSecureStore.writeString(accessToken, for: NativeSecureStore.accessTokenKey)
        self.accessToken = accessToken
        self.user = user
        loginChallenge = nil
        errorMessage = nil
    }

    private func clearSession() {
        NativeSecureStore.deleteValue(for: NativeSecureStore.accessTokenKey)
        accessToken = nil
        user = nil
        loginChallenge = nil
    }
}

private enum NativeAuthService {
    static func login(identifier: String, password: String) async throws -> NativeLoginOutcome {
        let payload = try await NativeAPIClient.post(path: "/auth/login", body: NativeLoginRequest(identifier: identifier, password: password, rememberMe: false), authorizedToken: nil, responseType: NativeLoginEnvelope.self)

        if payload.requiresTwoFactor {
            guard let challengeToken = payload.challengeToken,
                  let email = payload.email else {
                throw NativeAppError(message: "The backend returned an incomplete verification challenge.")
            }

            return .challenge(
                NativeLoginChallenge(
                    challengeToken: challengeToken,
                    email: email,
                    codeSent: payload.codeSent ?? true,
                    expiresInSeconds: payload.expiresInSeconds ?? 0,
                    resendAvailableInSeconds: payload.resendAvailableInSeconds ?? 0
                )
            )
        }

        guard let accessToken = payload.accessToken,
              let user = payload.user else {
            throw NativeAppError(message: "The backend returned an incomplete login response.")
        }

        return .success(NativeLoginSuccess(accessToken: accessToken, tokenType: payload.tokenType ?? "bearer", user: user))
    }

    static func verifyLoginCode(challengeToken: String, code: String) async throws -> NativeLoginSuccess {
        try await NativeAPIClient.post(path: "/auth/verify-login-code", body: NativeVerifyCodeRequest(challengeToken: challengeToken, code: code), authorizedToken: nil, responseType: NativeLoginSuccess.self)
    }

    static func sendLoginCode(challengeToken: String) async throws -> NativeLoginChallenge {
        try await NativeAPIClient.post(path: "/auth/send-login-code", body: NativeSendCodeRequest(challengeToken: challengeToken), authorizedToken: nil, responseType: NativeLoginChallenge.self)
    }

    static func refreshAccessToken() async throws -> NativeRefreshResponse {
        try await NativeAPIClient.post(path: "/auth/refresh", body: NativeEmptyBody(), authorizedToken: nil, responseType: NativeRefreshResponse.self)
    }

    static func getCurrentUser(accessToken: String) async throws -> NativeUser {
        try await NativeAPIClient.get(path: "/auth/me", authorizedToken: accessToken, responseType: NativeUser.self)
    }

    static func logout(accessToken: String) async throws {
        _ = try await NativeAPIClient.post(path: "/auth/logout", body: NativeEmptyBody(), authorizedToken: accessToken, responseType: NativeMessageResponse.self)
    }
}

private enum NativeAnalysisService {
    static func fetchAnalyses(accessToken: String) async throws -> [NativeAnalysisListItem] {
        try await NativeAPIClient.get(path: "/analysis", authorizedToken: accessToken, responseType: [NativeAnalysisListItem].self)
    }
}

private enum NativeLoginOutcome {
    case success(NativeLoginSuccess)
    case challenge(NativeLoginChallenge)
}

private struct NativeLoginRequest: Encodable {
    let identifier: String
    let password: String
    let rememberMe: Bool
}

private struct NativeVerifyCodeRequest: Encodable {
    let challengeToken: String
    let code: String
}

private struct NativeSendCodeRequest: Encodable {
    let challengeToken: String
}

private struct NativeEmptyBody: Encodable {}

private struct NativeLoginEnvelope: Decodable {
    let requiresTwoFactor: Bool
    let challengeToken: String?
    let email: String?
    let codeSent: Bool?
    let expiresInSeconds: Int?
    let resendAvailableInSeconds: Int?
    let accessToken: String?
    let tokenType: String?
    let user: NativeUser?

    private enum CodingKeys: String, CodingKey {
        case requiresTwoFactor = "requires_2fa"
        case challengeToken
        case email
        case codeSent
        case expiresInSeconds
        case resendAvailableInSeconds
        case accessToken
        case tokenType
        case user
    }
}

private struct NativeLoginChallenge: Decodable {
    let challengeToken: String
    let email: String
    let codeSent: Bool
    let expiresInSeconds: Int
    let resendAvailableInSeconds: Int
}

private struct NativeLoginSuccess: Decodable {
    let accessToken: String
    let tokenType: String
    let user: NativeUser
}

private struct NativeRefreshResponse: Decodable {
    let accessToken: String
    let tokenType: String
}

private struct NativeMessageResponse: Decodable {
    let message: String?
}

private struct NativeUser: Decodable {
    let id: Int
    let email: String
    let username: String?
    let fullName: String?
    let dateOfBirth: String?
    let twoFactorEnabled: Bool
    let isActive: Bool
    let createdAt: String
}

private struct NativeAnalysisListItem: Decodable, Identifiable {
    let id: Int
    let displayName: String
    let sourceFilename: String
    let savedAt: String
    let experimentCount: Int
    let status: String
    let overview: NativeAnalysisOverview
    let insights: NativeAnalysisInsights
}

private struct NativeAnalysisOverview: Decodable {
    let datasetName: String
    let rowCount: Int
    let columnCount: Int
    let encoding: String
    let duplicateRowCount: Int
    let totalMissingValues: Int
}

private struct NativeAnalysisInsights: Decodable {
    let summary: String
    let findings: [String]
    let recommendedNextSteps: [String]
    let modelingReadiness: NativeModelingReadiness
}

private struct NativeModelingReadiness: Decodable {
    let isReady: Bool
    let targetCandidates: [String]
}

private struct NativeAppError: LocalizedError {
    let message: String

    var errorDescription: String? {
        message
    }
}

private enum NativeSecureStore {
    static let accessTokenKey = "analysis-studio.native.access-token"

    static func writeString(_ value: String, for key: String) {
        guard let data = value.data(using: .utf8) else {
            return
        }

        deleteValue(for: key)

        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecValueData: data,
            kSecAttrAccessible: kSecAttrAccessibleAfterFirstUnlock,
        ]

        SecItemAdd(query as CFDictionary, nil)
    }

    static func readString(for key: String) -> String? {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
            kSecReturnData: true,
            kSecMatchLimit: kSecMatchLimitOne,
        ]

        var item: CFTypeRef?
        let status = SecItemCopyMatching(query as CFDictionary, &item)

        guard status == errSecSuccess,
              let data = item as? Data else {
            return nil
        }

        return String(data: data, encoding: .utf8)
    }

    static func deleteValue(for key: String) {
        let query: [CFString: Any] = [
            kSecClass: kSecClassGenericPassword,
            kSecAttrAccount: key,
        ]

        SecItemDelete(query as CFDictionary)
    }
}

private enum NativeAPIClient {
    private static let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.keyDecodingStrategy = .convertFromSnakeCase
        return decoder
    }()

    private static let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.keyEncodingStrategy = .convertToSnakeCase
        return encoder
    }()

    private static let session: URLSession = {
        let configuration = URLSessionConfiguration.default
        configuration.httpCookieStorage = HTTPCookieStorage.shared
        configuration.httpCookieAcceptPolicy = .always
        configuration.httpShouldSetCookies = true
        configuration.requestCachePolicy = .reloadIgnoringLocalCacheData
        return URLSession(configuration: configuration)
    }()

    static func get<Response: Decodable>(path: String, authorizedToken: String?, responseType: Response.Type) async throws -> Response {
        let request = try buildRequest(path: path, method: "GET", authorizedToken: authorizedToken, body: nil)
        return try await send(request, responseType: responseType)
    }

    static func post<Body: Encodable, Response: Decodable>(path: String, body: Body, authorizedToken: String?, responseType: Response.Type) async throws -> Response {
        let bodyData = try encoder.encode(body)
        let request = try buildRequest(path: path, method: "POST", authorizedToken: authorizedToken, body: bodyData)
        return try await send(request, responseType: responseType)
    }

    private static func buildRequest(path: String, method: String, authorizedToken: String?, body: Data?) throws -> URLRequest {
        guard let baseURL = AppEnvironment.apiBaseURL else {
            throw NativeAppError(message: "Missing ANALYSIS_STUDIO_API_BASE_URL configuration.")
        }

        let normalizedPath = path.hasPrefix("/") ? path : "/\(path)"
        let url = baseURL.appendingPathComponent(String(normalizedPath.dropFirst()))
        var request = URLRequest(url: url)
        request.httpMethod = method
        request.timeoutInterval = 30
        request.httpShouldHandleCookies = true
        request.setValue("application/json", forHTTPHeaderField: "Accept")

        if body != nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        if let authorizedToken, !authorizedToken.isEmpty {
            request.setValue("Bearer \(authorizedToken)", forHTTPHeaderField: "Authorization")
        }

        request.httpBody = body
        return request
    }

    private static func send<Response: Decodable>(_ request: URLRequest, responseType: Response.Type) async throws -> Response {
        let (data, response) = try await session.data(for: request)

        guard let httpResponse = response as? HTTPURLResponse else {
            throw NativeAppError(message: "The backend returned an invalid response.")
        }

        guard (200..<300).contains(httpResponse.statusCode) else {
            throw NativeAppError(message: decodeErrorMessage(from: data, fallback: "Request failed with status \(httpResponse.statusCode)."))
        }

        do {
            return try decoder.decode(Response.self, from: data)
        } catch {
            throw NativeAppError(message: "The backend response could not be decoded by the native app yet.")
        }
    }

    private static func decodeErrorMessage(from data: Data, fallback: String) -> String {
        guard !data.isEmpty,
              let json = try? JSONSerialization.jsonObject(with: data) as? [String: Any] else {
            return fallback
        }

        if let detail = json["detail"] as? String, !detail.isEmpty {
            return detail
        }

        if let message = json["message"] as? String, !message.isEmpty {
            return message
        }

        return fallback
    }
}