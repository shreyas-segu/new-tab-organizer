const Notes = {
  // Local date key YYYY-MM-DD (not UTC — notes belong to the day you lived)
  _dateKey(d = new Date()) {
    const p = n => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
  },

  _todayKey() {
    return this._dateKey();
  },

  _displayDate(key) {
    const [y, m, d] = key.split('-').map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: 'short', month: 'short', day: 'numeric'
    });
  },

  // Canonical section names and the heading variants accepted in notes
  // (lowercase matching is applied before lookup). 'log' kept for notes
  // created by earlier versions.
  _SECTIONS: {
    'Daily Log': ['daily log', 'log'],
    'Tasks': ['tasks'],
    'Meetings': ['meetings', 'meeting'],
    'Follow-ups': ['follow-ups', 'followups', 'follow ups'],
  },

  // Canonical format follows LogSeq's journal structure: every block is a
  // top-level list item ("- ## Section"), items are tab-indented children
  // ("\t- text"). This keeps round-trips through LogSeq lossless.
  _EMPTY_TEMPLATE: '- ## Daily Log\n- ## Tasks\n- ## Meetings\n- ## Follow-ups\n',

  _currentKey: null,
  _dirty: false,
  _saveTimer: null,
  _els: {},

  // --- LogSeq sync (File System Access API) ---
  // Directory handle lives in IndexedDB — it cannot be serialized into
  // chrome.storage. One-way push: the extension owns these files.
  _fs: { dirHandle: null, enabled: false, needsReconnect: false },

  async _initFs() {
    try {
      const handle = await this._idbGet('journalsDir');
      if (!handle) return;
      this._fs.dirHandle = handle;
      this._fs.enabled = true;
      const perm = await handle.queryPermission({ mode: 'readwrite' });
      this._fs.needsReconnect = perm !== 'granted';
      if (this._fs.needsReconnect) this._setSaveIndicator('reconnect');
    } catch { /* IndexedDB unavailable — sync stays off */ }
  },

  _idb() {
    if (this.__idbPromise) return this.__idbPromise;
    this.__idbPromise = new Promise((resolve, reject) => {
      const req = indexedDB.open('new-tab-notes', 1);
      req.onupgradeneeded = () => req.result.createObjectStore('kv');
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return this.__idbPromise;
  },

  async _idbGet(key) {
    const db = await this._idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv').objectStore('kv').get(key);
      tx.onsuccess = () => resolve(tx.result);
      tx.onerror = () => reject(tx.error);
    });
  },

  async _idbSet(key, value) {
    const db = await this._idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').put(value, key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  async _idbDel(key) {
    const db = await this._idb();
    return new Promise((resolve, reject) => {
      const tx = db.transaction('kv', 'readwrite');
      tx.objectStore('kv').delete(key);
      tx.oncomplete = () => resolve();
      tx.onerror = () => reject(tx.error);
    });
  },

  getLogseqStatus() {
    return {
      available: typeof window.showDirectoryPicker === 'function',
      connected: !!this._fs.dirHandle,
      needsReconnect: this._fs.needsReconnect,
      folderName: this._fs.dirHandle?.name || ''
    };
  },

  async connectLogseq() {
    const root = await window.showDirectoryPicker({ mode: 'readwrite' });

    // Use an existing journals/ subdir if present; treat the picked folder
    // itself as the journals dir when it already holds journal files;
    // otherwise create journals/ inside it (i.e. user picked the graph root).
    let journals;
    try {
      journals = await root.getDirectoryHandle('journals');
    } catch {
      if (await this._looksLikeJournalsDir(root)) {
        journals = root;
      } else {
        journals = await root.getDirectoryHandle('journals', { create: true });
      }
    }

    await this._idbSet('journalsDir', journals);
    this._fs.dirHandle = journals;
    this._fs.enabled = true;
    this._fs.needsReconnect = false;
    return journals.name;
  },

  async _looksLikeJournalsDir(dir) {
    let checked = 0;
    for await (const name of dir.keys()) {
      if (/^\d{4}_\d{2}_\d{2}\.md$/.test(name)) return true;
      if (++checked >= 100) break;
    }
    return false;
  },

  async disconnectLogseq() {
    await this._idbDel('journalsDir');
    this._fs = { dirHandle: null, enabled: false, needsReconnect: false };
    this._setSaveIndicator('off');
  },

  _logseqFileName(dateKey) {
    return `${dateKey.replaceAll('-', '_')}.md`;
  },

  // Pull the LogSeq journal file for the viewed day, replacing local
  // content entirely (last-action-wins). The pre-pull version is kept in
  // memory and restorable via toast for a few seconds.
  async pullFromLogseq() {
    if (!this._fs.enabled || !this._fs.dirHandle) {
      Keys.showHint('LogSeq not connected');
      return;
    }
    // Persist current edits LOCALLY only (they become the undo snapshot).
    // Must not flush(): flushing would push local content into the
    // journal file and destroy the LogSeq edits we're about to read.
    this._dirty = false;
    await DB.saveDailyNote(this._currentKey, this._els.editor.value);
    // Let an already in-flight push finish before reading the file
    if (this._pendingFlush) {
      try { await this._pendingFlush; } catch { /* ignore */ }
    }

    try {
      const perm = await this._fs.dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        this._fs.needsReconnect = true;
        Keys.showHint('LogSeq reconnect needed (Settings)');
        return;
      }

      const fh = await this._fs.dirHandle.getFileHandle(
        this._logseqFileName(this._currentKey)); // no create — must exist
      // Content is already in LogSeq's native format — take it verbatim
      const file = await fh.getFile();
      const remote = await file.text();

      const previousKey = this._currentKey;
      const previous = this._els.editor.value;

      this._els.editor.value = remote;
      this._dirty = true;
      await this.flush(); // persists pulled content + pushes identical bytes back      this._setSaveIndicator('ok', `Pulled ${this._displayDate(previousKey)} from LogSeq — Saved`);

      Toast.show(`Pulled ${this._displayDate(previousKey)} from LogSeq`, {
        actionLabel: 'Undo',
        onAction: async () => {
          if (this._currentKey !== previousKey) {
            // Navigated away while toast was up — restore via storage only
            await DB.saveDailyNote(previousKey, previous);
          } else {
            this._els.editor.value = previous;
            this._dirty = true;
            await this.flush();
          }
          Keys.showHint('Restored');
        }
      });
    } catch (e) {
      if (e?.name === 'NotFoundError') {
        Keys.showHint(`No journal file for ${this._displayDate(this._currentKey)}`);
      } else {
        Keys.showHint('Pull failed');
      }
    }
  },

  // Push a day's markdown to the graph. Returns 'ok' | 'reconnect' | 'error'.
  async _syncToLogseq(dateKey, md) {
    if (!this._fs.enabled || !this._fs.dirHandle) return 'ok';
    try {
      const perm = await this._fs.dirHandle.queryPermission({ mode: 'readwrite' });
      if (perm !== 'granted') {
        this._fs.needsReconnect = true;
        return 'reconnect';
      }
      const fh = await this._fs.dirHandle.getFileHandle(
        this._logseqFileName(dateKey), { create: true });
      const writable = await fh.createWritable();
      await writable.write(md);
      await writable.close();
      return 'ok';
    } catch {
      return 'error';
    }
  },

  init() {
    this._els = {
      date: document.getElementById('notes-date'),
      prev: document.getElementById('notes-prev'),
      next: document.getElementById('notes-next'),
      todayBtn: document.getElementById('notes-today'),
      standupBtn: document.getElementById('notes-standup'),
      syncBtn: document.getElementById('notes-sync'),
      syncDot: document.getElementById('notes-sync-dot'),
      carryover: document.getElementById('notes-carryover'),
      capture: document.getElementById('notes-capture'),
      editor: document.getElementById('notes-editor'),
    };

    this._els.prev.addEventListener('click', () => this.shiftDay(-1));
    this._els.next.addEventListener('click', () => this.shiftDay(1));
    this._els.todayBtn.addEventListener('click', () => this.show(this._todayKey()));
    this._els.standupBtn.addEventListener('click', () => this.showStandup());
    this._els.syncBtn.addEventListener('click', () => this.pullFromLogseq());
    // Red dot = intervention needed; clicking opens settings
    this._els.syncDot.addEventListener('click', () => {
      if (this._els.syncDot.classList.contains('error')) App.showSettings();
    });

    this._els.editor.addEventListener('input', () => {
      this._dirty = true;
      clearTimeout(this._saveTimer);
      this._saveTimer = setTimeout(() => this.flush(), 600);
    });
    this._els.editor.addEventListener('blur', () => this.flush());

    this._els.capture.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        if (this._els.capture.value.trim()) this._quickCapture();
        return;
      }
    });

    window.addEventListener('beforeunload', () => this.flush());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.flush();
    });

    this._initFs();
    this.show(this._todayKey());
  },

  async show(dateKey) {
    await this.flush(); // never lose edits when switching days
    this._currentKey = dateKey;
    const md = await DB.getDailyNote(dateKey);
    this._els.date.textContent = this._displayDate(dateKey);
    this._els.todayBtn.classList.toggle('hidden', dateKey === this._todayKey());
    // Empty day -> show the section skeleton (only persisted once edited)
    this._els.editor.value = md || this._EMPTY_TEMPLATE;
    this._dirty = false;
    this._updateCarryOver();
  },

  shiftDay(dir) {
    const [y, m, d] = this._currentKey.split('-').map(Number);
    const next = new Date(y, m - 1, d + dir);
    this.show(this._dateKey(next));
  },

  // Header dot: flashes green on save, persistent pulsing red when
  // intervention is needed. Tooltip carries the details.
  _setSaveIndicator(syncResult, label = null) {
    const el = this._els.syncDot;
    if (!el) return;
    clearTimeout(this._dotTimer);
    if (syncResult === 'off') {
      el.classList.add('hidden');
      el.classList.remove('error', 'flash');
      return;
    }
    el.classList.remove('hidden');
    if (syncResult === 'reconnect' || syncResult === 'error') {
      el.classList.remove('flash');
      el.classList.add('error');
      el.title = syncResult === 'reconnect'
        ? 'LogSeq reconnect needed — click to open Settings'
        : 'LogSeq sync failed — will retry on next edit';
      return;
    }
    // Green flash; tooltip describes what was saved
    el.classList.remove('error');
    el.title = label || (syncResult === 'ok'
      ? 'Saved — synced to LogSeq'
      : 'Saved');
    el.classList.remove('flash');
    void el.offsetWidth;
    el.classList.add('flash');
  },

  async flush() {
    clearTimeout(this._saveTimer);
    if (!this._dirty || !this._currentKey) return;
    this._dirty = false;
    const run = async () => {
      const key = this._currentKey;
      const md = this._els.editor.value;
      await DB.saveDailyNote(key, md);

      let syncResult = null; // null = sync off
      if (this._fs.enabled) {
        syncResult = await this._syncToLogseq(key, md);
      }
      this._setSaveIndicator(syncResult);
    };
    // Track the in-flight flush so pullFromLogseq can wait it out
    const p = run().finally(() => {
      if (this._pendingFlush === p) this._pendingFlush = null;
    });
    this._pendingFlush = p;
    await p;
  },

  // Find a section heading in markdown. Returns the match or null.
  // Matches LogSeq's "- ## Section" form and legacy plain "## Section".
  // Also tolerates LogSeq gluing the first child onto the heading line:
  // "## Daily Log\t- OPIAM-123"
  _findSection(md, sectionTitle) {
    for (const alias of this._SECTIONS[sectionTitle] || [sectionTitle.toLowerCase()]) {
      const m = new RegExp(
        `^(?:-\\s*)?##\\s+${alias}(?:\\t[^\\n]*)?$`, 'im').exec(md);
      if (m) return m;
    }
    return null;
  },

  // Bullet lines directly below a section heading (until the next heading).
  // Handles tab-indented LogSeq children; returns trimmed "- item" lines.
  _sectionBullets(md, sectionTitle) {
    const m = this._findSection(md, sectionTitle);
    if (!m) return [];
    const rest = md.slice(m.index + m[0].length);
    const nextHeading = rest.search(/^(?:-\s*)?#{1,6}\s/m);
    const body = nextHeading === -1 ? rest : rest.slice(0, nextHeading);
    return body
      .split('\n')
      .map(l => l.replace(/^\t+/, '').trim())
      .filter(l => l.startsWith('- '));
  },

  async _updateCarryOver() {
    const co = await DB.getCarryOver(this._currentKey);
    const el = this._els.carryover;
    if (!co || this._currentKey !== this._todayKey()) {
      el.classList.add('hidden');
      el.innerHTML = '';
      return;
    }
    el.classList.remove('hidden');
    el.innerHTML = `
      <span>${co.items.length} open follow-up${co.items.length > 1 ? 's' : ''} from ${this._displayDate(co.from)}</span>
      <button id="carryover-insert">Insert</button>
      <button id="carryover-dismiss" class="dismiss">Dismiss</button>
    `;
    document.getElementById('carryover-insert').addEventListener('click', () => this._insertCarryOver(co));
    document.getElementById('carryover-dismiss').addEventListener('click', () => {
      el.classList.add('hidden');
    });
  },

  async _insertCarryOver(co) {
    let md = this._els.editor.value || this._EMPTY_TEMPLATE;
    // Items are stored flattened ("- x") — indent as LogSeq children
    const block = co.items.map(l => '\t' + l).join('\n');
    const m = this._findSection(md, 'Follow-ups');
    if (m) {
      const pos = m.index + m[0].length;
      md = md.slice(0, pos) + '\n' + block + md.slice(pos);
    } else {
      md = md.replace(/\n*$/, '') + `\n- ## Follow-ups\n${block}\n`;
    }
    this._els.editor.value = md;
    this._dirty = true;
    await this.flush();
    Keys.showHint(`Carried ${co.items.length} follow-up${co.items.length > 1 ? 's' : ''}`);
    this._els.carryover.classList.add('hidden');
  },

  // --- Standup summary + Jira key extraction ---

  _JIRA_RE: /\b[A-Z][A-Z0-9]*-\d+\b/g,

  _extractJiraKeys(md) {
    const counts = new Map();
    for (const match of md.matchAll(this._JIRA_RE)) {
      counts.set(match[0], (counts.get(match[0]) || 0) + 1);
    }
    return [...counts.entries()].map(([key, count]) => ({ key, count }));
  },

  // Plain-text standup from the day's sections. Empty sections are skipped.
  _buildStandup(md) {
    const part = (title, section) => {
      const items = this._sectionBullets(md, section);
      if (items.length === 0) return null;
      return `${title}\n${items.join('\n')}`;
    };
    return [
      part('What I did:', 'Daily Log'),
      part('Tasks worked on:', 'Tasks'),
      part('Meetings:', 'Meetings'),
      part('Follow-ups:', 'Follow-ups'),
    ].filter(Boolean).join('\n\n');
  },

  // Standup covers the previous work day, not the currently viewed one.
  async showStandup() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');

    const prevKey = await DB.getPreviousNoteDate(this._currentKey);
    const md = prevKey ? await DB.getDailyNote(prevKey) : '';
    const summary = this._buildStandup(md);
    const keys = this._extractJiraKeys(md);

    overlay.classList.remove('hidden');

    if (!prevKey || (!summary && keys.length === 0)) {
      modal.innerHTML = `
        <h3>Standup</h3>
        <p class="qo-hint">Nothing logged on previous days yet.</p>
        <div class="modal-actions">
          <button id="standup-close">Close</button>
        </div>
      `;
    } else {
      const chipsHtml = keys.length > 0 ? `
        <div class="settings-label" style="margin-top:12px">Jira issues touched
          <span class="settings-hint-inline">(click to copy)</span>
        </div>
        <div id="standup-keys">
          ${keys.map(({ key, count }) => `
            <button type="button" class="jira-chip" data-key="${Util.escape(key)}">
              ${Util.escape(key)}${count > 1 ? ` <span class="chip-count">×${count}</span>` : ''}
            </button>`).join('')}
        </div>` : '';

      modal.innerHTML = `
        <h3>Standup — ${Util.escape(this._displayDate(prevKey))}</h3>
        <pre id="standup-summary"></pre>
        ${chipsHtml}
        <div class="modal-actions">
          <button id="standup-copy" class="primary">Copy</button>
          <button id="standup-close">Close</button>
        </div>
      `;
      document.getElementById('standup-summary').textContent = summary;

      modal.querySelectorAll('.jira-chip').forEach(chip => {
        chip.addEventListener('click', async () => {
          try {
            await navigator.clipboard.writeText(chip.dataset.key);
            Keys.showHint(`Copied ${chip.dataset.key}`);
          } catch {
            Keys.showHint('Copy failed');
          }
        });
      });

      document.getElementById('standup-copy').addEventListener('click', async () => {
        try {
          await navigator.clipboard.writeText(summary);
          Keys.showHint('Standup copied');
        } catch {
          Keys.showHint('Copy failed');
        }
      });
    }

    document.getElementById('standup-close').addEventListener('click', () =>
      overlay.classList.add('hidden'));
  },

  // Quick capture routes a line to its section as a plain bullet:
  //   anything -> Daily Log
  //   x text   -> Tasks
  //   @ text   -> Meetings (timestamped bullet)
  //   + text   -> Follow-ups
  _quickCapture() {
    const raw = this._els.capture.value.trim();
    this._els.capture.value = '';

    let section = 'Daily Log';
    let text = raw;
    if (raw.startsWith('+')) {
      section = 'Follow-ups';
      text = raw.slice(1).trim();
    } else if (raw.startsWith('@')) {
      section = 'Meetings';
      text = raw.slice(1).trim();
    } else if (/^x\s/i.test(raw)) {
      section = 'Tasks';
      text = raw.slice(1).trim();
    }

    let line = `- ${text}`;
    if (section === 'Meetings') {
      const now = new Date();
      const p = n => String(n).padStart(2, '0');
      line = `- ${p(now.getHours())}:${p(now.getMinutes())} ${text}`;
    }

    let md = this._els.editor.value || this._EMPTY_TEMPLATE;
    const m = this._findSection(md, section);
    if (m) {
      // New bullet becomes a tab-indented child of the section item
      const pos = m.index + m[0].length;
      md = md.slice(0, pos) + '\n\t' + line + md.slice(pos);
    } else {
      md = md.replace(/\n*$/, '') + `\n- ## ${section}\n\t${line}\n`;
    }

    this._els.editor.value = md;
    this._dirty = true;
    this.flush();
    Keys.showHint(`Noted → ${section}`);
  }
};
