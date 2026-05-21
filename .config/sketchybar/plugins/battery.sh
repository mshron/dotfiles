#!/usr/bin/env bash
PERCENTAGE=$(pmset -g batt | grep -Eo '[0-9]+%' | head -1 | tr -d '%')
CHARGING=$(pmset -g batt | grep 'AC Power')

if [ -z "$PERCENTAGE" ]; then
  exit 0
fi

if [ -n "$CHARGING" ]; then
  ICON=""
  COLOR=0xff89b4fa
else
  case "$PERCENTAGE" in
    100|9[0-9]|8[0-9]|7[0-9]) ICON=""; COLOR=0xffa6e3a1 ;;
    6[0-9]|5[0-9])            ICON="";   COLOR=0xffa6e3a1 ;;
    4[0-9]|3[0-9])            ICON=""; COLOR=0xfff9e2af ;;
    2[0-9])                   ICON="";  COLOR=0xfffab387 ;;
    *)                        ICON="";COLOR=0xfff38ba8 ;;
  esac
fi

sketchybar --set "$NAME" icon="$ICON" \
                         icon.color="$COLOR" \
                         label="${PERCENTAGE}%"
