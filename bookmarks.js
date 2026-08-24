const Bookmarks = {
  _items: [],
  _selectedId: null,

  async render() {
    const ws = await DB.getWorkspace();
    this._items = [];
    const container = document.getElementById('bookmarks-list');
    const selectedIndex = this._selectedIndex();

    if (ws.bookmarks.length === 0 && ws.folders.length === 0) {
      container.innerHTML = `
        <div class="empty-state">
          No bookmarks yet. Press <kbd>n</kbd> to add one or <kbd>f</kbd> for a folder.
        </div>
      `;
      return;
    }

    let html = '';

    // Folder groups — horizontal columns (top)
    if (ws.folders.length > 0) {
      html += '<section class="folder-groups">';
      ws.folders.forEach(f => {
        const i = this._items.length;
        this._items.push({ ...f, type: 'folder' });
        html += `
          <div class="folder-group">
            <div class="folder-group-header${i === selectedIndex ? ' selected' : ''}"
                 data-index="${i}" data-id="${f.id}" data-type="folder">
              <span class="folder-group-name">${Util.escape(f.name)}</span>
              <span class="folder-group-count">${f.bookmarks.length}</span>
              <span class="bookmark-actions">
                <button class="bookmark-action" data-action="rename" title="Rename">r</button>
                <button class="bookmark-action delete" data-action="delete" title="Delete">✕</button>
              </span>
            </div>
            <div class="folder-group-items" data-folder="${f.id}">
        `;
        f.bookmarks.forEach(b => {
          const bi = this._items.length;
          this._items.push({ ...b, type: 'bookmark', folderId: f.id });
          html += this._renderItem(b, bi);
        });
        html += '</div></div>';
      });
      html += '</section>';
    }

    // Root bookmarks row (bottom) — always present as a drop target
    html += '<section class="bookmark-section" data-folder="">';
    ws.bookmarks.forEach(b => {
      const i = this._items.length;
      this._items.push({ ...b, type: 'bookmark', folderId: null });
      html += this._renderItem(b, i);
    });
    html += '</section>';

    container.innerHTML = html;
    this._bindEvents(container);
    this._loadFavicons(container);
  },

  _renderItem(item, index) {
    const keyTitle = item.key
      ? ` title="Press ${item.key.length === 2 ? `${Util.escape(item.key[0])} then ${Util.escape(item.key[1])}` : Util.escape(item.key)} to open"`
      : '';
    return `
      <div class="bookmark-item${index === this._selectedIndex() ? ' selected' : ''}"
           data-index="${index}" data-id="${item.id}"
           draggable="true"
           data-url="${Util.escape(item.url || '')}">
        ${item.key ? `<span class="bookmark-key"${keyTitle}>${Util.escape(item.key)}</span>` : ''}
        <span class="bookmark-icon" data-favicon="${Util.escape(this._getDomain(item.url))}"></span>
        <span class="bookmark-name">${Util.escape(item.name)}</span>
        <span class="bookmark-actions">
          <button class="bookmark-action" data-action="edit" title="Edit">e</button>
          <button class="bookmark-action delete" data-action="delete" title="Delete">✕</button>
        </span>
      </div>
    `;
  },

  _selected() {
    if (!this._selectedId) return null;
    return this._items.find(i => i.id === this._selectedId) || null;
  },

  _selectedIndex() {
    if (!this._selectedId) return -1;
    return this._items.findIndex(i => i.id === this._selectedId);
  },

  async _setSelectedIndex(idx) {
    if (this._items.length === 0) return;
    idx = Math.max(0, Math.min(idx, this._items.length - 1));
    this._selectedId = this._items[idx].id;
    this._updateSelectionUI();
  },

  _updateSelectionUI() {
    const container = document.getElementById('bookmarks-list');
    const selIdx = this._selectedIndex();
    container.querySelectorAll('.selected').forEach(el => el.classList.remove('selected'));
    if (selIdx === -1) return;
    const el = container.querySelector(`[data-index="${selIdx}"]`);
    if (el) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    }
  },

  async _loadFavicons(container) {
    const icons = container.querySelectorAll('[data-favicon]');
    const defaultIcon = 'data:image/svg+xml,<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16"><circle cx="8" cy="8" r="7" fill="%23555"/></svg>';

    for (const el of icons) {
      const domain = el.dataset.favicon;
      if (!domain) {
        el.innerHTML = `<img class="favicon" src="${defaultIcon}" alt="">`;
        continue;
      }
      const pageUrl = `https://${domain}`;
      const url = new URL(chrome.runtime.getURL('/_favicon/'));
      url.searchParams.set('pageUrl', pageUrl);
      url.searchParams.set('size', '32');
      el.innerHTML = `<img class="favicon" src="${url.toString()}" alt="">`;
      el.querySelector('img').addEventListener('error', function() { this.src = defaultIcon; });
    }
  },

  _getDomain(url) {
    try { return new URL(url).hostname; } catch { return ''; }
  },

  _bindEvents(container) {
    // Bookmark items — click to open
    container.querySelectorAll('.bookmark-item').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          e.stopPropagation();
          const item = this._items[parseInt(el.dataset.index)];
          if (action.dataset.action === 'delete') this._delete(item);
          if (action.dataset.action === 'edit') this.showBookmarkModal(item);
          return;
        }
        this._open(this._items[parseInt(el.dataset.index)]);
      });
      this._bindDrag(el, 'bookmark');
      this._bindItemDrop(el);
    });

    // Folder headers — click to select, actions, drag to reorder
    container.querySelectorAll('.folder-group-header').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          e.stopPropagation();
          const item = this._items[parseInt(el.dataset.index)];
          if (action.dataset.action === 'delete') this._delete(item);
          if (action.dataset.action === 'rename') this._rename(item);
          return;
        }
        this._selectedId = this._items[parseInt(el.dataset.index)].id;
        this._updateSelectionUI();
      });
      this._bindDrag(el, 'folder-header');
    });

    // Drop targets for moving items into folders / root
    container.querySelectorAll('.folder-group-items, .bookmark-section').forEach(el => {
      this._bindContainerDrop(el);
    });
    container.querySelectorAll('.folder-group-header').forEach(el => {
      this._bindFolderDrop(el);
    });
  },

  // --- Drag & drop ---

  _bindDrag(el, kind) {
    el.addEventListener('dragstart', (e) => {
      e.stopPropagation();
      e.dataTransfer.effectAllowed = 'move';
      const item = this._items[parseInt(el.dataset.index)];
      e.dataTransfer.setData('text/plain', JSON.stringify({ kind, id: item.id }));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  },

  _markDropTarget(el, on) {
    el.classList.toggle('drop-target', on);
  },

  // Drop onto a folder header: append bookmark into that folder,
  // or reorder folders when a folder header is dragged.
  _bindFolderDrop(header) {
    header.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._markDropTarget(header, true);
    });
    header.addEventListener('dragleave', () => this._markDropTarget(header, false));
    header.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._markDropTarget(header, false);
      const payload = this._dragPayload(e);
      if (!payload) return;
      if (payload.kind === 'folder') {
        await this._reorderFolders(payload.id, header.dataset.id);
      } else {
        await this._moveBookmarkTo(payload.id, header.dataset.id, null);
      }
    });
  },

  // Drop into a container's empty area: append to that container.
  _bindContainerDrop(listEl) {
    listEl.addEventListener('dragover', (e) => {
      if (e.target.closest('.bookmark-item')) return;
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      this._markDropTarget(listEl, true);
    });
    listEl.addEventListener('dragleave', () => this._markDropTarget(listEl, false));
    listEl.addEventListener('drop', async (e) => {
      if (e.target.closest('.bookmark-item')) return;
      e.preventDefault();
      this._markDropTarget(listEl, false);
      const payload = this._dragPayload(e);
      if (!payload || payload.kind !== 'bookmark') return;
      await this._moveBookmarkTo(payload.id, listEl.dataset.folder || null, null);
    });
  },

  // Drop onto an item: insert the dragged bookmark before it.
  _bindItemDrop(el) {
    el.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.stopPropagation();
      e.dataTransfer.dropEffect = 'move';
      this._markDropTarget(el, true);
    });
    el.addEventListener('dragleave', () => this._markDropTarget(el, false));
    el.addEventListener('drop', async (e) => {
      e.preventDefault();
      e.stopPropagation();
      this._markDropTarget(el, false);
      const payload = this._dragPayload(e);
      if (!payload || payload.kind !== 'bookmark') return;
      const target = this._items[parseInt(el.dataset.index)];
      if (!target || target.id === payload.id) return;

      // Index of the drop position within the target's container
      const containerItems = this._items.filter(i =>
        i.type === 'bookmark' && (i.folderId ?? null) === (target.folderId ?? null));
      let insertAt = containerItems.findIndex(i => i.id === target.id);

      const source = this._items.find(i => i.id === payload.id);
      const sameContainer =
        source && ((source.folderId ?? null) === (target.folderId ?? null));
      if (sameContainer) {
        const srcIdx = containerItems.findIndex(i => i.id === payload.id);
        if (srcIdx !== -1 && srcIdx < insertAt) insertAt -= 1;
      }
      await this._moveBookmarkTo(payload.id, target.folderId ?? null, Math.max(0, insertAt));
    });
  },

  _dragPayload(e) {
    try { return JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return null; }
  },

  // Move a bookmark into a container (folder id or null for root) at an
  // optional index. targetIndex=null appends to the end.
  async _moveBookmarkTo(id, targetFolderId, targetIndex = null) {
    const item = this._items.find(i => i.id === id);
    if (!item) return;
    const sameContainer = (item.folderId ?? null) === (targetFolderId ?? null);
    if (sameContainer && targetIndex === null) return; // no-op drop

    await DB.moveBookmark(id, item.folderId, targetFolderId,
      sameContainer ? targetIndex : (targetIndex ?? Number.MAX_SAFE_INTEGER));
    this._selectedId = id;
    await App.refresh();
    Keys.showHint('Moved');
  },

  async _reorderFolders(draggedId, targetId) {
    const ws = await DB.getWorkspace();
    const fromIdx = ws.folders.findIndex(f => f.id === draggedId);
    const toIdx = ws.folders.findIndex(f => f.id === targetId);
    if (fromIdx === -1 || toIdx === -1 || fromIdx === toIdx) return;
    // moveFolder takes the final-list index; removing an earlier item
    // shifts the target position left by one
    await DB.moveFolder(draggedId, toIdx > fromIdx ? toIdx - 1 : toIdx);
    this._selectedId = draggedId;
    await App.refresh();
    Keys.showHint('Moved folder');
  },

  // --- Actions ---

  _open(item) {
    if (!item || item.type === 'folder' || !item.url) return;
    DB.get().then(data => Util.openUrl(item.url, data.openInNewTab));
  },

  async _delete(item) {
    let entry;
    if (item.type === 'folder') {
      entry = await DB.deleteFolder(item.id);
      if (!entry) return;
      Toast.show(`Deleted folder "${item.name}"`, {
        actionLabel: 'Undo',
        onAction: async () => { await DB.restoreFolder(entry); await App.refresh(); }
      });
    } else {
      entry = await DB.deleteBookmark(item.id, item.folderId);
      if (!entry) return;
      Toast.show(`Deleted "${item.name}"`, {
        actionLabel: 'Undo',
        onAction: async () => { await DB.restoreBookmark(entry); await App.refresh(); }
      });
    }
    this._selectedId = null;
    await App.refresh();
  },

  async _rename(item) {
    const header = document.querySelector(`.folder-group-header[data-id="${item.id}"]`);
    if (!header) return;

    const nameEl = header.querySelector('.folder-group-name');
    const actionsEl = header.querySelector('.bookmark-actions');
    const countEl = header.querySelector('.folder-group-count');

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'folder-rename-input';
    input.value = item.name;

    nameEl.textContent = '';
    nameEl.appendChild(input);
    if (actionsEl) actionsEl.style.display = 'none';
    if (countEl) countEl.style.display = 'none';
    input.focus();
    input.select();

    const finish = async (save) => {
      const newName = input.value.trim();
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeydown);
      if (save && newName && newName !== item.name) {
        await DB.renameItem(item.id, newName, 'folder');
      }
      await this.render();
    };

    const onBlur = () => finish(true);
    const onKeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };

    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeydown);
  },

  // --- Modal (add + edit share one implementation) ---

  showBookmarkModal(item = null) {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const isEdit = !!item;

    const ws = DB._cache ? DB._cache.workspaces[DB._cache.activeWorkspace] : null;
    let folderOptions = `<option value="">Root (no folder)</option>`;
    if (ws) {
      ws.folders.forEach(f => {
        const sel = f.id === item?.folderId ? ' selected' : '';
        folderOptions += `<option value="${f.id}"${sel}>${Util.escape(f.name)}</option>`;
      });
    }

    modal.innerHTML = `
      <h3>${isEdit ? 'Edit Bookmark' : 'New Bookmark'}</h3>
      <input type="text" id="bm-name" placeholder="Name" value="${Util.escape(item?.name || '')}" autofocus>
      <input type="url" id="bm-url" placeholder="https://..." value="${Util.escape(item?.url || '')}" required>
      <select id="bm-folder">${folderOptions}</select>
      <div id="bm-key-suggestion">
        <span class="key-label">Keybinding:</span>
        <input type="text" id="bm-key" placeholder="auto" value="${Util.escape(item?.key || '')}" maxlength="2">
        <span id="bm-key-auto" class="key-auto"></span>
      </div>
      <div id="bm-error" class="modal-error hidden"></div>
      <div class="modal-actions">
        <button id="bm-cancel">Cancel</button>
        <button id="bm-save" class="primary">Save</button>
      </div>
    `;

    const nameInput = document.getElementById('bm-name');
    const urlInput = document.getElementById('bm-url');
    const folderSelect = document.getElementById('bm-folder');
    const keyInput = document.getElementById('bm-key');
    const keyAuto = document.getElementById('bm-key-auto');
    const errorEl = document.getElementById('bm-error');

    nameInput.focus();

    const updateSuggestion = () => {
      const name = nameInput.value.trim();
      if (!name) { keyAuto.textContent = ''; return; }
      const data = DB._cache;
      if (!data) return;
      const suggested = DB.suggestKey(name, data);
      keyAuto.textContent = suggested.length === 2
        ? `suggested: ${suggested[0]} then ${suggested[1]}`
        : `suggested: ${suggested}`;
    };

    nameInput.addEventListener('input', updateSuggestion);
    if (!isEdit) updateSuggestion();

    const close = () => overlay.classList.add('hidden');
    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    };

    const save = async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const key = (keyInput.value.trim().toLowerCase()) || null;
      const folderId = folderSelect.value || null;

      if (!name) { nameInput.focus(); showError('Name is required'); return; }
      if (!url) { urlInput.focus(); showError('URL is required'); return; }

      const fullUrl = url.startsWith('http') ? url : `https://${url}`;
      try {
        new URL(fullUrl);
      } catch {
        urlInput.focus();
        showError('Invalid URL');
        return;
      }

      if (key && key !== (item?.key || null)) {
        const check = DB.validateKey(key);
        if (!check.ok) { keyInput.focus(); showError(check.error); return; }
      }

      if (isEdit) {
        await DB.editBookmark(item.id, { name, url: fullUrl, key, folderId }, item.folderId || null);
      } else {
        await DB.addBookmark({ name, url: fullUrl, folderId, keybinding: key });
      }
      close();
      this._selectedId = null;
      await App.refresh();
      Keys.showHint(`${isEdit ? 'Updated' : 'Added'}: ${name}`);
    };

    document.getElementById('bm-save').addEventListener('click', save);
    document.getElementById('bm-cancel').addEventListener('click', close);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); urlInput.focus(); } });
    [urlInput, folderSelect, keyInput].forEach(el => {
      el.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    });
  },

  showAddBookmark() { this.showBookmarkModal(null); },
  showEditBookmark(item) { this.showBookmarkModal(item); },

  showAddFolder() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    modal.innerHTML = `
      <h3>New Folder</h3>
      <input type="text" id="folder-name" placeholder="Folder name" autofocus>
      <div class="modal-actions">
        <button id="folder-cancel">Cancel</button>
        <button id="folder-save" class="primary">Save</button>
      </div>
    `;

    const nameInput = document.getElementById('folder-name');
    nameInput.focus();

    const save = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await DB.addFolder({ name });
      overlay.classList.add('hidden');
      await App.refresh();
      Keys.showHint(`Added folder: ${name}`);
    };

    document.getElementById('folder-save').addEventListener('click', save);
    document.getElementById('folder-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  // --- Keyboard ---

  handleKey(key, event, mode, opts = {}) {
    if (mode !== 'normal') return false;
    if (event && (event.ctrlKey || event.metaKey || event.altKey)) return false;

    if (key === 'n' && !event) { this.showBookmarkModal(null); return true; }
    if (key === 'f' && !event) { this.showAddFolder(); return true; }

    const selectionEnabled = opts.selection !== false;

    if (selectionEnabled && event &&
        (key === 'Tab' || (!event.shiftKey && (key === 'ArrowDown' || key === 'ArrowUp')))) {
      event.preventDefault();
      const back = (key === 'Tab' && event.shiftKey) || key === 'ArrowUp';
      const cur = this._selectedIndex();
      const next = cur === -1
        ? (back ? this._items.length - 1 : 0)
        : back ? cur - 1 : cur + 1;
      this._setSelectedIndex((next + this._items.length) % Math.max(1, this._items.length));
      return true;
    }

    // Reordering / cross-container moves
    if (selectionEnabled && event?.shiftKey && (key === 'ArrowDown' || key === 'ArrowUp')) {
      event.preventDefault();
      this._shiftSelected(key === 'ArrowDown' ? 1 : -1);
      return true;
    }
    if (selectionEnabled && event?.shiftKey && (key === 'ArrowRight' || key === 'ArrowLeft')) {
      event.preventDefault();
      this._moveSelectedToContainer(key === 'ArrowRight' ? 1 : -1);
      return true;
    }

    if (!selectionEnabled) {
      // Custom keybindings still work while another tool has selection
      return this._tryCustomKey(key);
    }

    const current = this._selected();

    if (key === 'Enter' && current) {
      this._open(current);
      return true;
    }

    if (key === 'e' && current) {
      if (current.type === 'folder') this._rename(current);
      else this.showBookmarkModal(current);
      return true;
    }

    if (key === 'd' && current) {
      this._delete(current);
      return true;
    }

    return this._tryCustomKey(key);
  },

  _tryCustomKey(key) {
    if (key.length !== 1 && key.length !== 2) return false;
    const item = this._items.find(i => i.type === 'bookmark' && i.key === key);
    if (item) {
      this._open(item);
      return true;
    }
    return false;
  },

  // Shift+↑/↓ — move within container; at the boundary, spill into the
  // adjacent container so long jumps aren't needed.
  async _shiftSelected(dir) {
    const item = this._selected();
    if (!item) return;

    if (item.type === 'folder') {
      const moved = await DB.reorderFolder(item.id, dir);
      if (moved) {
        await App.refresh();
        Keys.showHint('Moved folder');
      }
      return;
    }

    const moved = await DB.reorderBookmark(item.id, item.folderId, dir);
    if (moved) {
      await App.refresh();
      return;
    }

    // Boundary: move into neighbouring container
    await this._moveSelectedToContainer(dir);
  },

  // Containers in visual order: folders top-to-bottom, then root.
  async _containerOrder() {
    const ws = await DB.getWorkspace();
    return [...ws.folders.map(f => f.id), null];
  },

  async _moveSelectedToContainer(dir) {
    const item = this._selected();
    if (!item || item.type !== 'bookmark') return;

    const order = await this._containerOrder();
    const curIdx = order.indexOf(item.folderId ?? null);
    const targetIdx = curIdx + dir;
    if (curIdx === -1 || targetIdx < 0 || targetIdx >= order.length) return;

    const targetFolderId = order[targetIdx];
    // Moving down → insert at top of next container; up → append at end of previous
    const insertAt = dir > 0 ? 0 : Number.MAX_SAFE_INTEGER;
    await DB.moveBookmark(item.id, item.folderId, targetFolderId, insertAt);
    this._selectedId = item.id;
    await App.refresh();
    Keys.showHint('Moved');
  }
};
