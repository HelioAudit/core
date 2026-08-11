#!/usr/bin/env bash
# Install Gitleaks + Semgrep to ~/.local/bin (no sudo required for tools themselves)
set -euo pipefail

LOCAL_BIN="${HOME}/.local/bin"
GITLEAKS_VERSION="8.30.1"
ARCH="$(uname -m)"

mkdir -p "$LOCAL_BIN"
export PATH="${LOCAL_BIN}:${PATH}"

#
# Ensure pip is available (pip3 / pip / python3 -m pip), installing if needed.
#
ensure_pip() {
  if command -v pip3 >/dev/null 2>&1; then
    PIP=(pip3)
  elif command -v pip >/dev/null 2>&1; then
    PIP=(pip)
  elif command -v python3 >/dev/null 2>&1 && python3 -m pip --version >/dev/null 2>&1; then
    PIP=(python3 -m pip)
  else
    echo "→ pip not found — installing..."

    if command -v apt-get >/dev/null 2>&1; then
      if command -v sudo >/dev/null 2>&1 && [ "$(id -u)" -ne 0 ]; then
        sudo apt-get update
        sudo apt-get install -y python3 python3-pip
      else
        apt-get update
        apt-get install -y python3 python3-pip
      fi
    elif command -v brew >/dev/null 2>&1; then
      brew install python
    elif command -v python3 >/dev/null 2>&1; then
      curl -fsSL https://bootstrap.pypa.io/get-pip.py -o /tmp/get-pip.py
      python3 /tmp/get-pip.py --user
      rm -f /tmp/get-pip.py
      export PATH="${LOCAL_BIN}:${PATH}"
    else
      echo "Unable to install pip: no apt-get, brew, or python3 available."
      exit 1
    fi

    if command -v pip3 >/dev/null 2>&1; then
      PIP=(pip3)
    elif command -v pip >/dev/null 2>&1; then
      PIP=(pip)
    elif python3 -m pip --version >/dev/null 2>&1; then
      PIP=(python3 -m pip)
    else
      echo "pip installation finished but pip is still not on PATH."
      exit 1
    fi
  fi

  echo "  using: ${PIP[*]} ($("${PIP[@]}" --version 2>/dev/null | head -1))"
}

#
# Install Semgrep via pip (--user). Handles PEP 668 externally-managed envs.
#
install_semgrep() {
  ensure_pip

  echo "→ Installing Semgrep via pip (user install)..."
  set +e
  OUT="$("${PIP[@]}" install --user semgrep 2>&1)"
  STATUS=$?
  set -e

  if [ "$STATUS" -ne 0 ]; then
    if echo "$OUT" | grep -qi "externally-managed-environment"; then
      echo "  detected externally-managed Python — retrying with --break-system-packages"
      "${PIP[@]}" install --user --break-system-packages semgrep
    else
      echo "$OUT"
      exit "$STATUS"
    fi
  fi

  # Ensure ~/.local/bin is preferred for the verification call
  hash -r 2>/dev/null || true
  echo "  ✓ semgrep $(semgrep --version 2>/dev/null | head -1)"
}

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

install_semgrep

if ! echo "$PATH" | grep -q "$LOCAL_BIN"; then
  echo ""
  echo "Add to your shell profile (~/.zshrc):"
  echo '  export PATH="$HOME/.local/bin:$PATH"'
  echo ""
  echo "Then run: source ~/.zshrc"
fi

echo ""
echo "Done. Scanner CLIs are ready."
echo "  Restart the API: cd api && npm run dev"
echo "  Or with Docker:  cd api && docker compose up --build"
