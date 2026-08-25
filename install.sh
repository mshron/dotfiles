#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

# Symlinks point back into this checkout — running via curl-pipe leaves
# $DOTFILES pointing somewhere with no configs in it. Fail fast instead.
if [ ! -f "$DOTFILES/.zshrc" ]; then
  echo "error: $DOTFILES does not look like a dotfiles checkout." >&2
  echo "Clone the repo and run install.sh from inside it:" >&2
  echo "  git clone https://github.com/mshron/dotfiles.git ~/code/dotfiles" >&2
  echo "  ~/code/dotfiles/install.sh" >&2
  exit 1
fi

echo "=== Installing dotfiles from $DOTFILES ==="

# --- Oh My Zsh ---
if [ ! -d "$HOME/.oh-my-zsh" ]; then
  echo "Installing Oh My Zsh..."
  RUNZSH=no sh -c "$(curl -fsSL https://raw.githubusercontent.com/ohmyzsh/ohmyzsh/master/tools/install.sh)"
else
  echo "Oh My Zsh already installed"
fi

# --- Custom plugins ---
ZSH_CUSTOM="${ZSH_CUSTOM:-$HOME/.oh-my-zsh/custom}"

# "name url" pairs — associative arrays need bash 4+, macOS ships 3.2
for spec in \
  "zsh-autosuggestions https://github.com/zsh-users/zsh-autosuggestions.git" \
  "fast-syntax-highlighting https://github.com/zdharma-continuum/fast-syntax-highlighting.git" \
  "zsh-autocomplete https://github.com/marlonrichert/zsh-autocomplete.git"
do
  name="${spec%% *}"
  url="${spec#* }"
  dest="$ZSH_CUSTOM/plugins/$name"
  if [ ! -d "$dest" ]; then
    echo "Installing plugin: $name"
    git clone --depth 1 "$url" "$dest"
  else
    echo "Plugin already installed: $name"
  fi
done

# --- Symlinks ---
echo "Creating symlinks..."

ln -sf "$DOTFILES/.zshrc" "$HOME/.zshrc"
ln -sf "$DOTFILES/.zprofile" "$HOME/.zprofile"
ln -sf "$DOTFILES/.tmux.conf" "$HOME/.tmux.conf"
mkdir -p "$HOME/.config"
# -n: don't follow an existing symlink, or re-runs would drop a
# self-referential link inside the target directory
ln -sfn "$DOTFILES/.config/nvim" "$HOME/.config/nvim"
ln -sfn "$DOTFILES/.config/aerospace" "$HOME/.config/aerospace"
ln -sfn "$DOTFILES/.config/sketchybar" "$HOME/.config/sketchybar"
# vivify config is owned by the mark skill (single tracked copy)
ln -sfn "$DOTFILES/.claude/skills/mark/assets" "$HOME/.config/vivify"

# cmux — symlink the single managed file (cmux writes other state into this dir)
mkdir -p "$HOME/.config/cmux"
ln -sf "$DOTFILES/.config/cmux/cmux.json" "$HOME/.config/cmux/cmux.json"

# herdr — same story: it writes sockets, logs and session state into this dir
mkdir -p "$HOME/.config/herdr"
ln -sf "$DOTFILES/.config/herdr/config.toml" "$HOME/.config/herdr/config.toml"

# Claude Code — symlink the managed pieces (Claude writes other state into ~/.claude)
mkdir -p "$HOME/.claude/hooks" "$HOME/.claude/skills"
ln -sf "$DOTFILES/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$DOTFILES/.claude/hooks/context-bar.sh" "$HOME/.claude/hooks/context-bar.sh"
ln -sfn "$DOTFILES/.claude/skills/mark" "$HOME/.claude/skills/mark"

# settings.json also holds machine-specific state (installed plugins,
# permission grants) so merge in just the statusLine key instead of
# symlinking the whole file.
if ! command -v jq >/dev/null 2>&1; then
  echo "error: jq is required to configure the Claude Code status line." >&2
  echo "  brew install jq" >&2
  exit 1
fi
CLAUDE_SETTINGS="$HOME/.claude/settings.json"
[ -f "$CLAUDE_SETTINGS" ] || echo '{}' > "$CLAUDE_SETTINGS"
jq '.statusLine = {"type": "command", "command": "~/.claude/hooks/context-bar.sh"}' \
  "$CLAUDE_SETTINGS" > "$CLAUDE_SETTINGS.tmp" && mv "$CLAUDE_SETTINGS.tmp" "$CLAUDE_SETTINGS"

# Codex — update the adapted instructions while preserving Codex's skill metadata
mkdir -p "$HOME/.agents/skills/mark"
cp "$DOTFILES/.claude/skills/mark/SKILL.md" "$HOME/.agents/skills/mark/SKILL.md"

"$DOTFILES/.claude/skills/mark/scripts/setup.sh" || true

# Ghostty (macOS location)
if [ "$(uname)" = "Darwin" ]; then
  GHOSTTY_DIR="$HOME/Library/Application Support/com.mitchellh.ghostty"
  mkdir -p "$GHOSTTY_DIR"
  ln -sf "$DOTFILES/.config/ghostty/config" "$GHOSTTY_DIR/config"
fi

echo "=== Done ==="
