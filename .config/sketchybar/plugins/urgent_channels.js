// Reads Slack's sidebar via macOS Accessibility and emits channel display names
// under a named section as JSON. Usage:
//   osascript -l JavaScript urgent_channels.js "Urgent"

ObjC.import('stdlib');

const args = $.NSProcessInfo.processInfo.arguments.js;
const sectionName = args[4] ? args[4].js : 'Urgent';

function find(e, pred, out = []) {
  let kids;
  try { kids = e.uiElements(); } catch(_) { return out; }
  for (const k of kids) {
    if (pred(k)) out.push(k);
    find(k, pred, out);
  }
  return out;
}

let result;
try {
  const se = Application('System Events');
  const proc = se.processes['Slack'];
  const winCount = proc.windows.length;
  if (winCount === 0) {
    result = JSON.stringify({error: 'no-windows'});
  } else {
    let outline = null;
    const windowTitles = [];
    for (let i = 0; i < winCount; i++) {
      const w = proc.windows[i];
      try { windowTitles.push(w.title() || ''); } catch(_) { windowTitles.push(''); }
      const candidates = find(w, k => {
        try { return k.description() === 'Channels and direct messages'; } catch(_) { return false; }
      });
      if (candidates.length > 0) { outline = candidates[0]; break; }
    }

    if (!outline) {
      // Fallback: any AXOutline
      for (let i = 0; i < winCount; i++) {
        const w = proc.windows[i];
        const outlines = find(w, k => {
          try { return k.role() === 'AXOutline'; } catch(_) { return false; }
        });
        if (outlines.length > 0) { outline = outlines[0]; break; }
      }
    }

    if (!outline) {
      result = JSON.stringify({error: 'sidebar-not-found', windowTitles});
    } else {
      const row = outline.uiElements().find(r => {
        try { return r.description() === sectionName; } catch(_) { return false; }
      });

      if (!row) {
        const headers = outline.uiElements().map(r => {
          try { return r.description() || ''; } catch(_) { return ''; }
        });
        result = JSON.stringify({error: 'section-not-found', section: sectionName, available: headers});
      } else {
        const names = find(row, k => {
          try { return k.role() === 'AXStaticText'; } catch(_) { return false; }
        }).map(k => {
          try { return k.value(); } catch(_) { return null; }
        }).filter(v => v && !['Active', 'Away'].includes(v));
        result = JSON.stringify(names);
      }
    }
  }
} catch (e) {
  result = JSON.stringify({error: 'exception', message: String(e)});
}
result;
