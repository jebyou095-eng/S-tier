#!/usr/bin/env bash
# Builds dist/PocketStats.apk without Gradle or the full Android SDK.
# Needs (Ubuntu/Debian): apt-get install aapt apksigner zipalign dalvik-exchange android-sdk-platform-23 default-jdk
#
# Signing: the key lives OUTSIDE the repo (this repo is public).
#   PS_KEYSTORE   path to the keystore   (default: ~/.pocketstats/pocketstats-release.jks, created if missing)
#   PS_KS_PASS    keystore password      (required)
# Keep the same keystore for future versions, or Android refuses to install the update over the old one.
set -euo pipefail
cd "$(dirname "$0")/.."
: "${PS_KS_PASS:?Set PS_KS_PASS to the keystore password}"
KS="${PS_KEYSTORE:-$HOME/.pocketstats/pocketstats-release.jks}"
SDK_JAR=/usr/lib/android-sdk/platforms/android-23/android.jar
OUT=android/build
rm -rf "$OUT" && mkdir -p "$OUT/gen" "$OUT/obj" "$OUT/dex"

python3 tools/build.py

if [ ! -f "$KS" ]; then
  mkdir -p "$(dirname "$KS")"
  keytool -genkeypair -keystore "$KS" -storepass "$PS_KS_PASS" -keypass "$PS_KS_PASS" \
    -alias pocketstats -keyalg RSA -keysize 3072 -validity 10950 -dname "CN=Pocket Stats" >/dev/null
  echo "Created signing key at $KS (back it up; you need it for updates)"
fi

aapt package -f -M android/app/AndroidManifest.xml -S android/app/res -A android/app/assets \
  -I "$SDK_JAR" -J "$OUT/gen" -F "$OUT/unsigned.apk" -0 arsc -0 html
javac -nowarn -source 8 -target 8 -bootclasspath "$SDK_JAR" -encoding UTF-8 -Xlint:-options \
  -d "$OUT/obj" $(find "$OUT/gen" -name "*.java") android/app/src/app/pocketstats/*.java
dalvik-exchange --dex --min-sdk-version=24 --output="$OUT/dex/classes.dex" "$OUT/obj"
(cd "$OUT/dex" && aapt add -f ../unsigned.apk classes.dex >/dev/null)
zipalign -f -p 4 "$OUT/unsigned.apk" "$OUT/aligned.apk"
apksigner sign --ks "$KS" --ks-pass env:PS_KS_PASS --ks-key-alias pocketstats --out dist/PocketStats.apk "$OUT/aligned.apk"
apksigner verify --print-certs dist/PocketStats.apk | head -3
ls -l dist/PocketStats.apk
