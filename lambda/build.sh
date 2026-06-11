#!/usr/bin/env bash
# lambda/build.sh — Build the Lambda deployment zip
#
# Why manylinux wheels?  Lambda runs on Amazon Linux 2 (x86_64). Native
# extensions compiled on macOS/Windows won't work there. The --platform flag
# fetches pre-built manylinux wheels that are compatible with Lambda's glibc.
#
# Usage:
#   cd lambda && bash build.sh
# Output:
#   lambda/deployment.zip  (~15-50 MB depending on deps)

set -euo pipefail

PACKAGE_DIR="package"
ZIP_FILE="deployment.zip"
PYTHON_VERSION="3.12"

echo "==> Cleaning previous build…"
rm -rf "$PACKAGE_DIR" "$ZIP_FILE"
mkdir -p "$PACKAGE_DIR"

echo "==> Installing dependencies for Linux x86_64…"
# --platform manylinux2014_x86_64: fetch Linux-compatible binary wheels
# --only-binary=:all:             : never compile from source (safe for CI/CD)
# --implementation cp             : CPython (not PyPy)
# --python-version                : match the Lambda runtime
pip install \
  --platform manylinux2014_x86_64 \
  --target "$PACKAGE_DIR" \
  --implementation cp \
  --python-version "$PYTHON_VERSION" \
  --only-binary=:all: \
  -r requirements.txt

echo "==> Copying processor.py into package…"
cp processor.py "$PACKAGE_DIR"/

echo "==> Zipping…"
cd "$PACKAGE_DIR"
zip -r9 "../$ZIP_FILE" . -x "*.pyc" -x "*/__pycache__/*"
cd ..

SIZE=$(du -sh "$ZIP_FILE" | cut -f1)
echo "==> Done! $ZIP_FILE created ($SIZE)"
echo ""
echo "Next steps:"
echo "  1. aws lambda create-function  (see README for full command)"
echo "  2. aws lambda update-function-code --function-name sourcely-processor --zip-file fileb://deployment.zip"
