#!/usr/bin/env bash
# Builds Halftime Show for Safari and wraps it in a Mac app, which is how Safari runs extensions.
# Run on a Mac with Xcode: bash scripts/safari-app.sh
# It makes the Safari build, converts it with Apple's safari-web-extension-converter into safari/ (git-ignored),
# builds the app signed to run locally, and opens it. Run it again after changing the code.
set -euo pipefail

APP_NAME="Halftime Show"
BUNDLE_ID="com.danfirsten.halftime-show"

cd "$(dirname "$0")/.."
ROOT="$(pwd)"
OUT="$ROOT/safari"

if [ "$(uname -s)" != "Darwin" ]; then
  echo "This script runs on a Mac only: Safari extensions are built with Xcode." >&2
  echo "Elsewhere, npm run build:safari makes the Safari build, and a Mac wraps it into the app." >&2
  exit 1
fi
if ! xcodebuild -version >/dev/null 2>&1 || ! xcrun --find safari-web-extension-converter >/dev/null 2>&1; then
  echo "This script needs Xcode (the full app, not only the command line tools)." >&2
  echo "Install it from the App Store, open it once, then run: sudo xcode-select -s /Applications/Xcode.app" >&2
  exit 1
fi

echo "1/3 Building the Safari extension"
HALFTIME_RELEASE=1 HALFTIME_OUT_DIR="$ROOT/.output" npm run build:safari
BUILD="$ROOT/.output/safari-mv3"

echo "2/3 Wrapping it in a Mac app in safari/"
xcrun safari-web-extension-converter "$BUILD" \
  --project-location "$OUT" \
  --app-name "$APP_NAME" \
  --bundle-identifier "$BUNDLE_ID" \
  --macos-only --swift --copy-resources --no-open --no-prompt --force

echo "3/3 Building the app, signed to run on this Mac"
PROJECT="$OUT/$APP_NAME/$APP_NAME.xcodeproj"
if xcodebuild -project "$PROJECT" -scheme "$APP_NAME" -configuration Debug \
  -derivedDataPath "$OUT/build" CODE_SIGN_IDENTITY=- DEVELOPMENT_TEAM= -quiet build; then
  APP="$OUT/build/Build/Products/Debug/$APP_NAME.app"
  open "$APP"
  echo
  echo "Built and opened: $APP"
else
  echo
  echo "The command line build didn't finish. Open the project in Xcode and press Run instead:"
  echo "  open \"$PROJECT\""
fi

cat <<'NEXT'

Next, in Safari:
  1. Safari > Settings > Advanced: tick "Show features for web developers".
  2. Develop > Developer Settings: tick "Allow unsigned extensions" (Safari asks again each time it restarts).
  3. Safari > Settings > Extensions: turn on Halftime Show.
  4. Open hulu.com, click the Halftime Show button by the address bar and allow it on hulu.com ("Always Allow on This Website").
More in README.md, under Safari.
NEXT
