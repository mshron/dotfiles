#!/bin/bash
set -e

DOTFILES_REPO="https://github.com/mshron/dotfiles.git"
DOTFILES_DIR="$HOME/.dotfiles"

if [ -d "$DOTFILES_DIR" ]; then
  echo "Updating existing dotfiles..."
  git --git-dir="$DOTFILES_DIR" --work-tree="$HOME" pull
else
  echo "Installing dotfiles..."
  git clone --bare "$DOTFILES_REPO" "$DOTFILES_DIR"
  git --git-dir="$DOTFILES_DIR" --work-tree="$HOME" checkout -f
  git --git-dir="$DOTFILES_DIR" --work-tree="$HOME" config status.showUntrackedFiles no
fi

echo "Done! Add this alias to your shell:"
echo "  alias dot='git --git-dir=\"\$HOME/.dotfiles\" --work-tree=\"\$HOME\"'"
