
# macOS only — Linux boxes (e.g. the sandbox VM) have no Homebrew
[ -x /opt/homebrew/bin/brew ] && eval "$(/opt/homebrew/bin/brew shellenv)"

# PATH additions live here (not .zshrc) so non-interactive shells
# — Claude Code sessions, launchd jobs — get them too.
export PATH="$HOME/.local/bin:$PATH"
export PATH="$HOME/code/llama.cpp/build/bin:$PATH"
