# dotfiles

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
