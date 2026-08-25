#!/bin/bash
# Idempotent setup for the `mark` markdown preview + review workflow.
# Copies Vivify config/sidecar files to ~/.config/vivify (never overwrites
# existing files), installs the `mark` command to ~/.local/bin, and writes
# a default mark.conf (MARK_LOCATION=local — see mark.conf's own comments
# and the "remote host" section of SKILL.md for the remote/Tailscale case).
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"
OS="$(uname)"

case "$OS" in
  Darwin)
    missing=""
    command -v vivify-server >/dev/null || missing="vivify (brew install vivify)"
    command -v node >/dev/null || missing="${missing:+$missing, }node (brew install node)"
    if [ -n "$missing" ]; then
      echo "Missing dependencies: $missing" >&2
      echo "Install them, then re-run this script." >&2
      exit 1
    fi
    ;;
  Linux)
    if ! command -v node >/dev/null; then
      echo "Missing dependency: node (e.g. sudo apt-get install -y nodejs)" >&2
      echo "Install it, then re-run this script." >&2
      exit 1
    fi
    if ! command -v vivify-server >/dev/null; then
      command -v curl >/dev/null || { echo "Missing dependency: curl" >&2; exit 1; }
      command -v tar >/dev/null || { echo "Missing dependency: tar" >&2; exit 1; }
      tmp="$(mktemp -d)"
      trap 'rm -rf "$tmp"' EXIT
      dl_url="$(curl -sf https://api.github.com/repos/jannis-baum/vivify/releases/latest \
        | grep -o '"browser_download_url": *"[^"]*vivify-linux\.tar\.gz"' | cut -d'"' -f4)"
      if [ -z "$dl_url" ]; then
        echo "Could not find a Linux release of vivify — see https://github.com/jannis-baum/Vivify/releases" >&2
        exit 1
      fi
      curl -sfL -o "$tmp/vivify-linux.tar.gz" "$dl_url"
      tar -xzf "$tmp/vivify-linux.tar.gz" -C "$tmp"
      mkdir -p "$HOME/.local/bin"
      cp "$tmp/vivify-linux/viv" "$tmp/vivify-linux/vivify-server" "$HOME/.local/bin/"
      chmod +x "$HOME/.local/bin/viv" "$HOME/.local/bin/vivify-server"
      echo "installed $HOME/.local/bin/vivify-server (and viv) from $dl_url"
    fi
    ;;
  *)
    echo "mark supports macOS and Linux; $OS is untested." >&2
    exit 1
    ;;
esac

mkdir -p "$HOME/.config/vivify"
for f in config.json theme.css comments.js comments-server.mjs; do
  dest="$HOME/.config/vivify/$f"
  if [ -e "$dest" ]; then
    if cmp -s "$SKILL_DIR/assets/$f" "$dest"; then
      echo "ok       $dest (up to date)"
    else
      echo "skipped  $dest (exists and differs — merge by hand if you want updates)"
    fi
  else
    cp "$SKILL_DIR/assets/$f" "$dest"
    echo "installed $dest"
  fi
done

conf="$HOME/.config/vivify/mark.conf"
if [ ! -e "$conf" ]; then
  cat > "$conf" <<'EOF'
# mark's location — read by the `mark` command on every run.
#
# local (default): opens a browser on this machine; preview served on
#   localhost. Use this on your own laptop/desktop.
#
# remote: this host is reached remotely over Tailscale. mark never tries
#   to open a browser (there's no local display), and builds the preview
#   URL from this host's Tailscale address (`tailscale ip -4`) instead of
#   localhost. Requires Tailscale installed and this host joined to your
#   tailnet — set that up yourself (https://tailscale.com/download), it's
#   not part of this script.
MARK_LOCATION=local
EOF
  echo "installed $conf (MARK_LOCATION=local)"
else
  echo "ok       $conf (exists, left as-is)"
fi

mkdir -p "$HOME/.local/bin"
cp "$SKILL_DIR/scripts/mark" "$HOME/.local/bin/mark"
chmod +x "$HOME/.local/bin/mark"
echo "installed $HOME/.local/bin/mark"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *)
    if [ "$OS" = Darwin ]; then
      echo "note: ~/.local/bin is not on your PATH — add it in ~/.zprofile" >&2
    else
      echo "note: ~/.local/bin is not on your PATH — add it in ~/.bashrc (or ~/.profile)" >&2
    fi
    ;;
esac

# zsh ships an MH-mail-system completion for `mark` (_mh), so tab after
# `mark` completes mail folders instead of files. Override it in ~/.zshrc.
zshrc="$HOME/.zshrc"
if [ ! -f "$zshrc" ]; then
  echo "note: no ~/.zshrc — for tab completion add: compdef '_files -g \"*.(md|markdown)\"' mark" >&2
elif grep -q "compdef .* mark" "$zshrc"; then
  echo "ok       mark completion already in $zshrc"
else
  cat >> "$zshrc" <<'EOF'

# zsh ships an MH-mail completion for `mark` (_mh); override it with files
(( $+functions[compdef] )) && compdef '_files -g "*.(md|markdown)"' mark
EOF
  echo "installed mark completion in $zshrc (open a new shell to pick it up)"
fi

resolved=$(command -v mark || true)
if [ -n "$resolved" ] && [ "$resolved" != "$HOME/.local/bin/mark" ]; then
  echo "note: \`mark\` currently resolves to $resolved — check for an alias or another install shadowing it" >&2
fi

echo "done. Try: mark README.md"
