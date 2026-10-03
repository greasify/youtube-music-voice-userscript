#!/bin/zsh
set -euo pipefail

cd "$(dirname "$0")"
swift build -c release
BIN="$(swift build -c release --show-bin-path)"
APP="YouTubeMusicVoice.app"

rm -rf "$APP"
mkdir -p "$APP/Contents/MacOS"
cp "$BIN/YouTubeMusicVoice" "$APP/Contents/MacOS/YouTubeMusicVoice"
cp Support/Info.plist "$APP/Contents/Info.plist"
codesign --force --deep --sign - "$APP"
echo "Built $(pwd)/$APP"
