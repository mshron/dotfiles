#!/usr/bin/env bash
PAGE_SIZE=$(vm_stat | head -1 | grep -oE '[0-9]+')
ACTIVE=$(vm_stat | awk '/Pages active/ {gsub(/\./,"",$NF); print $NF}')
WIRED=$(vm_stat | awk '/Pages wired down/ {gsub(/\./,"",$NF); print $NF}')
COMPRESSED=$(vm_stat | awk '/Pages occupied by compressor/ {gsub(/\./,"",$NF); print $NF}')
TOTAL=$(sysctl -n hw.memsize)
USED_BYTES=$(( (ACTIVE + WIRED + COMPRESSED) * PAGE_SIZE ))
PCT=$(( USED_BYTES * 100 / TOTAL ))
sketchybar --set "$NAME" label="${PCT}%"
