#!/usr/bin/env bash
set -euo pipefail

DOTFILES="$(cd "$(dirname "$0")" && pwd)"

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

declare -A plugins=(
  [zsh-autosuggestions]="https://github.com/zsh-users/zsh-autosuggestions.git"
  [fast-syntax-highlighting]="https://github.com/zdharma-continuum/fast-syntax-highlighting.git"
  [zsh-autocomplete]="https://github.com/marlonrichert/zsh-autocomplete.git"
)

for name in "${!plugins[@]}"; do
  dest="$ZSH_CUSTOM/plugins/$name"
  if [ ! -d "$dest" ]; then
    echo "Installing plugin: $name"
    git clone --depth 1 "${plugins[$name]}" "$dest"
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
ln -sf "$DOTFILES/.config/nvim" "$HOME/.config/nvim"
ln -sf "$DOTFILES/.config/aerospace" "$HOME/.config/aerospace"
ln -sf "$DOTFILES/.config/sketchybar" "$HOME/.config/sketchybar"
# vivify config is owned by the mark skill (single tracked copy)
ln -sfn "$DOTFILES/.claude/skills/mark/assets" "$HOME/.config/vivify"

# cmux — symlink the single managed file (cmux writes other state into this dir)
mkdir -p "$HOME/.config/cmux"
ln -sf "$DOTFILES/.config/cmux/cmux.json" "$HOME/.config/cmux/cmux.json"

# Claude Code — symlink the managed pieces (Claude writes other state into ~/.claude)
mkdir -p "$HOME/.claude/hooks" "$HOME/.claude/skills"
ln -sf "$DOTFILES/.claude/CLAUDE.md" "$HOME/.claude/CLAUDE.md"
ln -sf "$DOTFILES/.claude/hooks/context-bar.sh" "$HOME/.claude/hooks/context-bar.sh"
ln -sfn "$DOTFILES/.claude/skills/mark" "$HOME/.claude/skills/mark"

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
