#!/bin/bash
# Native macOS application: no Python or terminal is needed by its users.
set -euo pipefail
repo_root="$(cd "$(dirname "$0")/.." && pwd)"
out_dir="$repo_root/dist/chatgpt-macos"
build_dir="$(mktemp -d "${TMPDIR:-/tmp}/counselorbot-chatgpt-build.XXXXXX")"
trap 'rm -rf "$build_dir"' EXIT
sdk_path="$(xcrun --sdk macosx --show-sdk-path)"
sources=("$repo_root/tools/chatgpt-macos/Protocol.swift" "$repo_root/tools/chatgpt-macos/Connector.swift" "$repo_root/tools/chatgpt-macos/main.swift")
mkdir -p "$out_dir"
# Tests are a separate executable; test fixtures/entry points are never packaged.
xcrun swiftc -swift-version 5 -D SELF_TEST -sdk "$sdk_path" -target "$(uname -m)-apple-macosx12.0" \
    "${sources[@]}" "$repo_root/tools/chatgpt-macos/SelfTests.swift" -o "$build_dir/protocol-tests"
"$build_dir/protocol-tests"
for architecture in arm64 x86_64; do
    xcrun swiftc -swift-version 5 -O -sdk "$sdk_path" -target "$architecture-apple-macosx12.0" \
        "${sources[@]}" -o "$build_dir/helper-$architecture"
done
app_dir="$build_dir/CounselorBot-ChatGPT.app"
mkdir -p "$app_dir/Contents/MacOS"
xcrun lipo -create "$build_dir/helper-arm64" "$build_dir/helper-x86_64" -output "$app_dir/Contents/MacOS/CounselorBot-ChatGPT"
cat > "$app_dir/Contents/Info.plist" <<'PLIST'
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleName</key><string>CounselorBot ChatGPT</string>
<key>CFBundleDisplayName</key><string>CounselorBot ChatGPT</string>
<key>CFBundleIdentifier</key><string>net.labform.counselorbot.chatgpt-connect</string>
<key>CFBundleVersion</key><string>1</string>
<key>CFBundleShortVersionString</key><string>1.0.0</string>
<key>CFBundleExecutable</key><string>CounselorBot-ChatGPT</string>
<key>CFBundlePackageType</key><string>APPL</string>
<key>LSMinimumSystemVersion</key><string>12.0</string>
<key>NSHighResolutionCapable</key><true/>
<key>NSPrincipalClass</key><string>NSApplication</string>
<key>NSAppTransportSecurity</key><dict><key>NSAllowsLocalNetworking</key><true/></dict>
</dict></plist>
PLIST
# Ad-hoc signature supports Apple Silicon execution; it is not Developer ID
# signing/notarization. Gatekeeper may require an explicit local approval.
codesign --force --sign - "$app_dir"
codesign --verify --strict "$app_dir"
xcrun lipo "$app_dir/Contents/MacOS/CounselorBot-ChatGPT" -verify_arch arm64 x86_64
ditto -c -k --keepParent "$app_dir" "$build_dir/CounselorBot-ChatGPT.zip"
mv "$build_dir/CounselorBot-ChatGPT.zip" "$out_dir/CounselorBot-ChatGPT.zip"
(cd "$out_dir" && shasum -a 256 CounselorBot-ChatGPT.zip > CounselorBot-ChatGPT.zip.sha256)
echo "Built universal macOS app: $out_dir/CounselorBot-ChatGPT.zip"
echo "Ad-hoc signed; not notarized. Gatekeeper may require local user approval."
