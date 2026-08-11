#!/usr/bin/env bash
# Install Gitleaks + Semgrep to ~/.local/bin (no sudo required)
set -euo pipefail

LOCAL_BIN="${HOME}/.local/bin"
GITLEAKS_VERSION="8.30.1"
ARCH="$(uname -m)"

mkdir -p "$LOCAL_BIN"

case "$ARCH" in
  x86_64)  GITLEAKS_ARCH="linux_x64" ;;
  aarch64|arm64) GITLEAKS_ARCH="linux_arm64" ;;
  *)
    echo "Unsupported architecture: $ARCH"
    exit 1
    ;;
esac

GITLEAKS_URL="https://github.com/gitleaks/gitleaks/releases/download/v${GITLEAKS_VERSION}/gitleaks_${GITLEAKS_VERSION}_${GITLEAKS_ARCH}.tar.gz"

echo "→ Installing Gitleaks v${GITLEAKS_VERSION} to ${LOCAL_BIN}..."
TMPDIR="$(mktemp -d)"
curl -fsSL -o "${TMPDIR}/gitleaks.tar.gz" "$GITLEAKS_URL"
tar xzf "${TMPDIR}/gitleaks.tar.gz" -C "$TMPDIR"
mv "${TMPDIR}/gitleaks" "${LOCAL_BIN}/gitleaks"
chmod +x "${LOCAL_BIN}/gitleaks"
rm -rf "$TMPDIR"
echo "  ✓ gitleaks $(gitleaks version)"

echo "→ Installing Semgrep via pip (user install)..."
pip install --user semgrep
echo "  ✓ semgrep $(semgrep --version | head -1)"

if ! echo "$PATH" | grep -q "$LOCAL_BIN"; then
  echo ""
  echo "Add to your shell profile (~/.zshrc):"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
  echo ""
  echo "Then run: source ~/.zshrc"
fi

echo ""
echo "Done. Restart the scanner server:"
echo "  cd core && npm run dev"
