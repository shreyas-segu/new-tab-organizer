const DB = {
  _cache: null,
  _VERSION: 1,

  async get() {
    if (this._cache) return this._cache;
    const stored = await chrome.storage.local.get('app');
    this._cache = this._migrate(stored.app || this._defaults());
    return this._cache;
  },

  async save(data) {
    this._cache = data;
    await chrome.storage.local.set({ app: data });
  },

  _defaults() {
    return {
      version: this._VERSION,
      workspaces: [
        { id: Util.id(), name: 'Default', key: '1', folders: [], bookmarks: [] }
      ],
      activeWorkspace: 0,
      matrix: { q1: [], q2: [], q3: [], q4: [] },
      theme: 'system',
      customCSS: '',
      openInNewTab: false,
      enabledTools: { matrix: true, jwt: true, gen: true, urlcodec: true },
      quickOpenRules: [
        { id: 'qo-jira', name: 'Jira Issue', pattern: '^[a-z][a-z0-9]*-\\d+$', template: 'https://your-company.atlassian.net/browse/{query}' },
        { id: 'qo-github', name: 'GitHub Repo', pattern: '^[\\w.-]+/[\\w.-]+$', template: 'https://github.com/{query}' }
      ],
      dailyNotes: {}
    };
  },

  // Fill in missing fields and bump schema version so older exports
  // and pre-migration local storage keep working.
  _migrate(data) {
    const d = data || {};
    if (!Array.isArray(d.workspaces) || d.workspaces.length === 0) {
      return this._defaults();
    }
    if (!d.matrix || typeof d.matrix !== 'object') d.matrix = {};
    for (const q of ['q1', 'q2', 'q3', 'q4']) {
      if (!Array.isArray(d.matrix[q])) d.matrix[q] = [];
    }
    if (!Number.isInteger(d.activeWorkspace) || d.activeWorkspace < 0 ||
        d.activeWorkspace >= d.workspaces.length) {
      d.activeWorkspace = 0;
    }
    if (typeof d.theme !== 'string') d.theme = 'system';
    if (typeof d.customCSS !== 'string') d.customCSS = '';
    if (typeof d.openInNewTab !== 'boolean') d.openInNewTab = false;
    if (!d.enabledTools || typeof d.enabledTools !== 'object') {
      d.enabledTools = {};
    }
    // Unknown tools default to enabled
    for (const t of ['matrix', 'notes', 'jwt', 'gen', 'urlcodec']) {
      if (typeof d.enabledTools[t] !== 'boolean') d.enabledTools[t] = true;
    }
    if (!Array.isArray(d.quickOpenRules)) {
      d.quickOpenRules = this._defaults().quickOpenRules;
    }
    if (!d.dailyNotes || typeof d.dailyNotes !== 'object') {
      d.dailyNotes = {};
    }
    for (const ws of d.workspaces) {
      if (!Array.isArray(ws.folders)) ws.folders = [];
      if (!Array.isArray(ws.bookmarks)) ws.bookmarks = [];
      for (const f of ws.folders) {
        if (!Array.isArray(f.bookmarks)) f.bookmarks = [];
      }
    }
    d.version = this._VERSION;
    return d;
  },

  async getWorkspace() {
    const data = await this.get();
    return data.workspaces[data.activeWorkspace];
  },

  // Bookmark list for a folder id; ws.bookmarks for root (null).
  // Returns null when the folder does not exist.
  _listFor(ws, folderId) {
    if (!folderId) return ws.bookmarks;
    const folder = ws.folders.find(f => f.id === folderId);
    return folder ? folder.bookmarks : null;
  },

  async addBookmark({ name, url, folderId = null, keybinding = null }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const key = keybinding || this.suggestKey(name, data);
    const bookmark = { id: Util.id(), name, url, key, folderId, createdAt: Date.now() };
    const list = this._listFor(ws, folderId);
    if (list) {
      bookmark.folderId = folderId;
      list.push(bookmark);
    } else {
      bookmark.folderId = null;
      ws.bookmarks.push(bookmark);
    }
    await this.save(data);
    return bookmark;
  },

  async addFolder({ name }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const folder = { id: Util.id(), name, bookmarks: [], createdAt: Date.now() };
    ws.folders.push(folder);
    await this.save(data);
    return folder;
  },

  // Returns an undo entry: { item, index, folderId }
  async deleteBookmark(id, folderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const list = this._listFor(ws, folderId);
    if (!list) return null;
    const index = list.findIndex(b => b.id === id);
    if (index === -1) return null;
    const [item] = list.splice(index, 1);
    await this.save(data);
    return { item, index, folderId: item.folderId ?? folderId ?? null };
  },

  async restoreBookmark({ item, index, folderId }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    let list = this._listFor(ws, folderId);
    if (!list) { folderId = null; list = ws.bookmarks; }
    list.splice(Math.min(index, list.length), 0, item);
    await this.save(data);
  },

  // Returns an undo entry: { folder, index }
  async deleteFolder(id) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const index = ws.folders.findIndex(f => f.id === id);
    if (index === -1) return null;
    const [folder] = ws.folders.splice(index, 1);
    await this.save(data);
    return { folder, index };
  },

  async restoreFolder({ folder, index }) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    if (!ws.folders.some(f => f.id === folder.id)) {
      ws.folders.splice(Math.min(index, ws.folders.length), 0, folder);
    }
    await this.save(data);
  },

  async renameItem(id, newName, type, folderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    if (type === 'folder') {
      const folder = ws.folders.find(f => f.id === id);
      if (folder) folder.name = newName;
    } else {
      const list = this._listFor(ws, folderId);
      const item = list?.find(b => b.id === id);
      if (item) item.name = newName;
    }
    await this.save(data);
  },

  async editBookmark(id, { name, url, key, folderId }, oldFolderId = null) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];

    const sourceList = this._listFor(ws, oldFolderId);
    const bookmark = sourceList?.find(b => b.id === id);
    if (!bookmark) return;

    bookmark.name = name;
    bookmark.url = url;
    bookmark.key = key;

    if ((folderId || null) !== (oldFolderId || null)) {
      sourceList.splice(sourceList.indexOf(bookmark), 1);
      const targetList = this._listFor(ws, folderId);
      if (targetList) {
        bookmark.folderId = folderId;
        targetList.push(bookmark);
      } else {
        bookmark.folderId = null;
        ws.bookmarks.push(bookmark);
      }
    }

    await this.save(data);
  },

  // --- Reordering / moving ---

  // Move a bookmark to a given position. toFolderId may differ from the
  // current folder (moves between containers). toIndex clamps to bounds.
  async moveBookmark(id, fromFolderId, toFolderId, toIndex) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const sourceList = this._listFor(ws, fromFolderId);
    const idx = sourceList?.findIndex(b => b.id === id);
    if (idx === undefined || idx === -1) return;
    const [bookmark] = sourceList.splice(idx, 1);

    let targetList = this._listFor(ws, toFolderId);
    if (!targetList) { toFolderId = null; targetList = ws.bookmarks; }
    bookmark.folderId = toFolderId;
    targetList.splice(Math.max(0, Math.min(toIndex, targetList.length)), 0, bookmark);
    await this.save(data);
  },

  // Shift a bookmark up/down within its own container.
  // dir: -1 up, +1 down. Returns false if already at boundary.
  async reorderBookmark(id, folderId, dir) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const list = this._listFor(ws, folderId);
    if (!list) return false;
    const idx = list.findIndex(b => b.id === id);
    if (idx === -1) return false;
    const to = idx + dir;
    if (to < 0 || to >= list.length) return false;
    [list[idx], list[to]] = [list[to], list[idx]];
    await this.save(data);
    return true;
  },

  // Move a folder to a given position among folders.
  async moveFolder(id, toIndex) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const from = ws.folders.findIndex(f => f.id === id);
    if (from === -1) return;
    const [folder] = ws.folders.splice(from, 1);
    ws.folders.splice(Math.max(0, Math.min(toIndex, ws.folders.length)), 0, folder);
    await this.save(data);
  },

  async reorderFolder(id, dir) {
    const data = await this.get();
    const ws = data.workspaces[data.activeWorkspace];
    const from = ws.folders.findIndex(f => f.id === id);
    if (from === -1) return false;
    const to = from + dir;
    if (to < 0 || to >= ws.folders.length) return false;
    [ws.folders[from], ws.folders[to]] = [ws.folders[to], ws.folders[from]];
    await this.save(data);
    return true;
  },

  // Ordered container ids for cross-container navigation:
  // folders in display order, then root (null).
  _containerOrder(ws) {
    return [...ws.folders.map(f => f.id), null];
  },

  // --- Workspaces ---

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
        if (!usedKeys.has(ch) && !Util.RESERVED_KEYS.has(ch)) { key = ch; break; }
      }
    }
    const ws = { id: Util.id(), name, key, folders: [], bookmarks: [] };
    data.workspaces.push(ws);
    await this.save(data);
    return ws;
  },

  async switchWorkspace(index) {
    const data = await this.get();
    data.activeWorkspace = index;
    await this.save(data);
  },

  // Returns an undo entry: { workspace, index, wasActive }
  async deleteWorkspace(index) {
    const data = await this.get();
    if (data.workspaces.length <= 1) return null;
    const wasActive = data.activeWorkspace >= index;
    const [workspace] = data.workspaces.splice(index, 1);
    if (wasActive) {
      data.activeWorkspace = Math.max(0,
        Math.min(index, data.workspaces.length - 1));
    }
    await this.save(data);
    return { workspace, index, wasActive };
  },

  async restoreWorkspace({ workspace, index, wasActive }) {
    const data = await this.get();
    data.workspaces.splice(Math.min(index, data.workspaces.length), 0, workspace);
    if (wasActive) data.activeWorkspace = Math.min(index, data.workspaces.length - 1);
    await this.save(data);
  },

  async renameWorkspace(index, newName) {
    const data = await this.get();
    data.workspaces[index].name = newName;
    await this.save(data);
  },

  // --- Eisenhower matrix ---

  async addMatrixItem(quadrant, text, dueDate = null) {
    const data = await this.get();
    const key = this.suggestKey(text, data);
    const item = { id: Util.id(), text, key, done: false, dueDate, createdAt: Date.now() };
    data.matrix[quadrant].push(item);
    await this.save(data);
    return item;
  },

  // Returns an undo entry: { item, quadrant, index }
  async deleteMatrixItem(quadrant, id) {
    const data = await this.get();
    const items = data.matrix[quadrant];
    const index = items.findIndex(i => i.id === id);
    if (index === -1) return null;
    const [item] = items.splice(index, 1);
    await this.save(data);
    return { item, quadrant, index };
  },

  async restoreMatrixItem({ item, quadrant, index }) {
    const data = await this.get();
    data.matrix[quadrant].splice(Math.min(index, data.matrix[quadrant].length), 0, item);
    await this.save(data);
  },

  async toggleMatrixItem(quadrant, id) {
    const data = await this.get();
    const item = data.matrix[quadrant].find(i => i.id === id);
    if (item) item.done = !item.done;
    await this.save(data);
  },

  // Move a matrix item, optionally into another quadrant, at an optional
  // position. When fromQ === toQ, toIndex is the position in the resulting
  // list; across quadrants it is a plain index into the target quadrant.
  async moveMatrixItem(id, fromQ, toQ, toIndex = null) {
    const data = await this.get();
    const src = data.matrix[fromQ];
    const dst = data.matrix[toQ];
    if (!src || !dst) return;
    const idx = src.findIndex(i => i.id === id);
    if (idx === -1) return;
    const [item] = src.splice(idx, 1);
    if (toIndex !== null && !(fromQ !== toQ && toIndex >= dst.length)) {
      const insertAt = Math.max(0, Math.min(toIndex, dst.length));
      dst.splice(insertAt, 0, item);
    } else {
      dst.push(item);
    }
    await this.save(data);
  },

  // Shift a matrix item up/down within its quadrant. dir: -1/+1.
  async reorderMatrixItem(quadrant, id, dir) {
    const data = await this.get();
    const items = data.matrix[quadrant];
    const idx = items.findIndex(i => i.id === id);
    if (idx === -1) return false;
    const to = idx + dir;
    if (to < 0 || to >= items.length) return false;
    [items[idx], items[to]] = [items[to], items[idx]];
    await this.save(data);
    return true;
  },

  // --- Quick open rules ---

  // Returns { ok } or { ok:false, error }. Pattern must be a valid regex
  // with no capture-group pitfalls; template must contain {query}.
  validateQuickOpenRule({ pattern, template }) {
    if (!pattern || !template) return { ok: false, error: 'Pattern and URL are required' };
    try {
      const re = new RegExp(pattern, 'i');
      if (re.test('')) return { ok: false, error: 'Pattern matches empty input' };
    } catch {
      return { ok: false, error: 'Invalid regular expression' };
    }
    if (!template.includes('{query}')) {
      return { ok: false, error: 'URL must contain {query}' };
    }
    try {
      new URL(template.replace('{query}', 'test123'));
    } catch {
      return { ok: false, error: 'Invalid URL template' };
    }
    return { ok: true };
  },

  async saveQuickOpenRules(rules) {
    for (const rule of rules) {
      const check = this.validateQuickOpenRule(rule);
      if (!check.ok) throw new Error(`"${rule.name || rule.pattern}": ${check.error}`);
    }
    const data = await this.get();
    data.quickOpenRules = rules;
    await this.save(data);
  },

  matchQuickOpenRules(query) {
    const rules = this._cache?.quickOpenRules || [];
    const q = query.trim();
    if (!q) return [];
    return rules
      .filter(r => {
        try { return new RegExp(r.pattern, 'i').test(q); } catch { return false; }
      })
      .map(r => ({
        ruleId: r.id,
        name: r.name,
        url: r.template.replace('{query}', encodeURIComponent(q))
      }));
  },

  // --- Daily notes (markdown is the source of truth) ---

  async getDailyNote(dateKey) {
    const data = await this.get();
    return data.dailyNotes[dateKey]?.md || '';
  },

  // Most recent date with a saved note strictly before the given one.
  async getPreviousNoteDate(beforeDateKey) {
    const data = await this.get();
    const dates = Object.keys(data.dailyNotes)
      .filter(d => d < beforeDateKey)
      .sort();
    return dates.length ? dates[dates.length - 1] : null;
  },

  async saveDailyNote(dateKey, md) {
    const data = await this.get();
    const existing = data.dailyNotes[dateKey];
    if (!md.trim()) {
      // An emptied note removes itself
      if (existing) delete data.dailyNotes[dateKey];
    } else {
      data.dailyNotes[dateKey] = { md, updatedAt: Date.now() };
    }
    await this.save(data);
  },

  // Follow-up bullets from the most recent previous day that has any.
  // Returns { from, items } or null. Handles both plain "## Follow-ups"
  // and LogSeq's "- ## Follow-ups" with tab-indented children. Legacy
  // `- LATER`/`- DONE` markers are normalized to plain bullets.
  async getCarryOver(beforeDateKey) {
    const data = await this.get();
    const dates = Object.keys(data.dailyNotes)
      .filter(d => d < beforeDateKey)
      .sort();
    for (let i = dates.length - 1; i >= Math.max(0, dates.length - 7); i--) {
      const md = data.dailyNotes[dates[i]]?.md || '';
      const items = this._sectionBullets(md, ['follow-ups', 'followups', 'follow ups'])
        .map(l => l.replace(/^-\s+(LATER|DONE)\s+/i, '- '));
      if (items.length > 0) {
        return { from: dates[i], items };
      }
    }
    return null;
  },

  _sectionBullets(md, aliases) {
    for (const alias of aliases) {
      const m = new RegExp(
        `^(?:-\\s*)?##\\s+${alias}(?:\\t[^\\n]*)?$`, 'im').exec(md);
      if (!m) continue;
      const rest = md.slice(m.index + m[0].length);
      const nextHeading = rest.search(/^(?:-\s*)?#{1,6}\s/m);
      const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
      return body
        .split('\n')
        .map(l => l.replace(/^\t+/, '').trim())
        .filter(l => l.startsWith('- '));
    }
    return [];
  },

  // --- Keybindings ---

  suggestKey(name, data) {
    const used = this._getUsedKeys(data);
    const lower = name.toLowerCase();
    const words = lower.split(/[\s\-_]+/).filter(Boolean);
    const firstLetters = words.map(w => w[0]);
    const firstTwo = lower.replace(/[^a-z0-9]/g, '').slice(0, 2);

    // Single-letter: first letter of each word
    for (const ch of firstLetters) {
      if (this.isKeyAvailable(ch, used)) return ch;
    }

    // Two-letter: first two chars of name
    if (firstTwo.length >= 2 && this.isKeyAvailable(firstTwo, used)) {
      return firstTwo;
    }

    // Two-letter: initials (first+second word)
    if (firstLetters.length >= 2) {
      const combo = firstLetters[0] + firstLetters[1];
      if (this.isKeyAvailable(combo, used)) return combo;
    }

    // Fallback: single letters a-z then two-letter combos
    const pool = 'abcdefghijklmnopqrstuvwxyz0123456789';
    for (const ch of pool) {
      if (this.isKeyAvailable(ch, used)) return ch;
    }
    for (const a of pool) {
      for (const b of pool) {
        if (this.isKeyAvailable(a + b, used)) return a + b;
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

  // Check whether a user-chosen keybinding can be assigned.
  // Returns { ok: true } or { ok: false, error }.
  validateKey(key, usedKeys = null) {
    if (!key) return { ok: true };
    if (key.length > 2) return { ok: false, error: 'Max 2 characters' };
    if (!/^[a-z0-9]$|^[a-z][a-z0-9]$/.test(key)) {
      return { ok: false, error: 'Use lowercase letters/digits only' };
    }
    if (key.length === 1 && Util.RESERVED_KEYS.has(key)) {
      return { ok: false, error: `"${key}" is reserved for a built-in action` };
    }
    const used = usedKeys || this._getUsedKeys(this._cache);
    if (used.has(key)) {
      return { ok: false, error: `Key "${key}" is already in use` };
    }
    return { ok: true };
  },

  isKeyAvailable(key, used = null) {
    return this.validateKey(key, used).ok;
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

  // First characters that begin registered two-key combos. While one of
  // these is pending, the key system buffers instead of firing immediately.
  async getComboPrefixes() {
    const keys = await this.getAllKeys();
    const prefixes = new Set();
    for (const key of keys.keys()) {
      if (key.length === 2) prefixes.add(key[0]);
    }
    return prefixes;
  },

  // --- Import / export ---

  async exportData() {
    const data = await this.get();
    return JSON.stringify(data, null, 2);
  },

  async importData(json) {
    let imported;
    try {
      imported = JSON.parse(json);
    } catch {
      throw new Error('Invalid JSON');
    }
    if (!imported || !Array.isArray(imported.workspaces) || imported.workspaces.length === 0) {
      throw new Error('Invalid format: missing workspaces');
    }
    const migrated = this._migrate(imported);
    await this.save(migrated);
  }
};

// Shared id generator lives on Util so every module can use it.
Util.id = function () {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
};
