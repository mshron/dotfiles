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
ln -sf "$DOTFILES/.tmux.conf" "$HOME/.tmux.conf"
mkdir -p "$HOME/.config"
ln -sf "$DOTFILES/.config/nvim" "$HOME/.config/nvim"

# Ghostty (macOS location)
if [ "$(uname)" = "Darwin" ]; then
  GHOSTTY_DIR="$HOME/Library/Application Support/com.mitchellh.ghostty"
  mkdir -p "$GHOSTTY_DIR"
  ln -sf "$DOTFILES/.config/ghostty/config" "$GHOSTTY_DIR/config"
fi

echo "=== Done ==="
