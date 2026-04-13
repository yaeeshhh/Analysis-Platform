# Analysis Studio Xcode App

This directory now holds the committed Apple app scaffold and first native iPhone slice.

Current layout:
- `AnalysisStudio/` contains the SwiftUI app source files.
- `AnalysisStudio/Resources/Assets.xcassets/` contains local placeholder app assets for handoff into Xcode.
- `AnalysisStudio/Resources/PreviewContent/` is reserved for SwiftUI preview assets.
- `project.yml` contains the XcodeGen spec for generating the project.
- Full Xcode is still required to generate and run the actual `.xcodeproj`.

What this is for:
- Keep the Apple app work alongside the web and backend code in the same repository.
- Let you generate or open the Xcode project directly inside this directory.
- Preserve the shell fallback while the native rewrite is in progress.
- Give you a standard place to drop real app icons and resource files.

Suggested next steps after Xcode is installed:
1. Install Xcode and open it once to finish setup.
2. Install XcodeGen if you want to generate from `project.yml`.
3. From this directory run `xcodegen generate`.
4. Open `AnalysisStudio.xcodeproj` in Xcode.
5. Set signing, bundle identifier, app icons, and capabilities.

Notes:
- The app can now start in `native` or `shell` mode via `ANALYSIS_STUDIO_APP_MODE`.
- `native` mode is the in-progress SwiftUI rewrite that talks to the backend directly.
- `shell` mode preserves the existing embedded-frontend fallback inside `WKWebView`.
- The configured web base URL lives in `project.yml`.
- The configured backend API base URL also lives in `project.yml`.
- Placeholder asset-catalog files are already in place so `AppIcon` and `AccentColor` resolve once the project is generated.
- The committed `.xcodeproj` builds in the simulator, and `project.yml` remains the source-of-truth spec for regeneration.

Resource handoff:
1. Put the real app icon PNG files into `AnalysisStudio/Resources/Assets.xcassets/AppIcon.appiconset/`.
2. Adjust `AccentColor.colorset` if you want a different default brand accent in previews and system surfaces.
3. Keep future SwiftUI preview-only assets inside `AnalysisStudio/Resources/PreviewContent/`.
4. Run `xcodegen generate` from `xcode/` after Xcode and XcodeGen are installed.
