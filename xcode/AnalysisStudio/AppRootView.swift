import Security
import SwiftUI
import UniformTypeIdentifiers

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
    @StateObject private var workspace = NativeAnalysisWorkspaceStore()
    @State private var selectedTab: AppTab = .dashboard

    var body: some View {
        TabView(selection: $selectedTab) {
            NativeDashboardView(workspace: workspace, selectedTab: $selectedTab)
                .tabItem {
                    Label(AppTab.dashboard.title, systemImage: AppTab.dashboard.symbolName)
                }
                .tag(AppTab.dashboard)

            NativeUploadsView(workspace: workspace, selectedTab: $selectedTab)
                .tabItem {
                    Label(AppTab.uploads.title, systemImage: AppTab.uploads.symbolName)
                }
                .tag(AppTab.uploads)

            NativeAnalysisWorkspaceView(workspace: workspace, selectedTab: $selectedTab)
                .tabItem {
                    Label(AppTab.analysis.title, systemImage: AppTab.analysis.symbolName)
                }
                .tag(AppTab.analysis)

            NativeHistoryView(workspace: workspace, selectedTab: $selectedTab)
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
        .task(id: sessionStore.accessToken) {
            await workspace.configure(accessToken: sessionStore.accessToken)
        }
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

                    Text(challengeDescription)
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
                        .disabled(
                            sessionStore.isBusy
                                || sessionStore.loginChallenge?.codeSent != true
                                || code.trimmingCharacters(in: .whitespacesAndNewlines).count != 6
                        )

                        Button {
                            Task {
                                await sessionStore.resendLoginCode()
                            }
                        } label: {
                            Text(sessionStore.isBusy ? "Working..." : (sessionStore.loginChallenge?.codeSent == true ? "Resend code" : "Send code"))
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

    private var challengeDescription: String {
        guard let challenge = sessionStore.loginChallenge else {
            return "This is the first native iPhone slice. Sign in against the existing backend and load your saved analyses directly."
        }

        if challenge.codeSent {
            return "Enter the 6-digit code sent to \(challenge.email) to finish signing in."
        }

        return "Your account needs verification before sign-in completes. Tap Send code to deliver a 6-digit code to \(challenge.email)."
    }
}

private struct NativeDashboardView: View {
    @ObservedObject var workspace: NativeAnalysisWorkspaceStore
    @Binding var selectedTab: AppTab

    var body: some View {
        NavigationStack {
            Group {
                if workspace.isLoadingAnalyses && workspace.analyses.isEmpty {
                    NativeCenteredState(
                        icon: "chart.bar.doc.horizontal",
                        title: "Loading dashboard",
                        message: "Fetching saved analyses directly from the backend."
                    ) {
                        ProgressView()
                            .tint(.white)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            NativeWorkspaceBanners(workspace: workspace)

                            if let featuredAnalysis = workspace.selectedAnalysis ?? workspace.analyses.first {
                                NativeSectionCard(
                                    title: featuredAnalysis.displayName,
                                    subtitle: "Latest dataset focus"
                                ) {
                                    Text(featuredAnalysis.insights.summary)
                                        .font(.system(size: 14, weight: .medium, design: .rounded))
                                        .foregroundStyle(Color.white.opacity(0.72))

                                    HStack(spacing: 10) {
                                        NativeMetricChip(label: "Rows", value: featuredAnalysis.overview.rowCount.formatted())
                                        NativeMetricChip(label: "Columns", value: featuredAnalysis.overview.columnCount.formatted())
                                        NativeMetricChip(label: "ML runs", value: featuredAnalysis.experimentCount.formatted())
                                    }

                                    HStack(spacing: 10) {
                                        Button {
                                            Task {
                                                await workspace.selectAnalysis(id: featuredAnalysis.id)
                                                selectedTab = .analysis
                                            }
                                        } label: {
                                            Text("Open analysis")
                                                .font(.system(size: 14, weight: .semibold, design: .rounded))
                                                .frame(maxWidth: .infinity)
                                                .padding(.vertical, 12)
                                        }
                                        .buttonStyle(.borderedProminent)

                                        Button {
                                            selectedTab = .history
                                        } label: {
                                            Text("Open history")
                                                .font(.system(size: 14, weight: .semibold, design: .rounded))
                                                .frame(maxWidth: .infinity)
                                                .padding(.vertical, 12)
                                        }
                                        .buttonStyle(.bordered)
                                    }
                                }
                            } else {
                                NativeCenteredState(
                                    icon: "tray",
                                    title: "No saved analyses yet",
                                    message: "Upload a CSV in the native Uploads tab to start the working iPhone flow."
                                ) {
                                    Button("Open uploads") {
                                        selectedTab = .uploads
                                    }
                                    .buttonStyle(.borderedProminent)
                                }
                            }

                            Text("Workspace")
                                .font(.system(size: 20, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)

                            VStack(spacing: 12) {
                                NativeActionTile(
                                    title: "Dataset library",
                                    detail: "Upload CSVs, manage the reusable saved-run library, and choose the active dataset.",
                                    symbolName: AppTab.uploads.symbolName,
                                    accent: Color(red: 0.48, green: 0.84, blue: 1.0),
                                    actionLabel: "Open uploads"
                                ) {
                                    selectedTab = .uploads
                                }

                                NativeActionTile(
                                    title: "Analysis workspace",
                                    detail: "Review summary, health, fields, patterns, and ML for the selected dataset.",
                                    symbolName: AppTab.analysis.symbolName,
                                    accent: Color(red: 0.62, green: 0.72, blue: 1.0),
                                    actionLabel: "Open analysis"
                                ) {
                                    selectedTab = .analysis
                                }

                                NativeActionTile(
                                    title: "Run archive",
                                    detail: "Search older runs, reopen them, and remove stale datasets when needed.",
                                    symbolName: AppTab.history.symbolName,
                                    accent: Color(red: 0.55, green: 0.95, blue: 0.66),
                                    actionLabel: "Open history"
                                ) {
                                    selectedTab = .history
                                }
                            }

                            if !workspace.analyses.isEmpty {
                                Text("Recent runs")
                                    .font(.system(size: 20, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)

                                VStack(spacing: 14) {
                                    ForEach(Array(workspace.analyses.prefix(4))) { analysis in
                                        Button {
                                            Task {
                                                await workspace.selectAnalysis(id: analysis.id)
                                                selectedTab = .analysis
                                            }
                                        } label: {
                                            NativeAnalysisCard(analysis: analysis)
                                        }
                                        .buttonStyle(.plain)
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                    .refreshable {
                        await workspace.refreshAnalyses()
                    }
                }
            }
            .navigationTitle("Dashboard")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await workspace.refreshAnalyses()
                        }
                    } label: {
                        if workspace.isLoadingAnalyses {
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

private struct NativeWorkspaceBanners: View {
    @ObservedObject var workspace: NativeAnalysisWorkspaceStore

    var body: some View {
        VStack(spacing: 10) {
            if let noticeMessage = workspace.noticeMessage, !noticeMessage.isEmpty {
                NativeBanner(message: noticeMessage, tone: .info)
            }

            if let errorMessage = workspace.errorMessage, !errorMessage.isEmpty {
                NativeBanner(message: errorMessage, tone: .danger)
            }
        }
    }
}

private struct NativeSectionCard<Content: View>: View {
    let title: String
    let subtitle: String?
    @ViewBuilder let content: () -> Content

    init(title: String, subtitle: String? = nil, @ViewBuilder content: @escaping () -> Content) {
        self.title = title
        self.subtitle = subtitle
        self.content = content
    }

    var body: some View {
        VStack(alignment: .leading, spacing: 14) {
            VStack(alignment: .leading, spacing: 4) {
                if let subtitle, !subtitle.isEmpty {
                    Text(subtitle.uppercased())
                        .font(.system(size: 11, weight: .bold, design: .rounded))
                        .tracking(0.6)
                        .foregroundStyle(Color.white.opacity(0.42))
                }

                Text(title)
                    .font(.system(size: 20, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)
            }

            content()
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

private struct NativeActionTile: View {
    let title: String
    let detail: String
    let symbolName: String
    let accent: Color
    let actionLabel: String
    let action: () -> Void

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(spacing: 12) {
                RoundedRectangle(cornerRadius: 14, style: .continuous)
                    .fill(accent.opacity(0.18))
                    .frame(width: 42, height: 42)
                    .overlay(
                        Image(systemName: symbolName)
                            .foregroundStyle(accent)
                    )

                Text(title)
                    .font(.system(size: 17, weight: .bold, design: .rounded))
                    .foregroundStyle(.white)

                Spacer(minLength: 0)
            }

            Text(detail)
                .font(.system(size: 14, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.68))

            Button(actionLabel, action: action)
                .buttonStyle(.bordered)
        }
        .padding(16)
        .background(Color.white.opacity(0.04))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

private struct NativeSavedAnalysisRow: View {
    let analysis: NativeAnalysisListItem
    let primaryActionLabel: String
    let primaryAction: () -> Void
    var secondaryActionLabel: String?
    var secondaryAction: (() -> Void)?

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            HStack(alignment: .top, spacing: 12) {
                VStack(alignment: .leading, spacing: 4) {
                    Text(analysis.displayName)
                        .font(.system(size: 16, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Text(analysis.sourceFilename)
                        .font(.system(size: 13, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.56))

                    Text(nativeDisplayDate(analysis.savedAt))
                        .font(.system(size: 12, weight: .medium, design: .rounded))
                        .foregroundStyle(Color.white.opacity(0.42))
                }

                Spacer(minLength: 0)

                Text(analysis.status.capitalized)
                    .font(.system(size: 11, weight: .bold, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.74))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 6)
                    .background(Color.white.opacity(0.08))
                    .clipShape(Capsule())
            }

            Text(analysis.insights.summary)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.68))
                .lineLimit(3)

            HStack(spacing: 10) {
                NativeMetricChip(label: "Rows", value: analysis.overview.rowCount.formatted())
                NativeMetricChip(label: "Columns", value: analysis.overview.columnCount.formatted())
                NativeMetricChip(label: "Experiments", value: analysis.experimentCount.formatted())
            }

            HStack(spacing: 10) {
                Button(primaryActionLabel, action: primaryAction)
                    .buttonStyle(.borderedProminent)

                if let secondaryActionLabel, let secondaryAction {
                    Button(secondaryActionLabel, action: secondaryAction)
                        .buttonStyle(.bordered)
                }
            }
        }
        .padding(16)
        .background(Color.white.opacity(0.04))
        .overlay(
            RoundedRectangle(cornerRadius: 18, style: .continuous)
                .stroke(Color.white.opacity(0.08), lineWidth: 1)
        )
        .clipShape(RoundedRectangle(cornerRadius: 18, style: .continuous))
    }
}

@MainActor
private struct NativeUploadsView: View {
    @ObservedObject var workspace: NativeAnalysisWorkspaceStore
    @Binding var selectedTab: AppTab

    @State private var isFileImporterPresented = false
    @State private var pendingFileURL: URL?

    var body: some View {
        NavigationStack {
            ScrollView {
                VStack(alignment: .leading, spacing: 18) {
                    NativeWorkspaceBanners(workspace: workspace)

                    NativeSectionCard(title: "Upload CSV", subtitle: "Dataset library") {
                        Text("Choose a CSV from Files, process it against the existing backend pipeline, and open the saved report directly in Analysis.")
                            .font(.system(size: 14, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.72))

                        Button {
                            isFileImporterPresented = true
                        } label: {
                            Label("Choose CSV", systemImage: "doc.badge.plus")
                                .font(.system(size: 15, weight: .semibold, design: .rounded))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 14)
                        }
                        .buttonStyle(.borderedProminent)

                        if let selectedFileURL = pendingFileURL {
                            VStack(alignment: .leading, spacing: 8) {
                                Text("Selected file")
                                    .font(.system(size: 12, weight: .bold, design: .rounded))
                                    .foregroundStyle(Color.white.opacity(0.45))

                                Text(selectedFileURL.lastPathComponent)
                                    .font(.system(size: 15, weight: .semibold, design: .rounded))
                                    .foregroundStyle(.white)

                                HStack(spacing: 10) {
                                    Button {
                                        Task {
                                            let didUpload = await workspace.uploadCSV(from: selectedFileURL)
                                            if didUpload {
                                                self.pendingFileURL = nil
                                                selectedTab = .analysis
                                            }
                                        }
                                    } label: {
                                        if workspace.isUploading {
                                            ProgressView()
                                                .tint(.white)
                                                .frame(maxWidth: .infinity)
                                                .padding(.vertical, 10)
                                        } else {
                                            Text("Analyse upload")
                                                .font(.system(size: 14, weight: .semibold, design: .rounded))
                                                .frame(maxWidth: .infinity)
                                                .padding(.vertical, 10)
                                        }
                                    }
                                    .buttonStyle(.borderedProminent)
                                    .disabled(workspace.isUploading)

                                    Button("Clear") {
                                        pendingFileURL = nil
                                    }
                                    .buttonStyle(.bordered)
                                    .disabled(workspace.isUploading)
                                }
                            }
                            .padding(14)
                            .background(Color.white.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                        }
                    }

                    if let selectedAnalysis = workspace.selectedAnalysis {
                        NativeSectionCard(title: "Current dataset", subtitle: "Active analysis") {
                            Text(selectedAnalysis.displayName)
                                .font(.system(size: 18, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)

                            Text(selectedAnalysis.insights.summary)
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.7))

                            HStack(spacing: 10) {
                                Button("Open in analysis") {
                                    selectedTab = .analysis
                                }
                                .buttonStyle(.borderedProminent)

                                Button("Review history") {
                                    selectedTab = .history
                                }
                                .buttonStyle(.bordered)
                            }
                        }
                    }

                    if workspace.analyses.isEmpty {
                        NativeCenteredState(
                            icon: "tray",
                            title: "Library is empty",
                            message: "The first processed CSV will appear here as a reusable saved run."
                        )
                    } else {
                        Text("Saved library")
                            .font(.system(size: 20, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        VStack(spacing: 14) {
                            ForEach(workspace.analyses) { analysis in
                                NativeSavedAnalysisRow(
                                    analysis: analysis,
                                    primaryActionLabel: "Open analysis",
                                    primaryAction: {
                                        Task {
                                            await workspace.selectAnalysis(id: analysis.id)
                                            selectedTab = .analysis
                                        }
                                    },
                                    secondaryActionLabel: "Keep current",
                                    secondaryAction: {
                                        Task {
                                            await workspace.selectAnalysis(id: analysis.id)
                                        }
                                    }
                                )
                            }
                        }
                    }
                }
                .padding(16)
            }
            .navigationTitle("Uploads")
            .toolbar {
                ToolbarItem(placement: .topBarTrailing) {
                    Button {
                        Task {
                            await workspace.refreshAnalyses()
                        }
                    } label: {
                        if workspace.isLoadingAnalyses {
                            ProgressView()
                                .tint(.white)
                        } else {
                            Image(systemName: "arrow.clockwise")
                        }
                    }
                }
            }
        }
        .fileImporter(
            isPresented: $isFileImporterPresented,
            allowedContentTypes: [UTType(filenameExtension: "csv") ?? .commaSeparatedText, .commaSeparatedText, .plainText],
            allowsMultipleSelection: false
        ) { result in
            switch result {
            case .success(let selectedURLs):
                pendingFileURL = selectedURLs.first
                if selectedURLs.first != nil {
                    workspace.clearMessages()
                }
            case .failure(let error):
                workspace.errorMessage = error.localizedDescription
            }
        }
    }
}

private enum NativeAnalysisWorkspaceSection: String, CaseIterable, Identifiable {
    case overview
    case quality
    case schema
    case statistics
    case insights
    case ml

    var id: String { rawValue }

    var title: String {
        switch self {
        case .overview:
            return "Summary"
        case .quality:
            return "Health"
        case .schema:
            return "Fields"
        case .statistics:
            return "Patterns"
        case .insights:
            return "Findings"
        case .ml:
            return "ML"
        }
    }
}

@MainActor
private struct NativeAnalysisWorkspaceView: View {
    @ObservedObject var workspace: NativeAnalysisWorkspaceStore
    @Binding var selectedTab: AppTab

    @State private var activeSection: NativeAnalysisWorkspaceSection = .overview
    @State private var supervisedTargetColumn = ""
    @State private var clusterCount = 3

    var body: some View {
        NavigationStack {
            Group {
                if workspace.isLoadingReport && workspace.selectedReport == nil {
                    NativeCenteredState(
                        icon: "chart.bar.xaxis",
                        title: "Loading analysis",
                        message: "Opening the selected report from the backend."
                    ) {
                        ProgressView()
                            .tint(.white)
                    }
                } else if let report = workspace.selectedReport {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            NativeWorkspaceBanners(workspace: workspace)

                            NativeSectionCard(
                                title: report.displayName ?? report.overview.datasetName,
                                subtitle: "Analysis workspace"
                            ) {
                                Text(report.insights.summary)
                                    .font(.system(size: 14, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.white.opacity(0.72))

                                HStack(spacing: 10) {
                                    NativeMetricChip(label: "Rows", value: report.overview.rowCount.formatted())
                                    NativeMetricChip(label: "Columns", value: report.overview.columnCount.formatted())
                                    NativeMetricChip(label: "Quality", value: String(format: "%.0f", report.quality.qualityScore))
                                }

                                HStack(spacing: 10) {
                                    Menu {
                                        ForEach(workspace.analyses) { analysis in
                                            Button(analysis.displayName) {
                                                Task {
                                                    await workspace.selectAnalysis(id: analysis.id)
                                                }
                                            }
                                        }
                                    } label: {
                                        Label("Change dataset", systemImage: "list.bullet")
                                    }
                                    .buttonStyle(.bordered)

                                    Button("Open history") {
                                        selectedTab = .history
                                    }
                                    .buttonStyle(.bordered)
                                }
                            }

                            ScrollView(.horizontal, showsIndicators: false) {
                                HStack(spacing: 10) {
                                    ForEach(NativeAnalysisWorkspaceSection.allCases) { section in
                                        Button(section.title) {
                                            activeSection = section
                                        }
                                        .font(.system(size: 13, weight: .semibold, design: .rounded))
                                        .padding(.horizontal, 14)
                                        .padding(.vertical, 10)
                                        .background(activeSection == section ? Color.white : Color.white.opacity(0.06))
                                        .foregroundStyle(activeSection == section ? Color(red: 0.05, green: 0.08, blue: 0.12) : Color.white.opacity(0.78))
                                        .clipShape(Capsule())
                                    }
                                }
                            }

                            analysisSectionContent(report)
                        }
                        .padding(16)
                    }
                } else if workspace.analyses.isEmpty {
                    NativeCenteredState(
                        icon: "tray",
                        title: "No datasets selected",
                        message: "Upload a CSV first, then open it here to use the analysis workspace."
                    ) {
                        Button("Open uploads") {
                            selectedTab = .uploads
                        }
                        .buttonStyle(.borderedProminent)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            NativeWorkspaceBanners(workspace: workspace)

                            NativeSectionCard(title: "Choose a dataset", subtitle: "Saved runs") {
                                Text("Pick one saved run to load the same grouped report flow used by the normal web workspace.")
                                    .font(.system(size: 14, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.white.opacity(0.72))

                                VStack(spacing: 14) {
                                    ForEach(workspace.analyses) { analysis in
                                        NativeSavedAnalysisRow(
                                            analysis: analysis,
                                            primaryActionLabel: "Open report",
                                            primaryAction: {
                                                Task {
                                                    await workspace.selectAnalysis(id: analysis.id)
                                                }
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                }
            }
            .navigationTitle("Analysis")
            .toolbar {
                if workspace.selectedAnalysisId != nil {
                    ToolbarItem(placement: .topBarTrailing) {
                        Button {
                            Task {
                                await workspace.reloadSelectedAnalysis()
                            }
                        } label: {
                            if workspace.isLoadingReport {
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
        .onAppear {
            syncSupervisedTarget()
        }
        .onChange(of: workspace.selectedReport?.analysisId) {
            syncSupervisedTarget()
        }
    }

    private var targetCandidates: [String] {
        guard let report = workspace.selectedReport else {
            return []
        }

        let primary = report.mlCapabilities.supervised.targetCandidates
        if !primary.isEmpty {
            return primary
        }

        return report.schema.targetCandidates
    }

    private func syncSupervisedTarget() {
        if let firstCandidate = targetCandidates.first,
           !targetCandidates.contains(supervisedTargetColumn) {
            supervisedTargetColumn = firstCandidate
        }
    }

    @ViewBuilder
    private func analysisSectionContent(_ report: NativeAnalysisReport) -> some View {
        switch activeSection {
        case .overview:
            NativeSectionCard(title: "What the data says", subtitle: "Summary") {
                Text(report.insights.summary)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.74))

                HStack(spacing: 10) {
                    NativeMetricChip(label: "Missing", value: report.overview.totalMissingValues.formatted())
                    NativeMetricChip(label: "Duplicates", value: report.overview.duplicateRowCount.formatted())
                    NativeMetricChip(label: "Encoding", value: report.overview.encoding.uppercased())
                }

                if !report.insights.findings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Key findings")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(Array(report.insights.findings.prefix(4)), id: \.self) { finding in
                            Text("• \(finding)")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.68))
                        }
                    }
                }
            }

        case .quality:
            NativeSectionCard(title: "Data health", subtitle: "Quality") {
                HStack(spacing: 10) {
                    NativeMetricChip(label: "Score", value: String(format: "%.0f", report.quality.qualityScore))
                    NativeMetricChip(label: "Missing cols", value: report.quality.missingByColumn.count.formatted())
                    NativeMetricChip(label: "Outlier cols", value: report.quality.outlierColumns.count.formatted())
                }

                if !report.quality.recommendations.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recommendations")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(Array(report.quality.recommendations.prefix(6)), id: \.self) { recommendation in
                            Text("• \(recommendation)")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.68))
                        }
                    }
                }

                if !report.quality.missingByColumn.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Missing by column")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(Array(report.quality.missingByColumn.prefix(8))) { column in
                            NativeKeyValueRow(label: column.column, value: "\(column.missingCount) missing • \(nativePercent(column.missingPct))")
                        }
                    }
                }

                if !report.quality.highCorrelations.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Strong relationships")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(Array(report.quality.highCorrelations.prefix(6))) { item in
                            NativeKeyValueRow(label: "\(item.columnA) vs \(item.columnB)", value: String(format: "%.3f", item.correlation))
                        }
                    }
                }
            }

        case .schema:
            NativeSectionCard(title: "Field map", subtitle: "Schema") {
                NativeKeyValueRow(label: "Identifier columns", value: report.schema.identifierColumns.isEmpty ? "None" : report.schema.identifierColumns.joined(separator: ", "))
                NativeKeyValueRow(label: "Target candidates", value: report.schema.targetCandidates.isEmpty ? "None inferred" : report.schema.targetCandidates.joined(separator: ", "))

                ForEach(Array(report.schema.columns.prefix(18))) { column in
                    VStack(alignment: .leading, spacing: 6) {
                        HStack {
                            Text(column.name)
                                .font(.system(size: 14, weight: .bold, design: .rounded))
                                .foregroundStyle(.white)
                            Spacer(minLength: 0)
                            Text(column.inferredType)
                                .font(.system(size: 12, weight: .bold, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.58))
                        }

                        Text("Role: \(column.likelyRole) • Missing \(nativePercent(column.missingPct)) • Unique \(nativePercent(column.uniquePct))")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.64))

                        if !column.sampleValues.isEmpty {
                            Text(column.sampleValues.prefix(3).joined(separator: ", "))
                                .font(.system(size: 12, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.52))
                        }
                    }
                    .padding(12)
                    .background(Color.white.opacity(0.04))
                    .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                }
            }

        case .statistics:
            NativeSectionCard(title: "Patterns", subtitle: "Statistics") {
                if !report.statistics.numericSummary.isEmpty {
                    Text("Numeric columns")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    ForEach(Array(report.statistics.numericSummary.prefix(10))) { item in
                        NativeKeyValueRow(
                            label: item.column,
                            value: "mean \(nativeScalar(item.mean)) • median \(nativeScalar(item.median)) • std \(nativeScalar(item.std))"
                        )
                    }
                }

                if !report.statistics.categoricalSummary.isEmpty {
                    Text("Categorical columns")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    ForEach(Array(report.statistics.categoricalSummary.prefix(8))) { item in
                        NativeKeyValueRow(
                            label: item.column,
                            value: item.topValues.prefix(3).map { "\($0.value) (\($0.count))" }.joined(separator: ", ")
                        )
                    }
                }
            }

        case .insights:
            NativeSectionCard(title: "Findings", subtitle: "Narrative") {
                Text(report.insights.summary)
                    .font(.system(size: 15, weight: .medium, design: .rounded))
                    .foregroundStyle(Color.white.opacity(0.74))

                if !report.insights.findings.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Findings")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(report.insights.findings, id: \.self) { finding in
                            Text("• \(finding)")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.68))
                        }
                    }
                }

                if !report.insights.recommendedNextSteps.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Recommended next steps")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(report.insights.recommendedNextSteps, id: \.self) { step in
                            Text("• \(step)")
                                .font(.system(size: 14, weight: .medium, design: .rounded))
                                .foregroundStyle(Color.white.opacity(0.68))
                        }
                    }
                }

                NativeKeyValueRow(label: "ML-ready", value: report.insights.modelingReadiness.isReady ? "Yes" : "Review first")
                NativeKeyValueRow(label: "Target candidates", value: report.insights.modelingReadiness.targetCandidates.isEmpty ? "None inferred" : report.insights.modelingReadiness.targetCandidates.joined(separator: ", "))
            }

        case .ml:
            NativeSectionCard(title: "ML workspace", subtitle: "Experiments") {
                NativeKeyValueRow(label: "Unsupervised", value: report.mlCapabilities.unsupervised.available ? "Available" : report.mlCapabilities.unsupervised.reason)
                NativeKeyValueRow(label: "Supervised", value: report.mlCapabilities.supervised.available ? "Available" : report.mlCapabilities.supervised.reason)

                VStack(alignment: .leading, spacing: 10) {
                    Text("Unsupervised run")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    Stepper("Clusters: \(clusterCount)", value: $clusterCount, in: 2...8)
                        .tint(.white)

                    Button {
                        Task {
                            await workspace.runUnsupervised(nClusters: clusterCount)
                        }
                    } label: {
                        if workspace.isRunningML {
                            ProgressView()
                                .tint(.white)
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        } else {
                            Text("Run unsupervised scan")
                                .font(.system(size: 14, weight: .semibold, design: .rounded))
                                .frame(maxWidth: .infinity)
                                .padding(.vertical, 10)
                        }
                    }
                    .buttonStyle(.borderedProminent)
                    .disabled(workspace.isRunningML || !report.mlCapabilities.unsupervised.available)
                }

                VStack(alignment: .leading, spacing: 10) {
                    Text("Supervised run")
                        .font(.system(size: 14, weight: .bold, design: .rounded))
                        .foregroundStyle(.white)

                    if targetCandidates.isEmpty {
                        Text("No target candidates are available yet.")
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.58))
                    } else {
                        Picker("Target column", selection: $supervisedTargetColumn) {
                            ForEach(targetCandidates, id: \.self) { column in
                                Text(column).tag(column)
                            }
                        }
                        .pickerStyle(.menu)

                        Button {
                            Task {
                                await workspace.runSupervised(targetColumn: supervisedTargetColumn)
                            }
                        } label: {
                            if workspace.isRunningML {
                                ProgressView()
                                    .tint(.white)
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                            } else {
                                Text("Run supervised benchmark")
                                    .font(.system(size: 14, weight: .semibold, design: .rounded))
                                    .frame(maxWidth: .infinity)
                                    .padding(.vertical, 10)
                            }
                        }
                        .buttonStyle(.borderedProminent)
                        .disabled(workspace.isRunningML || supervisedTargetColumn.isEmpty)
                    }
                }

                if let unsupervised = report.mlResults.unsupervised {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Latest unsupervised result")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        NativeKeyValueRow(label: "Clusters", value: unsupervised.clusterCount.formatted())
                        NativeKeyValueRow(label: "Anomalies", value: unsupervised.anomalyCount.formatted())
                        NativeKeyValueRow(label: "Numeric columns", value: unsupervised.usedNumericColumns.joined(separator: ", "))
                    }
                }

                if let supervised = report.mlResults.supervised {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Latest supervised result")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        NativeKeyValueRow(label: "Target", value: supervised.targetColumn)
                        NativeKeyValueRow(label: "Task", value: supervised.taskType)
                        NativeKeyValueRow(label: "Best model", value: supervised.bestModel)
                        Text(supervised.modelSummary)
                            .font(.system(size: 13, weight: .medium, design: .rounded))
                            .foregroundStyle(Color.white.opacity(0.68))
                    }
                }

                if !report.mlExperiments.isEmpty {
                    VStack(alignment: .leading, spacing: 8) {
                        Text("Saved experiments")
                            .font(.system(size: 14, weight: .bold, design: .rounded))
                            .foregroundStyle(.white)

                        ForEach(Array(report.mlExperiments.prefix(8))) { experiment in
                            VStack(alignment: .leading, spacing: 4) {
                                Text("\(experiment.type.capitalized) • \(nativeDisplayDate(experiment.createdAt))")
                                    .font(.system(size: 13, weight: .bold, design: .rounded))
                                    .foregroundStyle(.white)
                                Text(experiment.summary)
                                    .font(.system(size: 13, weight: .medium, design: .rounded))
                                    .foregroundStyle(Color.white.opacity(0.64))
                                    .lineLimit(3)
                            }
                            .padding(12)
                            .background(Color.white.opacity(0.04))
                            .clipShape(RoundedRectangle(cornerRadius: 14, style: .continuous))
                        }
                    }
                }
            }
        }
    }
}

private enum NativeHistoryReadinessFilter: String, CaseIterable, Identifiable {
    case all
    case mlReady
    case edaFirst

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "All"
        case .mlReady:
            return "ML-ready"
        case .edaFirst:
            return "EDA-first"
        }
    }
}

private enum NativeHistoryMlFilter: String, CaseIterable, Identifiable {
    case all
    case withMl
    case withoutMl

    var id: String { rawValue }

    var title: String {
        switch self {
        case .all:
            return "Any ML"
        case .withMl:
            return "With ML"
        case .withoutMl:
            return "No ML"
        }
    }
}

@MainActor
private struct NativeHistoryView: View {
    @ObservedObject var workspace: NativeAnalysisWorkspaceStore
    @Binding var selectedTab: AppTab

    @State private var searchQuery = ""
    @State private var readinessFilter: NativeHistoryReadinessFilter = .all
    @State private var mlFilter: NativeHistoryMlFilter = .all
    @State private var pendingDeleteAnalysis: NativeAnalysisListItem?

    private var filteredAnalyses: [NativeAnalysisListItem] {
        workspace.analyses.filter { analysis in
            if readinessFilter == .mlReady && !analysis.insights.modelingReadiness.isReady {
                return false
            }

            if readinessFilter == .edaFirst && analysis.insights.modelingReadiness.isReady {
                return false
            }

            if mlFilter == .withMl && analysis.experimentCount == 0 {
                return false
            }

            if mlFilter == .withoutMl && analysis.experimentCount > 0 {
                return false
            }

            let trimmedQuery = searchQuery.trimmingCharacters(in: .whitespacesAndNewlines)
            if trimmedQuery.isEmpty {
                return true
            }

            let haystack = [analysis.displayName, analysis.sourceFilename, analysis.insights.summary, analysis.status]
                .joined(separator: " ")
                .lowercased()

            return haystack.contains(trimmedQuery.lowercased())
        }
    }

    var body: some View {
        NavigationStack {
            Group {
                if workspace.isLoadingAnalyses && workspace.analyses.isEmpty {
                    NativeCenteredState(
                        icon: "clock.arrow.circlepath",
                        title: "Loading history",
                        message: "Fetching saved runs from the backend archive."
                    ) {
                        ProgressView()
                            .tint(.white)
                    }
                } else {
                    ScrollView {
                        VStack(alignment: .leading, spacing: 18) {
                            NativeWorkspaceBanners(workspace: workspace)

                            NativeSectionCard(title: "Archive filters", subtitle: "Saved runs") {
                                Picker("Readiness", selection: $readinessFilter) {
                                    ForEach(NativeHistoryReadinessFilter.allCases) { filter in
                                        Text(filter.title).tag(filter)
                                    }
                                }
                                .pickerStyle(.segmented)

                                Picker("ML", selection: $mlFilter) {
                                    ForEach(NativeHistoryMlFilter.allCases) { filter in
                                        Text(filter.title).tag(filter)
                                    }
                                }
                                .pickerStyle(.segmented)
                            }

                            if filteredAnalyses.isEmpty {
                                NativeCenteredState(
                                    icon: "magnifyingglass",
                                    title: workspace.analyses.isEmpty ? "No history yet" : "No runs match this view",
                                    message: workspace.analyses.isEmpty ? "Upload the first CSV to start building saved-run history." : "Adjust the search or filter combination to widen the archive view."
                                )
                            } else {
                                VStack(spacing: 14) {
                                    ForEach(filteredAnalyses) { analysis in
                                        NativeSavedAnalysisRow(
                                            analysis: analysis,
                                            primaryActionLabel: "Open",
                                            primaryAction: {
                                                Task {
                                                    await workspace.selectAnalysis(id: analysis.id)
                                                    selectedTab = .analysis
                                                }
                                            },
                                            secondaryActionLabel: "Delete",
                                            secondaryAction: {
                                                pendingDeleteAnalysis = analysis
                                            }
                                        )
                                    }
                                }
                            }
                        }
                        .padding(16)
                    }
                    .refreshable {
                        await workspace.refreshAnalyses()
                    }
                    .searchable(text: $searchQuery, prompt: "Search saved runs")
                }
            }
            .navigationTitle("History")
        }
        .alert(
            "Delete saved run?",
            isPresented: Binding(
                get: { pendingDeleteAnalysis != nil },
                set: { isPresented in
                    if !isPresented {
                        pendingDeleteAnalysis = nil
                    }
                }
            ),
            presenting: pendingDeleteAnalysis
        ) { analysis in
            Button("Delete", role: .destructive) {
                Task {
                    _ = await workspace.deleteAnalysis(id: analysis.id)
                    pendingDeleteAnalysis = nil
                }
            }
            Button("Cancel", role: .cancel) {
                pendingDeleteAnalysis = nil
            }
        } message: { analysis in
            Text("This removes \(analysis.displayName) from the saved-run archive.")
        }
    }
}

private struct NativeKeyValueRow: View {
    let label: String
    let value: String

    var body: some View {
        HStack(alignment: .top, spacing: 12) {
            Text(label)
                .font(.system(size: 13, weight: .semibold, design: .rounded))
                .foregroundStyle(Color.white.opacity(0.56))
                .frame(maxWidth: .infinity, alignment: .leading)

            Text(value)
                .font(.system(size: 13, weight: .medium, design: .rounded))
                .foregroundStyle(.white)
                .multilineTextAlignment(.trailing)
                .frame(maxWidth: .infinity, alignment: .trailing)
        }
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
private final class NativeAnalysisWorkspaceStore: ObservableObject {
    @Published private(set) var accessToken: String?
    @Published private(set) var analyses: [NativeAnalysisListItem] = []
    @Published private(set) var selectedAnalysisId: Int?
    @Published private(set) var selectedReport: NativeAnalysisReport?
    @Published private(set) var isLoadingAnalyses = false
    @Published private(set) var isLoadingReport = false
    @Published private(set) var isUploading = false
    @Published private(set) var isRunningML = false
    @Published var noticeMessage: String?
    @Published var errorMessage: String?

    var selectedAnalysis: NativeAnalysisListItem? {
        analyses.first(where: { $0.id == selectedAnalysisId })
    }

    func clearMessages() {
        noticeMessage = nil
        errorMessage = nil
    }

    func configure(accessToken: String?) async {
        let normalizedToken = accessToken?.trimmingCharacters(in: .whitespacesAndNewlines)
        let nextToken = (normalizedToken?.isEmpty == false) ? normalizedToken : nil

        if self.accessToken == nextToken {
            if nextToken != nil && analyses.isEmpty {
                await refreshAnalyses()
            }
            return
        }

        self.accessToken = nextToken
        analyses = []
        selectedAnalysisId = nil
        selectedReport = nil
        clearMessages()

        guard nextToken != nil else {
            return
        }

        await refreshAnalyses()
    }

    func refreshAnalyses(select preferredSelection: Int? = nil) async {
        guard let accessToken, !accessToken.isEmpty else {
            analyses = []
            selectedAnalysisId = nil
            selectedReport = nil
            return
        }

        if isLoadingAnalyses {
            return
        }

        isLoadingAnalyses = true
        defer { isLoadingAnalyses = false }

        do {
            let items = try await NativeAnalysisService.fetchAnalyses(accessToken: accessToken)
            analyses = items

            let nextSelection = preferredSelection ?? selectedAnalysisId
            if let nextSelection, !items.contains(where: { $0.id == nextSelection }) {
                selectedAnalysisId = nil
                selectedReport = nil
            }
        } catch {
            errorMessage = error.localizedDescription
        }
    }

    @discardableResult
    func selectAnalysis(id: Int) async -> Bool {
        guard let accessToken, !accessToken.isEmpty else {
            errorMessage = "Sign in again to load this analysis."
            return false
        }

        isLoadingReport = true
        errorMessage = nil
        defer { isLoadingReport = false }

        do {
            let report = try await NativeAnalysisService.fetchAnalysis(analysisId: id, accessToken: accessToken)
            selectedAnalysisId = id
            selectedReport = report
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    func reloadSelectedAnalysis() async {
        guard let selectedAnalysisId else {
            await refreshAnalyses()
            return
        }

        _ = await selectAnalysis(id: selectedAnalysisId)
    }

    @discardableResult
    func uploadCSV(from fileURL: URL) async -> Bool {
        guard let accessToken, !accessToken.isEmpty else {
            errorMessage = "Sign in again before uploading a CSV."
            return false
        }

        isUploading = true
        errorMessage = nil
        defer { isUploading = false }

        let didAccessSecurityScopedResource = fileURL.startAccessingSecurityScopedResource()
        defer {
            if didAccessSecurityScopedResource {
                fileURL.stopAccessingSecurityScopedResource()
            }
        }

        do {
            let report = try await NativeAnalysisService.uploadAnalysis(fileURL: fileURL, accessToken: accessToken)
            selectedAnalysisId = report.analysisId
            selectedReport = report
            noticeMessage = "Uploaded \(report.sourceFilename ?? fileURL.lastPathComponent) and opened the report in Analysis."
            await refreshAnalyses(select: report.analysisId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func deleteAnalysis(id: Int) async -> Bool {
        guard let accessToken, !accessToken.isEmpty else {
            errorMessage = "Sign in again before deleting a saved run."
            return false
        }

        errorMessage = nil

        do {
            _ = try await NativeAnalysisService.deleteAnalysis(analysisId: id, accessToken: accessToken)
            if selectedAnalysisId == id {
                selectedAnalysisId = nil
                selectedReport = nil
            }
            noticeMessage = "Saved run deleted from the archive."
            await refreshAnalyses(select: selectedAnalysisId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func runUnsupervised(nClusters: Int) async -> Bool {
        guard let accessToken, !accessToken.isEmpty, let selectedAnalysisId else {
            errorMessage = "Choose an analysis before running ML."
            return false
        }

        isRunningML = true
        errorMessage = nil
        defer { isRunningML = false }

        do {
            _ = try await NativeAnalysisService.runUnsupervised(
                analysisId: selectedAnalysisId,
                accessToken: accessToken,
                nClusters: nClusters
            )
            noticeMessage = "Unsupervised experiment saved to this analysis."
            _ = await selectAnalysis(id: selectedAnalysisId)
            await refreshAnalyses(select: selectedAnalysisId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
    }

    @discardableResult
    func runSupervised(targetColumn: String) async -> Bool {
        guard let accessToken, !accessToken.isEmpty, let selectedAnalysisId else {
            errorMessage = "Choose an analysis before running ML."
            return false
        }

        let trimmedTarget = targetColumn.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !trimmedTarget.isEmpty else {
            errorMessage = "Choose a target column before running the supervised benchmark."
            return false
        }

        isRunningML = true
        errorMessage = nil
        defer { isRunningML = false }

        do {
            _ = try await NativeAnalysisService.runSupervised(
                analysisId: selectedAnalysisId,
                accessToken: accessToken,
                targetColumn: trimmedTarget
            )
            noticeMessage = "Supervised experiment saved to this analysis."
            _ = await selectAnalysis(id: selectedAnalysisId)
            await refreshAnalyses(select: selectedAnalysisId)
            return true
        } catch {
            errorMessage = error.localizedDescription
            return false
        }
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
                await requestLoginCode(for: challenge)
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

        await requestLoginCode(for: challenge)
    }

    private func requestLoginCode(for challenge: NativeLoginChallenge) async {
        isBusy = true
        errorMessage = nil
        defer { isBusy = false }

        do {
            let refreshedChallenge = try await NativeAuthService.sendLoginCode(challengeToken: challenge.challengeToken)
            loginChallenge = refreshedChallenge
        } catch {
            loginChallenge = challenge
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

    static func fetchAnalysis(analysisId: Int, accessToken: String) async throws -> NativeAnalysisReport {
        try await NativeAPIClient.get(path: "/analysis/\(analysisId)", authorizedToken: accessToken, responseType: NativeAnalysisReport.self)
    }

    static func uploadAnalysis(fileURL: URL, accessToken: String) async throws -> NativeAnalysisReport {
        try await NativeAPIClient.uploadFile(
            path: "/analysis/upload",
            fileURL: fileURL,
            fieldName: "file",
            authorizedToken: accessToken,
            responseType: NativeAnalysisReport.self
        )
    }

    static func deleteAnalysis(analysisId: Int, accessToken: String) async throws -> NativeDeleteResponse {
        try await NativeAPIClient.delete(path: "/analysis/\(analysisId)", authorizedToken: accessToken, responseType: NativeDeleteResponse.self)
    }

    static func runUnsupervised(analysisId: Int, accessToken: String, nClusters: Int) async throws -> NativeUnsupervisedResult {
        try await NativeAPIClient.post(
            path: "/analysis/\(analysisId)/ml/unsupervised",
            body: NativeUnsupervisedRequest(nClusters: nClusters),
            authorizedToken: accessToken,
            responseType: NativeUnsupervisedResult.self
        )
    }

    static func runSupervised(analysisId: Int, accessToken: String, targetColumn: String) async throws -> NativeSupervisedResult {
        try await NativeAPIClient.post(
            path: "/analysis/\(analysisId)/ml/supervised",
            body: NativeSupervisedRequest(targetColumn: targetColumn),
            authorizedToken: accessToken,
            responseType: NativeSupervisedResult.self
        )
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

private struct NativeUnsupervisedRequest: Encodable {
    let nClusters: Int
}

private struct NativeSupervisedRequest: Encodable {
    let targetColumn: String
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

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        requiresTwoFactor = container.decodeBool(forKey: .requiresTwoFactor, defaultValue: false)
        challengeToken = container.decodeLossyStringIfPresent(forKey: .challengeToken)
        email = container.decodeLossyStringIfPresent(forKey: .email)
        codeSent = container.decodeLossyBoolIfPresent(forKey: .codeSent)
        expiresInSeconds = container.decodeLossyIntIfPresent(forKey: .expiresInSeconds)
        resendAvailableInSeconds = container.decodeLossyIntIfPresent(forKey: .resendAvailableInSeconds)
        accessToken = container.decodeLossyStringIfPresent(forKey: .accessToken)
        tokenType = container.decodeLossyStringIfPresent(forKey: .tokenType)
        user = try container.decodeIfPresent(NativeUser.self, forKey: .user)
    }
}

private struct NativeLoginChallenge: Decodable {
    let challengeToken: String
    let email: String
    let codeSent: Bool
    let expiresInSeconds: Int
    let resendAvailableInSeconds: Int

    init(
        challengeToken: String,
        email: String,
        codeSent: Bool,
        expiresInSeconds: Int,
        resendAvailableInSeconds: Int
    ) {
        self.challengeToken = challengeToken
        self.email = email
        self.codeSent = codeSent
        self.expiresInSeconds = expiresInSeconds
        self.resendAvailableInSeconds = resendAvailableInSeconds
    }

    private enum CodingKeys: String, CodingKey {
        case challengeToken
        case email
        case codeSent
        case expiresInSeconds
        case resendAvailableInSeconds
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        challengeToken = container.decodeLossyStringIfPresent(forKey: .challengeToken) ?? ""
        email = container.decodeLossyStringIfPresent(forKey: .email) ?? ""
        codeSent = container.decodeBool(forKey: .codeSent, defaultValue: true)
        expiresInSeconds = container.decodeInt(forKey: .expiresInSeconds, defaultValue: 0)
        resendAvailableInSeconds = container.decodeInt(forKey: .resendAvailableInSeconds, defaultValue: 0)
    }
}

private struct NativeLoginSuccess: Decodable {
    let accessToken: String
    let tokenType: String
    let user: NativeUser

    init(accessToken: String, tokenType: String, user: NativeUser) {
        self.accessToken = accessToken
        self.tokenType = tokenType
        self.user = user
    }

    private enum CodingKeys: String, CodingKey {
        case accessToken
        case tokenType
        case user
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = container.decodeLossyStringIfPresent(forKey: .accessToken) ?? ""
        tokenType = container.decodeLossyStringIfPresent(forKey: .tokenType) ?? "bearer"
        user = try container.decode(NativeUser.self, forKey: .user)
    }
}

private struct NativeRefreshResponse: Decodable {
    let accessToken: String
    let tokenType: String

    private enum CodingKeys: String, CodingKey {
        case accessToken
        case tokenType
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        accessToken = container.decodeLossyStringIfPresent(forKey: .accessToken) ?? ""
        tokenType = container.decodeLossyStringIfPresent(forKey: .tokenType) ?? "bearer"
    }
}

private struct NativeMessageResponse: Decodable {
    let message: String?
}

private struct NativeDeleteResponse: Decodable {
    let success: Bool
    let id: Int?
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

    private enum CodingKeys: String, CodingKey {
        case id
        case email
        case username
        case fullName
        case dateOfBirth
        case twoFactorEnabled
        case isActive
        case createdAt
    }

    init(from decoder: Decoder) throws {
        let container = try decoder.container(keyedBy: CodingKeys.self)
        id = container.decodeInt(forKey: .id, defaultValue: 0)
        email = container.decodeLossyStringIfPresent(forKey: .email) ?? ""
        username = container.decodeLossyStringIfPresent(forKey: .username)
        fullName = container.decodeLossyStringIfPresent(forKey: .fullName)
        dateOfBirth = container.decodeLossyStringIfPresent(forKey: .dateOfBirth)
        twoFactorEnabled = container.decodeBool(forKey: .twoFactorEnabled, defaultValue: false)
        isActive = container.decodeBool(forKey: .isActive, defaultValue: true)
        createdAt = container.decodeLossyStringIfPresent(forKey: .createdAt) ?? ""
    }
}

private struct NativeAnalysisListItem: Decodable, Identifiable {
    let id: Int
    let displayName: String
    let sourceFilename: String
    let savedAt: String
    let experimentCount: Int
    let latestExperiment: NativeMlExperimentSummary?
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
    let typeCounts: [String: Int]
}

private struct NativeAnalysisReport: Decodable {
    let analysisId: Int
    let displayName: String?
    let sourceFilename: String?
    let savedAt: String?
    let analysisVersion: String
    let overview: NativeAnalysisOverview
    let schema: NativeAnalysisSchema
    let quality: NativeAnalysisQuality
    let statistics: NativeAnalysisStatistics
    let insights: NativeAnalysisInsights
    let mlCapabilities: NativeAnalysisMlCapabilities
    let mlResults: NativeAnalysisMlResults
    let mlExperiments: [NativeMlExperimentSummary]
    let downloadUrl: String?
}

private struct NativeAnalysisSchema: Decodable {
    let rowCount: Int
    let columnCount: Int
    let typeCounts: [String: Int]
    let columns: [NativeSchemaColumn]
    let identifierColumns: [String]
    let targetCandidates: [String]
}

private struct NativeSchemaColumn: Decodable, Identifiable {
    let name: String
    let inferredType: String
    let likelyRole: String
    let nonNullCount: Int
    let nonNullPct: Double
    let missingCount: Int
    let missingPct: Double
    let uniqueCount: Int
    let uniquePct: Double
    let sampleValues: [String]

    var id: String { name }
}

private struct NativeAnalysisQuality: Decodable {
    let duplicateRowCount: Int
    let missingByColumn: [NativeMissingColumnSummary]
    let constantColumns: [String]
    let outlierColumns: [NativeOutlierColumnSummary]
    let highCorrelations: [NativeCorrelationSummary]
    let qualityScore: Double
    let recommendations: [String]
}

private struct NativeMissingColumnSummary: Decodable, Identifiable {
    let column: String
    let missingCount: Int
    let missingPct: Double

    var id: String { column }
}

private struct NativeOutlierColumnSummary: Decodable, Identifiable {
    let column: String
    let outlierCount: Int
    let outlierPct: Double

    var id: String { column }
}

private struct NativeCorrelationSummary: Decodable, Identifiable {
    let columnA: String
    let columnB: String
    let correlation: Double

    var id: String { "\(columnA)-\(columnB)" }
}

private struct NativeAnalysisStatistics: Decodable {
    let numericSummary: [NativeNumericSummary]
    let categoricalSummary: [NativeCategoricalSummary]
    let datetimeSummary: [NativeDatetimeSummary]
}

private struct NativeNumericSummary: Decodable, Identifiable {
    let column: String
    let count: Int
    let mean: Double?
    let median: Double?
    let std: Double?
    let min: Double?
    let max: Double?
    let q1: Double?
    let q3: Double?
    let skew: Double?

    var id: String { column }
}

private struct NativeCategoricalSummary: Decodable, Identifiable {
    let column: String
    let uniqueCount: Int
    let topValues: [NativeCategoryValue]

    var id: String { column }
}

private struct NativeCategoryValue: Decodable, Identifiable {
    let value: String
    let count: Int
    let pct: Double

    var id: String { "\(value)-\(count)" }
}

private struct NativeDatetimeSummary: Decodable, Identifiable {
    let column: String
    let min: String
    let max: String
    let spanDays: Int

    var id: String { column }
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

private struct NativeAnalysisMlCapabilities: Decodable {
    let unsupervised: NativeUnsupervisedCapability
    let supervised: NativeSupervisedCapability
}

private struct NativeUnsupervisedCapability: Decodable {
    let available: Bool
    let reason: String
}

private struct NativeSupervisedCapability: Decodable {
    let available: Bool
    let reason: String
    let targetCandidates: [String]
    let targetRecommendations: [NativeTargetRecommendation]
}

private struct NativeTargetRecommendation: Decodable, Identifiable {
    let column: String
    let recommendedTask: String
    let verdict: String
    let score: Double
    let reasons: [String]

    var id: String { column }
}

private struct NativeAnalysisMlResults: Decodable {
    let unsupervised: NativeUnsupervisedResult?
    let supervised: NativeSupervisedResult?
}

private struct NativeMlExperimentSummary: Decodable, Identifiable {
    let id: String
    let type: String
    let createdAt: String
    let summary: String
    let downloadUrl: String?
    let summaryDownloadUrl: String?
}

private struct NativeUnsupervisedResult: Decodable {
    let clusterCount: Int
    let anomalyCount: Int
    let pcaExplainedVariance: [Double]
    let usedNumericColumns: [String]
    let experiment: NativeMlExperimentSummary?
}

private struct NativeSupervisedResult: Decodable {
    let taskType: String
    let targetColumn: String
    let bestModel: String
    let modelSummary: String
    let warnings: [String]
    let featureImportance: [NativeFeatureImportance]
    let targetRecommendation: NativeTargetRecommendation?
    let experiment: NativeMlExperimentSummary?
}

private struct NativeFeatureImportance: Decodable, Identifiable {
    let feature: String
    let importance: Double

    var id: String { feature }
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

    static func delete<Response: Decodable>(path: String, authorizedToken: String?, responseType: Response.Type) async throws -> Response {
        let request = try buildRequest(path: path, method: "DELETE", authorizedToken: authorizedToken, body: nil)
        return try await send(request, responseType: responseType)
    }

    static func post<Body: Encodable, Response: Decodable>(path: String, body: Body, authorizedToken: String?, responseType: Response.Type) async throws -> Response {
        let bodyData = try encoder.encode(body)
        let request = try buildRequest(path: path, method: "POST", authorizedToken: authorizedToken, body: bodyData)
        return try await send(request, responseType: responseType)
    }

    static func uploadFile<Response: Decodable>(
        path: String,
        fileURL: URL,
        fieldName: String,
        authorizedToken: String?,
        responseType: Response.Type
    ) async throws -> Response {
        let boundary = "Boundary-\(UUID().uuidString)"
        let filename = fileURL.lastPathComponent
        let fileData: Data

        do {
            fileData = try Data(contentsOf: fileURL)
        } catch {
            throw NativeAppError(message: "The selected file could not be read from Files.")
        }

        var body = Data()
        body.appendString("--\(boundary)\r\n")
        body.appendString("Content-Disposition: form-data; name=\"\(fieldName)\"; filename=\"\(filename)\"\r\n")
        body.appendString("Content-Type: text/csv\r\n\r\n")
        body.append(fileData)
        body.appendString("\r\n--\(boundary)--\r\n")

        let request = try buildRequest(
            path: path,
            method: "POST",
            authorizedToken: authorizedToken,
            body: body,
            contentType: "multipart/form-data; boundary=\(boundary)"
        )

        return try await send(request, responseType: responseType)
    }

    private static func buildRequest(
        path: String,
        method: String,
        authorizedToken: String?,
        body: Data?,
        contentType: String? = nil
    ) throws -> URLRequest {
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
            request.setValue(contentType ?? "application/json", forHTTPHeaderField: "Content-Type")
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

        if let detailItems = json["detail"] as? [[String: Any]], !detailItems.isEmpty {
            let flattened = detailItems.compactMap { item -> String? in
                let message = item["msg"] as? String
                let location = (item["loc"] as? [Any])?.map { String(describing: $0) }.joined(separator: ".")
                if let message, let location, !location.isEmpty {
                    return "\(location): \(message)"
                }
                return message
            }

            if !flattened.isEmpty {
                return flattened.joined(separator: "\n")
            }
        }

        if let detailItems = json["detail"] as? [String], !detailItems.isEmpty {
            return detailItems.joined(separator: "\n")
        }

        if let message = json["message"] as? String, !message.isEmpty {
            return message
        }

        return fallback
    }
}

private extension Data {
    mutating func appendString(_ value: String) {
        if let data = value.data(using: .utf8) {
            append(data)
        }
    }
}

private extension KeyedDecodingContainer {
    func decodeLossyStringIfPresent(forKey key: K) -> String? {
        if let value = (try? decodeIfPresent(String.self, forKey: key)) ?? nil {
            return value
        }

        if let value = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil {
            return String(value)
        }

        if let value = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil {
            return String(value)
        }

        if let value = (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil {
            return value ? "true" : "false"
        }

        return nil
    }

    func decodeLossyIntIfPresent(forKey key: K) -> Int? {
        if let value = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil {
            return value
        }

        if let value = (try? decodeIfPresent(String.self, forKey: key)) ?? nil {
            return Int(value)
        }

        if let value = (try? decodeIfPresent(Double.self, forKey: key)) ?? nil {
            return Int(value)
        }

        return nil
    }

    func decodeLossyBoolIfPresent(forKey key: K) -> Bool? {
        if let value = (try? decodeIfPresent(Bool.self, forKey: key)) ?? nil {
            return value
        }

        if let value = (try? decodeIfPresent(String.self, forKey: key)) ?? nil {
            switch value.trimmingCharacters(in: .whitespacesAndNewlines).lowercased() {
            case "true", "1", "yes":
                return true
            case "false", "0", "no":
                return false
            default:
                return nil
            }
        }

        if let value = (try? decodeIfPresent(Int.self, forKey: key)) ?? nil {
            return value != 0
        }

        return nil
    }

    func decodeInt(forKey key: K, defaultValue: Int) -> Int {
        decodeLossyIntIfPresent(forKey: key) ?? defaultValue
    }

    func decodeBool(forKey key: K, defaultValue: Bool) -> Bool {
        decodeLossyBoolIfPresent(forKey: key) ?? defaultValue
    }
}

private func nativeDisplayDate(_ value: String?) -> String {
    guard let value, !value.isEmpty else {
        return "Unknown date"
    }

    let formatters: [ISO8601DateFormatter] = {
        let fractional = ISO8601DateFormatter()
        fractional.formatOptions = [.withInternetDateTime, .withFractionalSeconds]

        let plain = ISO8601DateFormatter()
        plain.formatOptions = [.withInternetDateTime]
        return [fractional, plain]
    }()

    for formatter in formatters {
        if let date = formatter.date(from: value) {
            return NativeDateFormatter.output.string(from: date)
        }
    }

    return value.replacingOccurrences(of: "T", with: " ").replacingOccurrences(of: "Z", with: "")
}

private func nativePercent(_ value: Double?) -> String {
    guard let value else {
        return "n/a"
    }

    return String(format: "%.1f%%", value * 100)
}

private func nativeScalar(_ value: Double?) -> String {
    guard let value else {
        return "n/a"
    }

    return String(format: "%.2f", value)
}

private enum NativeDateFormatter {
    static let output: DateFormatter = {
        let formatter = DateFormatter()
        formatter.dateStyle = .medium
        formatter.timeStyle = .short
        return formatter
    }()
}