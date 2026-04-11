import SwiftUI

struct GlassTabBar: View {
    @Binding var selectedTab: AppTab
    @Environment(\.horizontalSizeClass) private var horizontalSizeClass

    var body: some View {
        HStack(spacing: horizontalSizeClass == .regular ? 10 : 6) {
            ForEach(AppTab.allCases) { tab in
                Button {
                    selectedTab = tab
                } label: {
                    VStack(spacing: 4) {
                        Image(systemName: tab.symbolName)
                            .font(.system(size: 16, weight: .semibold))

                        Text(tab.title)
                            .font(.system(size: 11, weight: .semibold, design: .rounded))
                            .lineLimit(1)
                    }
                    .frame(maxWidth: .infinity, minHeight: 46)
                    .padding(.horizontal, isSelected(tab) ? 14 : 10)
                    .foregroundStyle(isSelected(tab) ? Color.white : Color.white.opacity(0.72))
                    .background {
                        if isSelected(tab) {
                            ZStack {
                                Capsule().fill(.thinMaterial)
                                Capsule()
                                    .fill(
                                        LinearGradient(
                                            colors: [
                                                Color.white.opacity(0.24),
                                                Color.white.opacity(0.08),
                                                Color.white.opacity(0.04),
                                            ],
                                            startPoint: .top,
                                            endPoint: .bottom
                                        )
                                    )
                                Capsule().stroke(Color.white.opacity(0.18), lineWidth: 1)
                                Capsule().inset(by: 1).stroke(Color.white.opacity(0.10), lineWidth: 1)
                            }
                            .shadow(color: Color.black.opacity(0.18), radius: 10, y: 4)
                        }
                    }
                }
                .buttonStyle(.plain)
            }
        }
        .padding(.horizontal, 8)
        .padding(.vertical, 8)
        .background {
            ZStack {
                Capsule().fill(.ultraThinMaterial)
                Capsule()
                    .fill(
                        LinearGradient(
                            colors: [
                                Color.white.opacity(0.16),
                                Color.white.opacity(0.06),
                                Color.white.opacity(0.03),
                            ],
                            startPoint: .top,
                            endPoint: .bottom
                        )
                    )
                Capsule().stroke(Color.white.opacity(0.22), lineWidth: 1)
                Capsule().inset(by: 1).stroke(Color.white.opacity(0.10), lineWidth: 1)

                Ellipse()
                    .fill(Color.white.opacity(0.16))
                    .frame(width: horizontalSizeClass == .regular ? 180 : 120, height: 32)
                    .blur(radius: 20)
                    .offset(x: horizontalSizeClass == .regular ? -74 : -48, y: -18)
            }
        }
        .shadow(color: Color.black.opacity(0.28), radius: 22, y: 10)
    }

    private func isSelected(_ tab: AppTab) -> Bool {
        selectedTab == tab
    }
}