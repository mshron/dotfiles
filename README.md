# dotfiles

A terminal-first dev environment built around tmux + neovim + zsh, optimized for working alongside Claude Code.

## What's included

- **Zsh** — Oh My Zsh with autosuggestions, syntax highlighting, and AI-powered autocomplete (Anthropic API via Keychain)
- **Tmux** — `C-Space` prefix, vim-style navigation, pane zoom cycling (`Tab`), per-window silence monitoring (`b`), vi copy-mode
- **Neovim** — Telescope fuzzy finder, Gitsigns, Oil file browser, Treesitter, image preview in markdown, auto-reload of externally changed files
- **Ghostty** — Selenized Dark theme, copy-on-select, focus-follows-mouse, 100k scrollback
- **Seamless navigation** — `C-h/j/k/l` moves between tmux panes and neovim splits via vim-tmux-navigator
- **Shell functions** — `work <name>` to create/attach tmux sessions with a window title, `title <name>` to set the Ghostty window title

## Workflow

1. Run `work <name>` to create or attach to a named tmux session
2. Use `C-Space |` and `C-Space -` to split panes as needed
3. Navigate across tmux panes and neovim splits with `C-h/j/k/l`
4. Use `C-Space Tab` to cycle between panes with auto-zoom — useful for keeping a Claude Code pane full-screen and flipping to your editor
5. Toggle `C-Space b` on a pane to get notified when it goes silent (e.g., a long build finishes)
6. In neovim, `<leader>ff` to find files, `<leader>fg` to grep, `-` to browse files with Oil

## Install

```bash
curl -sL https://raw.githubusercontent.com/mshron/dotfiles/main/install.sh | bash
```

## Manage

Add the alias to your shell:

```bash
alias dot='git --git-dir="$HOME/.dotfiles" --work-tree="$HOME"'
```

Then use it like git:

```bash
dot add ~/.vimrc
dot commit -m "update vimrc"
dot push
```
