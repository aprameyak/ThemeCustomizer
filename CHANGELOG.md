# Change Log

All notable changes to the "custom-code" extension will be documented in this file.

## [0.2.0] - 2026-04-30

### Fixed
- Extension now activates immediately and appears in the Command Palette on install
- Export theme now opens a proper Save dialog instead of writing to an unpredictable path
- Applying a custom theme no longer wipes unrelated syntax color customizations (textMateRules are merged, not replaced)

### Changed
- Hex color fields are now editable — type a hex value directly to update the color picker
- Clicking a preset card now applies it immediately without a second button click
- Auto-apply, show hex values, and remember settings configuration options now work as documented

## [0.1.0] - 2026-02-03

### Added
- Professional extension logo
- Theme Customizer webview with visual color picker interface
- Comprehensive theme customization including:
  - Editor colors (background, foreground, line numbers, selection)
  - UI colors (sidebar, activity bar)
  - Syntax highlighting (keywords, strings, comments, numbers, functions, variables)
- Success/error notification messages
- Professional UI with organized color sections
- Command: "Open Theme Customizer" to launch the customizer

### Features
- Real-time theme application
- Proper TextMate grammar scope targeting for syntax colors
- Global configuration updates that persist across sessions
