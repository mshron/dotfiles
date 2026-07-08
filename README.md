# dotfiles

A terminal-first dev environment built around cmux + neovim + zsh, optimized for working alongside Claude Code.

## What's included

- **cmux** — primary terminal/multiplexer. Keybindings (`.config/cmux/cmux.json`) mirror the tmux muscle memory below: `C-Space` prefix, `\`/`-` to split, `h/j/k/l` to move between panes, `z` to zoom, `[` for copy mode, `1`–`9` to select surfaces (tabs), `s` to switch workspaces (sessions)
- **Zsh** — Oh My Zsh with autosuggestions, syntax highlighting, and AI-powered autocomplete (Anthropic API via Keychain)
- **Tmux** — legacy multiplexer, kept as a fallback: `C-Space` prefix, vim-style navigation, pane zoom cycling (`Tab`), per-window silence monitoring (`b`), vi copy-mode
- **Neovim** — Telescope fuzzy finder, Gitsigns, Oil file browser, Treesitter, image preview in markdown, auto-reload of externally changed files
- **Ghostty** — Selenized Dark theme, copy-on-select, focus-follows-mouse, 100k scrollback
- **Seamless navigation** — `C-h/j/k/l` moves between panes and neovim splits via vim-tmux-navigator
- **Shell functions** — `work <name>` to create/attach tmux sessions with a window title, `title <name>` to set the Ghostty window title

## Workflow

The `C-Space` prefix bindings below work the same in cmux and tmux.

1. Open a workspace (cmux) or run `work <name>` to create/attach a named tmux session
2. Use `C-Space |` and `C-Space -` to split panes as needed
3. Navigate across panes and neovim splits with `C-h/j/k/l`
4. `C-Space z` to zoom a pane — useful for keeping a Claude Code pane full-screen and flipping to your editor
5. In neovim, `<leader>ff` to find files, `<leader>fg` to grep, `-` to browse files with Oil

tmux-only extras: `C-Space Tab` cycles panes with auto-zoom, and `C-Space b` notifies you when a pane goes silent (e.g., a long build finishes).

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
