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
      '}' +
      '.viv-comment-note-timestamp {' +
      '  font-style: normal; font-size: 0.85em;' +
      '}';
    document.head.appendChild(style);
  }

  function closeOpenForm() {
    var open = document.querySelector('.viv-comment-form');
    if (open) open.remove();
  }

  function commentsBase() {
    return location.protocol + '//' + location.hostname + ':31623';
  }

  function buildNote(comment) {
    var note = document.createElement('div');
    note.className = 'viv-comment-note';
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
      if (candidates[i].textContent.trim().indexOf(comment.quote) === 0) return candidates[i];
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

  function openForm(block) {
    closeOpenForm();

    var form = document.createElement('div');
    form.className = 'viv-comment-form';

    var textarea = document.createElement('textarea');
    textarea.rows = 3;

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

    block.insertAdjacentElement('afterend', form);
    textarea.focus();

    function save() {
      var comment = textarea.value.trim();
      if (!comment) return;
      var payload = {
        file: window.VIV_PATH,
        line: Number(block.dataset.sourceLine) + 1,
        quote: block.textContent.trim().slice(0, 80),
        comment: comment,
      };
      // Target location.hostname, not localhost: Vivify binds all
      // interfaces and pages may be viewed from another machine.
      fetch(commentsBase() + '/comment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then(function (res) {
          if (res.ok) {
            form.remove();
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
    cancelBtn.addEventListener('click', function () {
      form.remove();
    });
    textarea.addEventListener('keydown', function (event) {
      if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') {
        event.preventDefault();
        save();
      } else if (event.key === 'Escape') {
        event.preventDefault();
        form.remove();
      }
    });
  }

  document.addEventListener('click', function (event) {
    var block = event.target.closest('.source-line');
    if (!block) return;
    if (event.target.closest('a, button, input, textarea')) return;
    if (event.target.closest('.viv-comment-form')) return;
    if (!window.getSelection().isCollapsed) return;
    openForm(block);
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

  var observer = new MutationObserver(function (mutations) {
    for (var i = 0; i < mutations.length; i++) {
      var mutation = mutations[i];
      var changed = [];
      for (var j = 0; j < mutation.addedNodes.length; j++) changed.push(mutation.addedNodes[j]);
      for (var j = 0; j < mutation.removedNodes.length; j++) changed.push(mutation.removedNodes[j]);
      for (var j = 0; j < changed.length; j++) {
        if (!isOwnNode(changed[j])) {
          scheduleRenderComments();
          return;
        }
      }
    }
  });
  observer.observe(document.body, { childList: true, subtree: true });
})();
