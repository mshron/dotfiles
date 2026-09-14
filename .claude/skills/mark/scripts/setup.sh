#!/bin/bash
# Idempotent setup for the `mark` markdown preview + review workflow.
# Copies Vivify config/sidecar files to ~/.config/vivify (never overwrites
# existing files), installs the `mark` command to ~/.local/bin, and writes
# mark.conf if it is missing. It asks whether this host is local or remote,
# and for a remote host, whether a browser reaches it over ssh port
# forwarding or over Tailscale (see SKILL.md "Running on a remote host").
# Set MARK_LOCATION=local|remote and MARK_REMOTE_ACCESS=ssh|tailscale in the
# environment to answer without a prompt; a non-interactive run with no
# answer defaults to local (and ssh).
#
# On Linux this script downloads one pinned Vivify release and checks its
# SHA-256 before installing. To upgrade Vivify, change the two constants
# below in a reviewed commit.
set -euo pipefail

VIVIFY_VERSION=0.14.0
VIVIFY_LINUX_SHA256=f88696eec6eb9f10a0ca7ac4a1803d5617e31b8b65b831f992108f983ed8b1b2

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
    # Also accept an earlier install in ~/.local/bin: a non-login shell (e.g.
    # over ssh) may not have it on PATH, and re-downloading over a running
    # binary fails with "Text file busy".
    if ! command -v vivify-server >/dev/null && [ ! -x "$HOME/.local/bin/vivify-server" ]; then
      command -v curl >/dev/null || { echo "Missing dependency: curl" >&2; exit 1; }
      command -v tar >/dev/null || { echo "Missing dependency: tar" >&2; exit 1; }
      tmp="$(mktemp -d)"
      trap 'rm -rf "$tmp"' EXIT
      command -v sha256sum >/dev/null || { echo "Missing dependency: sha256sum (coreutils)" >&2; exit 1; }
      dl_url="https://github.com/jannis-baum/Vivify/releases/download/v${VIVIFY_VERSION}/vivify-linux.tar.gz"
      if ! curl -sfL -o "$tmp/vivify-linux.tar.gz" "$dl_url"; then
        echo "Could not download $dl_url — see https://github.com/jannis-baum/Vivify/releases" >&2
        exit 1
      fi
      got="$(sha256sum "$tmp/vivify-linux.tar.gz" | cut -d' ' -f1)"
      if [ "$got" != "$VIVIFY_LINUX_SHA256" ]; then
        echo "vivify-linux.tar.gz from $dl_url does not match the pinned SHA-256." >&2
        echo "  expected: $VIVIFY_LINUX_SHA256" >&2
        echo "  got:      $got" >&2
        echo "Not installing. If Vivify published a new build of v${VIVIFY_VERSION}, update the constant in a reviewed change." >&2
        exit 1
      fi
      tar -xzf "$tmp/vivify-linux.tar.gz" -C "$tmp"
      mkdir -p "$HOME/.local/bin"
      cp "$tmp/vivify-linux/viv" "$tmp/vivify-linux/vivify-server" "$HOME/.local/bin/"
      chmod +x "$HOME/.local/bin/viv" "$HOME/.local/bin/vivify-server"
      echo "installed $HOME/.local/bin/vivify-server (and viv) v${VIVIFY_VERSION}, SHA-256 verified"
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
  location="${MARK_LOCATION:-}"
  if [ -z "$location" ]; then
    if [ -t 0 ]; then
      echo "Where does mark run on this host?"
      echo "  local  - this machine has a display; open a browser here (default)"
      echo "  remote - headless host; print a URL for a browser on another device"
      printf 'MARK_LOCATION [local/remote]: '
      read -r location || true
      location="${location:-local}"
    else
      location=local
      echo "note: no terminal to ask local/remote — defaulting MARK_LOCATION=local (edit $conf to change)" >&2
    fi
  fi
  case "$location" in
    local|remote) ;;
    *)
      echo "MARK_LOCATION must be local or remote, got '$location'" >&2
      exit 1
      ;;
  esac

  access=ssh
  if [ "$location" = remote ]; then
    access="${MARK_REMOTE_ACCESS:-}"
    if [ -z "$access" ]; then
      if [ -t 0 ]; then
        echo "How will your browser reach this host?"
        echo "  ssh       - forward ports 31622 and 31623 over ssh; works from any computer (default)"
        echo "  tailscale - listen on this host's Tailscale address; the only option that works from a phone"
        printf 'MARK_REMOTE_ACCESS [ssh/tailscale]: '
        read -r access || true
      fi
      access="${access:-ssh}"
    fi
    case "$access" in
      ssh|tailscale) ;;
      *)
        echo "MARK_REMOTE_ACCESS must be ssh or tailscale, got '$access'" >&2
        exit 1
        ;;
    esac
  fi

  cat > "$conf" <<EOF
# mark's location — read by the \`mark\` command on every run. Environment
# variables with the same names override these values.
#
# MARK_LOCATION
#   local (default): opens a browser on this machine; preview on localhost.
#   remote: headless host. mark never opens a browser; it prints a URL.
#
# MARK_REMOTE_ACCESS (remote only)
#   ssh (default): the comments sidecar listens on 127.0.0.1. Forward ports
#     31622 and 31623 over ssh and open the printed localhost URL.
#   tailscale: the sidecar listens on this host's Tailscale address and the
#     URL uses it. Needs Tailscale installed and this host on your tailnet
#     (https://tailscale.com/download). The only option that works from a
#     phone.
MARK_LOCATION=$location
MARK_REMOTE_ACCESS=$access
EOF
  echo "installed $conf (MARK_LOCATION=$location, MARK_REMOTE_ACCESS=$access)"
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
