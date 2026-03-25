const DB = {
  _cache: null,

  async get() {
    if (this._cache) return this._cache;
    const data = await chrome.storage.local.get('app');
    this._cache = data.app || this._defaults();
    return this._cache;
  },

  async save(data) {
    this._cache = data;
    await chrome.storage.local.set({ app: data });
  },

  _defaults() {
    return {
      workspaces: [
        { id: this._id(), name: 'Default', key: '1', folders: [], bookmarks: [] }
      ],
      activeWorkspace: 0,
      matrix: { q1: [], q2: [], q3: [], q4: [] },
      nextKey: 0,
      theme: 'system',
      customCSS: '',
      openInNewTab: false
    };
  },

  _id() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  },

  async getWorkspace() {
    const data = await this.get();
    return data.workspaces[data.activeWorkspace] || data.workspaces[0];
  },

  _RESERVED: new Set(['n', 'f', 'r', 'd', '?', 'm', 'j', 'g', 'u']),

  async addBookmark({ name, url, folderId = null, keybinding = null }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const key = keybinding || this.suggestKey(name, data);
    const bookmark = { id: this._id(), name, url, key, folderId, createdAt: Date.now() };
    if (folderId) {
      const folder = ws.folders.find(f => f.id === folderId);
      if (folder) folder.bookmarks.push(bookmark);
    } else {
      ws.bookmarks.push(bookmark);
    }
    await this.save(data);
    return bookmark;
  },

  async addFolder({ name }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const folder = { id: this._id(), name, bookmarks: [], createdAt: Date.now() };
    ws.folders.push(folder);
    await this.save(data);
    return folder;
  },

  async deleteBookmark(id, folderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    if (folderId) {
      const folder = ws.folders.find(f => f.id === folderId);
      if (folder) folder.bookmarks = folder.bookmarks.filter(b => b.id !== id);
    } else {
      ws.bookmarks = ws.bookmarks.filter(b => b.id !== id);
    }
    await this.save(data);
  },

  async deleteFolder(id) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    ws.folders = ws.folders.filter(f => f.id !== id);
    await this.save(data);
  },

  async renameItem(id, newName, type, folderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    if (type === 'folder') {
      const folder = ws.folders.find(f => f.id === id);
      if (folder) folder.name = newName;
    } else {
      const list = folderId
        ? ws.folders.find(f => f.id === folderId)?.bookmarks
        : ws.bookmarks;
      const item = list?.find(b => b.id === id);
      if (item) item.name = newName;
    }
    await this.save(data);
  },

  async editBookmark(id, { name, url, key, folderId }, oldFolderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    let bookmark = null;
    let sourceList = null;

    if (oldFolderId) {
      const folder = ws.folders.find(f => f.id === oldFolderId);
      if (folder) {
        sourceList = folder.bookmarks;
        bookmark = folder.bookmarks.find(b => b.id === id);
      }
    } else {
      sourceList = ws.bookmarks;
      bookmark = ws.bookmarks.find(b => b.id === id);
    }

    if (!bookmark) return;

    bookmark.name = name;
    bookmark.url = url;
    bookmark.key = key;

    if (folderId !== oldFolderId) {
      sourceList = sourceList.filter(b => b.id !== id);
      if (oldFolderId) {
        const oldFolder = ws.folders.find(f => f.id === oldFolderId);
        if (oldFolder) oldFolder.bookmarks = sourceList;
      } else {
        ws.bookmarks = sourceList;
      }

      if (folderId) {
        const newFolder = ws.folders.find(f => f.id === folderId);
        if (newFolder) {
          bookmark.folderId = folderId;
          newFolder.bookmarks.push(bookmark);
        }
      } else {
        bookmark.folderId = null;
        ws.bookmarks.push(bookmark);
      }
    }

    await this.save(data);
  },

  async addWorkspace(name) {
    const data = await this.get();
    const usedKeys = new Set(data.workspaces.map(w => w.key).filter(Boolean));
    let key = null;
    for (let i = 1; i <= 9; i++) {
      if (!usedKeys.has(String(i))) { key = String(i); break; }
    }
    if (!key) {
      const letters = 'abcdefghijklmnopqrstuvwxyz';
      for (const ch of letters) {
        if (!usedKeys.has(ch)) { key = ch; break; }
      }
    }
    const ws = { id: this._id(), name, key, folders: [], bookmarks: [] };
    data.workspaces.push(ws);
    await this.save(data);
    return ws;
  },

  async switchWorkspace(index) {
    const data = await this.get();
    data.activeWorkspace = index;
    await this.save(data);
  },

  async deleteWorkspace(index) {
    const data = await this.get();
    if (data.workspaces.length <= 1) return;
    data.workspaces.splice(index, 1);
    if (data.activeWorkspace >= data.workspaces.length) {
      data.activeWorkspace = data.workspaces.length - 1;
    }
    await this.save(data);
  },

  async renameWorkspace(index, newName) {
    const data = await this.get();
    data.workspaces[index].name = newName;
    await this.save(data);
  },

  // Eisenhower matrix
  async addMatrixItem(quadrant, text, dueDate = null) {
    const data = await this.get();
    const key = this.suggestKey(text, data);
    const item = { id: this._id(), text, key, done: false, dueDate, createdAt: Date.now() };
    data.matrix[quadrant].push(item);
    await this.save(data);
    return item;
  },

  async deleteMatrixItem(quadrant, id) {
    const data = await this.get();
    data.matrix[quadrant] = data.matrix[quadrant].filter(i => i.id !== id);
    await this.save(data);
  },

  async toggleMatrixItem(quadrant, id) {
    const data = await this.get();
    const item = data.matrix[quadrant].find(i => i.id === id);
    if (item) item.done = !item.done;
    await this.save(data);
  },

  async moveMatrixItem(id, fromQ, toQ) {
    const data = await this.get();
    const idx = data.matrix[fromQ].findIndex(i => i.id === id);
    if (idx === -1) return;
    const [item] = data.matrix[fromQ].splice(idx, 1);
    data.matrix[toQ].push(item);
    await this.save(data);
  },

  suggestKey(name, data) {
    const used = this._getUsedKeys(data);
    const lower = name.toLowerCase();
    const words = lower.split(/[\s\-_]+/).filter(Boolean);
    const firstLetters = words.map(w => w[0]);
    const firstTwo = lower.replace(/[^a-z0-9]/g, '').slice(0, 2);

    // Single-letter: first letter of each word
    for (const ch of firstLetters) {
      if (!used.has(ch) && !this._RESERVED.has(ch)) return ch;
    }

    // Two-letter: first two chars of name
    if (firstTwo.length >= 2) {
      const combo = firstTwo.slice(0, 2);
      if (!used.has(combo) && !this._RESERVED.has(combo[0])) return combo;
    }

    // Two-letter: initials (first+second word)
    if (firstLetters.length >= 2) {
      const combo = firstLetters[0] + firstLetters[1];
      if (!used.has(combo) && !this._RESERVED.has(combo[0])) return combo;
    }

    // Fallback: single letters a-z then two-letter combos
    const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (const ch of pool) {
      if (!used.has(ch) && !this._RESERVED.has(ch)) return ch;
    }
    for (const a of pool) {
      for (const b of pool) {
        if (!used.has(a + b)) return a + b;
      }
    }
    return 'zz';
  },

  _getUsedKeys(data) {
    const used = new Set();
    for (const ws of data.workspaces) {
      ws.bookmarks.forEach(b => used.add(b.key));
      ws.folders.forEach(f => {
        f.bookmarks.forEach(b => used.add(b.key));
      });
    }
    for (const q of Object.values(data.matrix)) {
      q.forEach(i => used.add(i.key));
    }
    return used;
  },

  async getAllKeys() {
    const data = await this.get();
    const keys = new Map();
    for (const ws of data.workspaces) {
      ws.bookmarks.forEach(b => keys.set(b.key, { type: 'bookmark', item: b }));
      ws.folders.forEach(f => {
        f.bookmarks.forEach(b => keys.set(b.key, { type: 'bookmark', item: b, folderId: f.id }));
      });
    }
    for (const [q, items] of Object.entries(data.matrix)) {
      items.forEach(i => keys.set(i.key, { type: 'matrix', item: i, quadrant: q }));
    }
    return keys;
  },

  exportData() {
    const data = this._cache || this._defaults();
    return JSON.stringify(data, null, 2);
  },

  async importData(json) {
    const imported = JSON.parse(json);
    if (!imported.workspaces || !Array.isArray(imported.workspaces)) {
      throw new Error('Invalid format: missing workspaces');
    }
    await this.save(imported);
  }
};
