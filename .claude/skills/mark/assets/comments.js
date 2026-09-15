// Click-to-comment overlay injected into every Vivify viewer page (see
// config.json "scripts"). Only one listener on document: the #body-content
// subtree gets replaced wholesale on live-reload, so anything bound to a
// specific element would go stale.
(function () {
  if (!window.VIV_PATH) return;

  var STYLE_ID = 'viv-comments-style';
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement('style');
    style.id = STYLE_ID;
    style.textContent =
      '.viv-comment-form {' +
      '  margin: 4px 0; padding: 8px; border-radius: 4px;' +
      '  border: 1px solid var(--border-regular);' +
      '  background: var(--bg-secondary);' +
      '}' +
      '.viv-comment-form textarea {' +
      '  width: 100%; box-sizing: border-box; font: inherit;' +
      '  color: var(--text-primary); background: var(--bg-secondary);' +
      '  border: 1px solid var(--border-regular); border-radius: 4px;' +
      '  padding: 4px; resize: vertical;' +
      '}' +
      '.viv-comment-actions { margin-top: 4px; display: flex; gap: 8px; }' +
      '.viv-comment-form button {' +
      '  font: inherit; color: var(--text-link); background: none;' +
      '  border: 1px solid var(--border-regular); border-radius: 4px;' +
      '  padding: 2px 8px; cursor: pointer;' +
      '}' +
      '.viv-comment-error {' +
      '  display: none; margin-top: 4px; font-size: 0.9em;' +
      '  color: var(--text-secondary);' +
      '}' +
      '.viv-commented {' +
      '  border-left: 3px solid var(--text-link); padding-left: 8px;' +
      '}' +
      '.viv-commented > td, .viv-commented > th {' +
      '  border-left: 3px solid var(--text-link);' +
      '}' +
      '.viv-comment-note {' +
      '  margin: 2px 0 4px 1.5em; font-style: italic; font-size: 0.9em;' +
      '  color: var(--text-secondary); white-space: pre-wrap;' +
      '  cursor: pointer;' +
      '}' +
      '.viv-comment-note-timestamp {' +
      '  font-style: normal; font-size: 0.85em;' +
      '}' +
      '.viv-comment-notice {' +
      '  position: fixed; top: 0; left: 0; right: 0; z-index: 1000;' +
      '  padding: 6px 12px; font-size: 0.9em;' +
      '  color: var(--text-primary); background: var(--bg-secondary);' +
      '  border-bottom: 1px solid var(--border-regular);' +
      '}';
    document.head.appendChild(style);
  }

  function closeOpenForm() {
    var open = document.querySelector('.viv-comment-form');
    if (open) {
      // A brand-new comment form on a table row lives alone in a wrapper
      // <tr>, inserted by attachAfter; drop the whole row rather than leave
      // an empty one behind. An edit form shares its row with the note it
      // edits, which stays behind, so the row survives in that case.
      var row = open.closest('tr.viv-comment-row');
      open.remove();
      if (row && !row.querySelector('.viv-comment-note')) row.remove();
    }
    // A note hidden behind an edit form comes back when the form goes away.
    var hidden = document.querySelectorAll('.viv-comment-note[hidden]');
    for (var i = 0; i < hidden.length; i++) hidden[i].hidden = false;
  }

  // Vivify source-maps an entire markdown table to a single element, so a
  // click anywhere inside lands on the same block. GFM tables have exactly
  // one source line per header/body row (the delimiter row between them
  // takes one more), so row-level lines are recoverable by offsetting from
  // the table's own line — this tags each <tr> with its own data-source-line
  // so comments anchor to (and render beneath) the row that was clicked.
  function tagTableRows() {
    var tables = document.querySelectorAll('table.source-line[data-source-line]');
    for (var t = 0; t < tables.length; t++) {
      var table = tables[t];
      var tableLine = Number(table.dataset.sourceLine);
      table.classList.remove('source-line');
      table.removeAttribute('data-source-line');

      var headerRow = table.querySelector('thead tr');
      if (headerRow) {
        headerRow.classList.add('source-line');
        headerRow.dataset.sourceLine = tableLine;
      }

      var bodyRows = table.querySelectorAll('tbody tr');
      for (var i = 0; i < bodyRows.length; i++) {
        bodyRows[i].classList.add('source-line');
        bodyRows[i].dataset.sourceLine = tableLine + 2 + i;
      }
    }
  }

  // Column count for a table row, so a note/form spanning the row's full
  // width lines up — our own wrapper rows (built below) hold one <td>
  // already carrying that span, so it's read back off that instead.
  function rowColspan(rowEl) {
    if (rowEl.classList.contains('viv-comment-row')) return rowEl.cells[0].colSpan;
    return rowEl.cells ? rowEl.cells.length : 1;
  }

  // Inserts contentEl right after afterEl. A table row can't take a <div>
  // sibling, so when afterEl is a <tr> (the clicked row, or a previously
  // inserted comment row being chained onto), contentEl is wrapped in a
  // full-width <tr><td> first.
  function attachAfter(afterEl, contentEl) {
    if (afterEl.tagName === 'TR') {
      var tr = document.createElement('tr');
      tr.className = 'viv-comment-row';
      var td = document.createElement('td');
      td.colSpan = rowColspan(afterEl);
      td.appendChild(contentEl);
      tr.appendChild(td);
      afterEl.insertAdjacentElement('afterend', tr);
      return tr;
    }
    afterEl.insertAdjacentElement('afterend', contentEl);
    return contentEl;
  }

  // The comment sidecar always listens on the preview port plus one. Deriving
  // it here, instead of fixing it at 31623, lets a host run on its own port
  // pair — needed when you forward a remote preview over ssh while a local
  // mark still holds the default pair.
  function commentsBase() {
    var previewPort = Number(location.port) || 31622;
    return location.protocol + '//' + location.hostname + ':' + (previewPort + 1);
  }

  var VERSION = '1.7.0';
  var TOKEN_KEY = 'mark-token';
  var memToken = '';

  // The token arrives once in the URL fragment (#ct=...). Keep it in
  // sessionStorage so it survives the reload fallback below, then drop the
  // fragment so it is not in the address bar or in copied links.
  function storeToken(t) {
    memToken = t;
    try { sessionStorage.setItem(TOKEN_KEY, t); } catch (e) {}
  }
  function token() {
    if (memToken) return memToken;
    try { return sessionStorage.getItem(TOKEN_KEY) || ''; } catch (e) { return ''; }
  }
  (function takeTokenFromFragment() {
    var m = /(?:^#|&)ct=([A-Za-z0-9_-]+)/.exec(location.hash);
    if (!m) return;
    storeToken(m[1]);
    history.replaceState(null, '', location.pathname + location.search);
  })();

  var LOCKED_TEXT = 'Comments are locked. Run `mark` on this file again and open the new URL.';
  var UPDATED_TEXT = 'mark was updated. Stop `vivify-server` and run `mark` again.';

  function showNotice(text) {
    var el = document.getElementById('viv-comment-notice');
    if (!el) {
      el = document.createElement('div');
      el.id = 'viv-comment-notice';
      el.className = 'viv-comment-notice';
      document.body.appendChild(el);
    }
    el.textContent = text;
  }

  // Every sidecar call goes through here so the token rides along and a
  // 401/403 shows the locked notice exactly once per state.
  function authFetch(pathAndQuery, options) {
    options = options || {};
    var headers = Object.assign({}, options.headers || {}, { Authorization: 'Bearer ' + token() });
    return fetch(commentsBase() + pathAndQuery, Object.assign({}, options, { headers: headers }))
      .then(function (res) {
        if (res.status === 401 || res.status === 403) showNotice(LOCKED_TEXT);
        return res;
      });
  }

  // Vivify inlines this file at startup, so after an upgrade this code can
  // be older than the sidecar. Say so instead of failing quietly.
  function checkVersion() {
    fetch(commentsBase() + '/health')
      .then(function (res) { return res.ok ? res.json() : null; })
      .then(function (health) {
        if (health && health.version !== VERSION) showNotice(UPDATED_TEXT);
      })
      .catch(function () {});
  }

  function buildNote(comment) {
    var note = document.createElement('div');
    note.className = 'viv-comment-note';
    note.title = 'Click to edit';
    note._vivComment = comment;
    note.appendChild(document.createTextNode(comment.comment));
    if (comment.timestamp) {
      var timestamp = document.createElement('span');
      timestamp.className = 'viv-comment-note-timestamp';
      timestamp.appendChild(document.createTextNode(' (' + comment.timestamp + ')'));
      note.appendChild(timestamp);
    }
    return note;
  }

  function findBlock(comment) {
    var block = document.querySelector('.source-line[data-source-line="' + (comment.line - 1) + '"]');
    if (block) return block;

    var candidates = document.querySelectorAll('.source-line');
    for (var i = 0; i < candidates.length; i++) {
      // Same whitespace collapsing as when the quote was captured.
      if (candidates[i].textContent.trim().replace(/\s+/g, ' ').indexOf(comment.quote) === 0) return candidates[i];
    }
    return null;
  }

  // Fetches saved comments and renders them under their source blocks. Safe
  // to call repeatedly (e.g. after save, after live-reload): clears prior
  // notes first so it never double-renders.
  function renderComments() {
    // Runs unconditionally (not gated on the fetch below succeeding) since
    // click-to-comment on a table depends on rows being tagged even when
    // there are no saved comments yet.
    tagTableRows();

    authFetch('/comments?file=' + encodeURIComponent(window.VIV_PATH))
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (comments) {
        if (!comments) return;

        // A table-row note lives inside a wrapper <tr class="viv-comment-row">
        // (see attachAfter) — drop the whole row, not just the note div,
        // or re-rendering leaves an empty row behind.
        var existing = document.querySelectorAll('.viv-comment-note');
        for (var i = 0; i < existing.length; i++) {
          var row = existing[i].closest('tr.viv-comment-row');
          if (row) row.remove();
          else existing[i].remove();
        }

        var lastForBlock = [];
        function lastInsertedAfter(block) {
          for (var i = 0; i < lastForBlock.length; i++) {
            if (lastForBlock[i][0] === block) return lastForBlock[i][1];
          }
          return null;
        }
        function setLastInsertedAfter(block, note) {
          for (var i = 0; i < lastForBlock.length; i++) {
            if (lastForBlock[i][0] === block) {
              lastForBlock[i][1] = note;
              return;
            }
          }
          lastForBlock.push([block, note]);
        }

        for (var i = 0; i < comments.length; i++) {
          var comment = comments[i];
          var block = findBlock(comment);
          if (!block) continue;

          var note = buildNote(comment);
          var after = lastInsertedAfter(block) || block;
          var inserted = attachAfter(after, note);
          setLastInsertedAfter(block, inserted);
          block.classList.add('viv-commented');
        }
      })
      .catch(function () {});
  }

  // Shared form for new comments and edits. submit(text) returns the POST's
  // fetch promise; on success the form closes and comments re-render.
  // onDelete (edit forms only) adds a Delete button wired the same way.
  function buildForm(initialText, submit, onDelete) {
    var form = document.createElement('div');
    form.className = 'viv-comment-form';

    var textarea = document.createElement('textarea');
    textarea.rows = 3;
    textarea.value = initialText;

    var actions = document.createElement('div');
    actions.className = 'viv-comment-actions';

    var saveBtn = document.createElement('button');
    saveBtn.type = 'button';
    saveBtn.textContent = 'Save';

    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.textContent = 'Cancel';

    var error = document.createElement('div');
    error.className = 'viv-comment-error';
    error.textContent = "couldn't save — is the comment server running?";

    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(textarea);
    form.appendChild(actions);
    form.appendChild(error);

    function perform(request) {
      request
        .then(function (res) {
          if (res.ok) {
            closeOpenForm();
            renderComments();
          } else {
            error.style.display = 'block';
          }
        })
        .catch(function () {
          error.style.display = 'block';
        });
    }

    function save() {
      var comment = textarea.value.trim();
      if (!comment) return;
      perform(submit(comment));
    }

    if (onDelete) {
      var deleteBtn = document.createElement('button');
      deleteBtn.type = 'button';
      deleteBtn.textContent = 'Delete';
      deleteBtn.addEventListener('click', function () {
        if (!window.confirm('Delete this comment?')) return;
        perform(onDelete());
      });
      actions.appendChild(deleteBtn);
    }

    saveBtn.addEventListener('click', save);
    cancelBtn.addEventListener('click', closeOpenForm);
    textarea.addEventListener('keydown', function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        closeOpenForm();
      }
    });

    return form;
  }

  function openForm(block) {
    closeOpenForm();
    var form = buildForm('', function (text) {
      return authFetch('/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: window.VIV_PATH,
          line: Number(block.dataset.sourceLine) + 1,
          // Collapse whitespace: textContent of a wrapped paragraph contains
          // newlines, and a newline in the quote splits the heading line.
          quote: block.textContent.trim().replace(/\s+/g, ' ').slice(0, 80),
          comment: text,
        }),
      });
    });
    attachAfter(block, form);
    form.querySelector('textarea').focus();
  }

  // Clicking an unresolved note swaps it for a pre-filled form; the server
  // finds the matching block by its heading fields and rewrites it in place
  // (or removes it, for Delete).
  function openEditForm(note) {
    var comment = note._vivComment;
    closeOpenForm();
    var identity = {
      file: window.VIV_PATH,
      line: comment.line,
      quote: comment.quote,
      timestamp: comment.timestamp,
      oldComment: comment.comment,
    };
    function post(url, payload) {
      return authFetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      });
    }
    var form = buildForm(comment.comment, function (text) {
      return post('/comment/update', Object.assign({ comment: text }, identity));
    }, function () {
      return post('/comment/delete', identity);
    });
    note.hidden = true;
    note.insertAdjacentElement('afterend', form);
    form.querySelector('textarea').focus();
  }

  document.addEventListener('click', function (event) {
    if (event.target.closest('a, button, input, textarea')) return;
    if (event.target.closest('.viv-comment-form')) return;
    if (!window.getSelection().isCollapsed) return;
    var note = event.target.closest('.viv-comment-note');
    if (note) {
      openEditForm(note);
      return;
    }
    var block = event.target.closest('.source-line');
    if (block) openForm(block);
  });

  renderComments();
  checkVersion();

  // Vivify live-reload replaces the #body-content subtree wholesale, which
  // would wipe our notes; re-render after it settles. Debounced since
  // reloads can touch many nodes at once. Mutations caused by our own note
  // and form elements are ignored so this doesn't loop on itself.
  var renderDebounceTimer = null;
  function scheduleRenderComments() {
    if (renderDebounceTimer) clearTimeout(renderDebounceTimer);
    renderDebounceTimer = setTimeout(function () {
      renderDebounceTimer = null;
      renderComments();
    }, 200);
  }

  function isOwnNode(node) {
    // A table-row note/form is added/removed as a whole <tr class=
    // "viv-comment-row"> (see attachAfter) — the observer only sees that
    // wrapper, not the note/form div nested inside it, so it needs its own
    // check or every table comment would retrigger a render loop.
    return node.nodeType === 1 && node.classList &&
      (node.classList.contains('viv-comment-note') || node.classList.contains('viv-comment-form') ||
        node.classList.contains('viv-comment-row'));
  }

  var lastDocMutation = 0;
  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      var changed = [];
      for (var j = 0; j < mutation.addedNodes.length; j++) changed.push(mutation.addedNodes[j]);
      for (var j = 0; j < mutation.removedNodes.length; j++) changed.push(mutation.removedNodes[j]);
      for (var j = 0; j < changed.length; j++) {
        if (!isOwnNode(changed[j])) {
          lastDocMutation = Date.now();
          scheduleRenderComments();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });

  // Reload fallback: vivify's fs.watch dies when the doc is saved via
  // rename (atomic replace — how Claude Code and many editors write files),
  // after which its live-reload never fires again. Poll mtimes via the
  // sidecar; if the doc changed and vivify didn't redraw within a beat,
  // reload the page ourselves. A changed comments file just re-renders
  // the notes.
  var docMtime = null;
  var commentsMtime = null;
  var reloadPendingSince = 0;
  setInterval(function () {
    authFetch('/mtimes?file=' + encodeURIComponent(window.VIV_PATH))
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (m) {
        if (!m) return;
        if (docMtime === null && commentsMtime === null) {
          // First poll: anything written since the page rendered would be
          // absorbed into the baseline and missed — compare against the
          // page's load time instead.
          if (m.comments === null || m.comments > performance.timeOrigin) scheduleRenderComments();
          if (m.doc !== null && m.doc > performance.timeOrigin) reloadPendingSince = Date.now();
        } else {
          if (m.comments !== commentsMtime) scheduleRenderComments();
          if (m.doc !== docMtime && !reloadPendingSince) reloadPendingSince = Date.now();
        }
        commentsMtime = m.comments;
        docMtime = m.doc;
        if (!reloadPendingSince || Date.now() - reloadPendingSince < 1500) return;
        if (lastDocMutation >= reloadPendingSince) {
          reloadPendingSince = 0; // vivify's own reload handled it
          return;
        }
        // Never blow away a comment draft; retry on the next tick instead.
        if (document.querySelector('.viv-comment-form')) return;
        location.reload();
      })
      .catch(function () {});
  }, 2000);
})();
