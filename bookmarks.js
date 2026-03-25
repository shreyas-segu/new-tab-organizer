const Bookmarks = {
  _selected: -1,
  _items: [],

  async render() {
    const ws = await DB.getWorkspace();
    this._items = [];
    const container = document.getElementById('bookmarks-list');

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
            <div class="folder-group-header${i === this._selected ? ' selected' : ''}"
                 data-index="${i}" data-id="${f.id}" data-type="folder">
              <span class="folder-group-name">${this._escape(f.name)}</span>
              <span class="folder-group-count">${f.bookmarks.length}</span>
              <span class="bookmark-actions">
                <button class="bookmark-action" data-action="rename" title="Rename">r</button>
                <button class="bookmark-action delete" data-action="delete" title="Delete">✕</button>
              </span>
            </div>
            <div class="folder-group-items">
        `;
        f.bookmarks.forEach(b => {
          const bi = this._items.length;
          this._items.push({ ...b, folderId: f.id });
          html += this._renderItem(b, bi);
        });
        html += '</div></div>';
      });
      html += '</section>';
    }

    // Root bookmarks row (bottom)
    if (ws.bookmarks.length > 0) {
      html += '<section class="bookmark-section">';
      ws.bookmarks.forEach(b => {
        const i = this._items.length;
        this._items.push(b);
        html += this._renderItem(b, i);
      });
      html += '</section>';
    }

    container.innerHTML = html;
    this._bindEvents(container);
    this._loadFavicons(container);
  },

  _renderItem(item, index) {
    const url = item.url ? this._truncateUrl(item.url) : '';
    const domain = item.url ? this._getDomain(item.url) : '';
    return `
      <div class="bookmark-item${index === this._selected ? ' selected' : ''}"
           data-index="${index}" data-id="${item.id}"
           data-url="${this._escape(item.url || '')}">
        <span class="bookmark-key">${item.key || ''}</span>
        <span class="bookmark-icon" data-favicon="${this._escape(domain)}"></span>
        <span class="bookmark-name">${this._escape(item.name)}</span>
        ${url ? `<span class="bookmark-url">${this._escape(url)}</span>` : ''}
        <span class="bookmark-actions">
          <button class="bookmark-action" data-action="edit" title="Edit">e</button>
          <button class="bookmark-action delete" data-action="delete" title="Delete">✕</button>
        </span>
      </div>
    `;
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
          const idx = parseInt(el.dataset.index);
          const item = this._items[idx];
          if (action.dataset.action === 'delete') this._delete(item);
          if (action.dataset.action === 'edit') this.showEditBookmark(item);
          return;
        }
        const idx = parseInt(el.dataset.index);
        this._open(this._items[idx]);
      });
    });

    // Folder headers — click to select, actions
    container.querySelectorAll('.folder-group-header').forEach(el => {
      el.addEventListener('click', (e) => {
        const action = e.target.closest('[data-action]');
        if (action) {
          e.stopPropagation();
          const idx = parseInt(el.dataset.index);
          const item = this._items[idx];
          if (action.dataset.action === 'delete') this._delete(item);
          if (action.dataset.action === 'rename') this._rename(item);
          return;
        }
        const idx = parseInt(el.dataset.index);
        this._selected = idx;
        this.render();
      });
    });
  },

  _open(item) {
    if (item.type === 'folder') return;
    if (item.url) {
      const data = DB._cache;
      if (data?.openInNewTab) {
        window.open(item.url, '_blank');
      } else {
        window.location.href = item.url;
      }
    }
  },

  async _delete(item) {
    if (item.type === 'folder') {
      if (item.bookmarks && item.bookmarks.length > 0) {
        if (!confirm(`Delete folder "${item.name}" and its ${item.bookmarks.length} bookmark(s)?`)) return;
      }
      await DB.deleteFolder(item.id);
    } else {
      if (!confirm(`Delete "${item.name}"?`)) return;
      await DB.deleteBookmark(item.id, item.folderId);
    }
    this._selected = -1;
    await this.render();
    Keys.showHint(`Deleted: ${item.name}`);
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

  showAddBookmark() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const ws = DB._cache ? DB._cache.workspaces[DB._cache.activeWorkspace] : null;
    let folderOptions = `<option value="">Root (no folder)</option>`;
    if (ws) {
      ws.folders.forEach(f => {
        folderOptions += `<option value="${f.id}">${this._escape(f.name)}</option>`;
      });
    }

    modal.innerHTML = `
      <h3>New Bookmark</h3>
      <input type="text" id="bm-name" placeholder="Name" autofocus>
      <input type="url" id="bm-url" placeholder="https://..." required>
      <select id="bm-folder">${folderOptions}</select>
      <div id="bm-key-suggestion">
        <span class="key-label">Keybinding:</span>
        <input type="text" id="bm-key" placeholder="auto" maxlength="2">
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

    const close = () => overlay.classList.add('hidden');

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    };

    const save = async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const key = keyInput.value.trim() || null;
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

      await DB.addBookmark({ name, url: fullUrl, folderId, keybinding: key });
      close();
      await this.render();
      Keys.showHint(`Added: ${name}`);
    };

    document.getElementById('bm-save').addEventListener('click', save);
    document.getElementById('bm-cancel').addEventListener('click', close);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); urlInput.focus(); } });
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    folderSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  },

  showEditBookmark(item) {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const ws = DB._cache ? DB._cache.workspaces[DB._cache.activeWorkspace] : null;
    let folderOptions = `<option value="">Root (no folder)</option>`;
    if (ws) {
      ws.folders.forEach(f => {
        const sel = f.id === item.folderId ? ' selected' : '';
        folderOptions += `<option value="${f.id}"${sel}>${this._escape(f.name)}</option>`;
      });
    }

    modal.innerHTML = `
      <h3>Edit Bookmark</h3>
      <input type="text" id="bm-name" placeholder="Name" value="${this._escape(item.name)}" autofocus>
      <input type="url" id="bm-url" placeholder="https://..." value="${this._escape(item.url || '')}" required>
      <select id="bm-folder">${folderOptions}</select>
      <div id="bm-key-suggestion">
        <span class="key-label">Keybinding:</span>
        <input type="text" id="bm-key" placeholder="auto" value="${this._escape(item.key || '')}" maxlength="2">
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

    const close = () => overlay.classList.add('hidden');

    const showError = (msg) => {
      errorEl.textContent = msg;
      errorEl.classList.remove('hidden');
    };

    const save = async () => {
      const name = nameInput.value.trim();
      const url = urlInput.value.trim();
      const key = keyInput.value.trim() || null;
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

      await DB.editBookmark(item.id, { name, url: fullUrl, key, folderId }, item.folderId || null);
      close();
      this._selected = -1;
      await this.render();
      Keys.showHint(`Updated: ${name}`);
    };

    document.getElementById('bm-save').addEventListener('click', save);
    document.getElementById('bm-cancel').addEventListener('click', close);
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); urlInput.focus(); } });
    urlInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    folderSelect.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); save(); } });
  },

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
      await this.render();
      Keys.showHint(`Added folder: ${name}`);
    };

    document.getElementById('folder-save').addEventListener('click', save);
    document.getElementById('folder-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  handleKey(key, event, mode) {
    if (mode !== 'normal') return false;
    if (event && (event.ctrlKey || event.metaKey || event.altKey)) return false;

    if (key === 'n') { this.showAddBookmark(); return true; }
    if (key === 'f') { this.showAddFolder(); return true; }

    if (key === 'Tab' && event) {
      if (event.shiftKey) {
        this._selected = this._selected > 0 ? this._selected - 1 : this._items.length - 1;
      } else {
        this._selected = this._selected < this._items.length - 1 ? this._selected + 1 : 0;
      }
      this.render();
      return true;
    }

    if (key === 'Enter' && this._selected >= 0) {
      this._open(this._items[this._selected]);
      return true;
    }

    if (key === 'e' && this._selected >= 0) {
      const item = this._items[this._selected];
      if (item.type === 'folder') {
        this._rename(item);
      } else {
        this.showEditBookmark(item);
      }
      return true;
    }

    if (key === 'd' && this._selected >= 0) {
      this._delete(this._items[this._selected]);
      return true;
    }

    // Check for keybinding matches (single and two-letter)
    if (key.length === 1 || key.length === 2) {
      const item = this._items.find(i => i.key === key);
      if (item) {
        this._open(item);
        return true;
      }
    }

    return false;
  },

  _truncateUrl(url) {
    try {
      const u = new URL(url);
      return u.hostname;
    } catch {
      return url.slice(0, 40);
    }
  },

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
