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
      '.viv-comment-note {' +
      '  margin: 2px 0 4px 1.5em; font-style: italic; font-size: 0.9em;' +
      '  color: var(--text-secondary); white-space: pre-wrap;' +
      '  cursor: pointer;' +
      '}' +
      '.viv-comment-note-timestamp {' +
      '  font-style: normal; font-size: 0.85em;' +
      '}';
    document.head.appendChild(style);
  }

  function closeOpenForm() {
    var open = document.querySelector('.viv-comment-form');
    if (open) open.remove();
    // A note hidden behind an edit form comes back when the form goes away.
    var hidden = document.querySelectorAll('.viv-comment-note[hidden]');
    for (var i = 0; i < hidden.length; i++) hidden[i].hidden = false;
  }

  function commentsBase() {
    return location.protocol + '//' + location.hostname + ':31623';
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
    fetch(commentsBase() + '/comments?file=' + encodeURIComponent(window.VIV_PATH))
      .then(function (res) {
        return res.ok ? res.json() : null;
      })
      .then(function (comments) {
        if (!comments) return;

        var existing = document.querySelectorAll('.viv-comment-note');
        for (var i = 0; i < existing.length; i++) existing[i].remove();

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
          after.insertAdjacentElement('afterend', note);
          setLastInsertedAfter(block, note);
          block.classList.add('viv-commented');
        }
      })
      .catch(function () {});
  }

  // Shared form for new comments and edits. submit(text) returns the POST's
  // fetch promise; on success the form closes and comments re-render.
  function buildForm(initialText, submit) {
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

    function save() {
      var comment = textarea.value.trim();
      if (!comment) return;
      submit(comment)
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
      // Target location.hostname, not localhost: Vivify binds all
      // interfaces and pages may be viewed from another machine.
      return fetch(commentsBase() + '/comment', {
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
    block.insertAdjacentElement('afterend', form);
    form.querySelector('textarea').focus();
  }

  // Clicking an unresolved note swaps it for a pre-filled form; the server
  // finds the matching block by its heading fields and rewrites it in place.
  function openEditForm(note) {
    var comment = note._vivComment;
    closeOpenForm();
    var form = buildForm(comment.comment, function (text) {
      return fetch(commentsBase() + '/comment/update', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          file: window.VIV_PATH,
          line: comment.line,
          quote: comment.quote,
          timestamp: comment.timestamp,
          oldComment: comment.comment,
          comment: text,
        }),
      });
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
    return node.nodeType === 1 && node.classList &&
      (node.classList.contains('viv-comment-note') || node.classList.contains('viv-comment-form'));
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
    fetch(commentsBase() + '/mtimes?file=' + encodeURIComponent(window.VIV_PATH))
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
