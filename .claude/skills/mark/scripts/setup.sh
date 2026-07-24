#!/bin/bash
# Idempotent setup for the `mark` markdown preview + review workflow.
# Copies Vivify config/sidecar files to ~/.config/vivify (never overwrites
# existing files) and installs the `mark` command to ~/.local/bin.
set -euo pipefail

SKILL_DIR="$(cd "$(dirname "$0")/.." && pwd)"

if [ "$(uname)" != "Darwin" ]; then
  echo "mark is macOS-only as written (uses \`open\` and Homebrew)." >&2
  exit 1
fi

missing=""
command -v vivify-server >/dev/null || missing="vivify (brew install vivify)"
command -v node >/dev/null || missing="${missing:+$missing, }node (brew install node)"
if [ -n "$missing" ]; then
  echo "Missing dependencies: $missing" >&2
  echo "Install them, then re-run this script." >&2
  exit 1
fi

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

mkdir -p "$HOME/.local/bin"
cp "$SKILL_DIR/scripts/mark" "$HOME/.local/bin/mark"
chmod +x "$HOME/.local/bin/mark"
echo "installed $HOME/.local/bin/mark"

case ":$PATH:" in
  *":$HOME/.local/bin:"*) ;;
  *) echo "note: ~/.local/bin is not on your PATH — add it in ~/.zprofile" >&2 ;;
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
