#!/bin/bash
# Status line: context usage progress bar + git branch/worktree
# Stdin JSON fields used:
#   .context_window.context_window_size  — total cap (200000 or 1000000)
#   .context_window.used_percentage      — 0–100
#   .workspace.current_dir               — agent's cwd, for git info

input=$(cat)
used_pct=$(echo "$input" | jq -r '.context_window.used_percentage // 0')
window_size=$(echo "$input" | jq -r '.context_window.context_window_size // 200000')

# Absolute tokens (in k), derived from the real window size
tokens_k=$(echo "$input" | jq -r '((.context_window.context_window_size // 200000) * (.context_window.used_percentage // 0) / 100000) | floor')
tokens_k=${tokens_k:-0}

# Bar fill is proportional to percent used — scales with window size automatically.
pct_int=$(echo "$used_pct / 1" | bc 2>/dev/null)
pct_int=${pct_int:-0}
if [ "$pct_int" -ge 100 ] 2>/dev/null; then
  filled=10
elif [ "$pct_int" -le 0 ] 2>/dev/null; then
  filled=0
else
  filled=$((pct_int / 10))
fi

empty=$((10 - filled))

bar=''
for ((i=0; i<filled; i++)); do bar+='█'; done
for ((i=0; i<empty; i++)); do bar+='░'; done

# Color thresholds depend on window size. On the 1M models the usable
# budget is much smaller than the literal cap (quality degrades well
# before 100%), so warn earlier: yellow at 20%, red at 40%. On 200k
# models, keep the familiar 50/90 scheme.
if [ "$window_size" -ge 500000 ] 2>/dev/null; then
  yellow_at=20
  red_at=40
else
  yellow_at=50
  red_at=90
fi

if [ "$pct_int" -ge "$red_at" ] 2>/dev/null; then
  color='\033[0;31m'
elif [ "$pct_int" -ge "$yellow_at" ] 2>/dev/null; then
  color='\033[0;33m'
else
  color='\033[0;32m'
fi

# Git branch, plus worktree name when in a linked worktree
dir=$(echo "$input" | jq -r '.workspace.current_dir // .cwd // empty')
git_info=''
if [ -n "$dir" ] && git -C "$dir" rev-parse --is-inside-work-tree >/dev/null 2>&1; then
  branch=$(git -C "$dir" branch --show-current 2>/dev/null)
  [ -z "$branch" ] && branch=$(git -C "$dir" rev-parse --short HEAD 2>/dev/null)
  git_dir=$(git -C "$dir" rev-parse --absolute-git-dir 2>/dev/null)
  common_dir=$(git -C "$dir" rev-parse --path-format=absolute --git-common-dir 2>/dev/null)
  if [ -n "$git_dir" ] && [ "$git_dir" != "$common_dir" ]; then
    wt_name=$(basename "$(git -C "$dir" rev-parse --show-toplevel 2>/dev/null)")
    git_info=" \033[0;36m⎇ ${branch} [wt:${wt_name}]\033[0m"
  else
    git_info=" \033[0;36m⎇ ${branch}\033[0m"
  fi
fi

printf "${color}${bar} ${tokens_k}k\033[0m${git_info}"
