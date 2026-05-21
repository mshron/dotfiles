#!/usr/bin/env bash
JSON=$(curl -s -m 5 "wttr.in/?format=j1" 2>/dev/null)

if [ -z "$JSON" ]; then
  sketchybar --set "$NAME" label="--"
  exit 0
fi

LABEL=$(/usr/bin/python3 -c "
import json, sys

# Map WWO weather codes -> Nerd Font weather glyph (U+E3xx range)
def icon(code):
    c = int(code)
    if c == 113:                                    return chr(0xE30D)  # sunny
    if c in (116, 119, 122):                        return chr(0xE312)  # cloudy
    if c in (143, 248, 260):                        return chr(0xE313)  # fog
    if c == 200 or (386 <= c <= 395):               return chr(0xE31D)  # thunderstorm
    if ((176 <= c <= 185) or (263 <= c <= 314) or
        (353 <= c <= 359)):                         return chr(0xE318)  # rain
    if ((179 <= c <= 230) or (317 <= c <= 350) or
        (362 <= c <= 377)):                         return chr(0xE31A)  # snow
    return chr(0xE312)  # default: cloudy

try:
    d = json.loads(sys.argv[1])
    today_code = d['current_condition'][0]['weatherCode']
    today_temp = d['current_condition'][0]['temp_F']
    # Tomorrow's midday forecast (hourly[4] is the noon slot)
    tmrw      = d['weather'][1]
    tmrw_code = tmrw['hourly'][4]['weatherCode']
    tmrw_temp = tmrw['maxtempF']
    print(f'{icon(today_code)} {today_temp}° | {icon(tmrw_code)} {tmrw_temp}°')
except Exception:
    pass
" "$JSON" 2>/dev/null)

if [ -z "$LABEL" ]; then
  LABEL="--"
fi

sketchybar --set "$NAME" label="$LABEL"
