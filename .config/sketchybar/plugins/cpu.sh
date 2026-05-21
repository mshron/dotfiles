#!/usr/bin/env bash
CORES=$(sysctl -n machdep.cpu.thread_count)
CPU=$(ps -A -o %cpu | awk -v c="$CORES" 'NR>1 {s+=$1} END {printf "%.0f", s/c}')
sketchybar --set "$NAME" label="${CPU}%"
