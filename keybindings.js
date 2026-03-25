const Keys = {
  _mode: 'normal',
  _listeners: [],
  _hint: null,
  _pendingKey: null,
  _pendingTimer: null,
  _PENDING_TIMEOUT: 100,

  init() {
    document.addEventListener('keydown', (e) => this._handle(e));
    this._hint = document.createElement('div');
    this._hint.className = 'keybinding-hint';
    document.body.appendChild(this._hint);
  },

  on(fn) {
    this._listeners.push(fn);
    return () => { this._listeners = this._listeners.filter(l => l !== fn); };
  },

  _tryMatch(key) {
    return this._listeners.some(fn => fn(key, null, this._mode));
  },

  _handle(e) {
    const tag = e.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') {
      if (e.key === 'Escape') {
        e.target.blur();
        this._closeOverlays();
      }
      return;
    }

    if (e.key === 'Escape') {
      e.preventDefault();
      this._clearPending();
      this._mode = 'normal';
      this._closeOverlays();
      return;
    }

    if (e.key === 'k' && (e.ctrlKey || e.metaKey)) {
      e.preventDefault();
      App.toggleCommandPalette();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '?') {
      e.preventDefault();
      this._toggleHelp();
      return;
    }

    // Non-character keys (Tab, Enter, etc.) — pass directly to listeners
    if (e.key.length !== 1) {
      this._listeners.some(fn => fn(e.key, e, this._mode));
      return;
    }

    e.preventDefault();

    if (this._pendingKey) {
      clearTimeout(this._pendingTimer);
      const combo = this._pendingKey + e.key;
      this._pendingKey = null;
      this._hint.classList.remove('visible');

      if (this._tryMatch(combo)) return;

      // Combo didn't match, second key becomes new pending
      this._startPending(e.key);
      return;
    }

    // Always buffer first — this allows two-letter combos to take priority
    // over action keys (n, f, etc.) when a combo starting with that key exists
    this._startPending(e.key);
  },

  _startPending(key) {
    this._pendingKey = key;
    this._hint.textContent = key;
    this._hint.classList.add('visible');
    this._pendingTimer = setTimeout(() => {
      const pending = this._pendingKey;
      this._pendingKey = null;
      this._hint.classList.remove('visible');
      if (pending) this._tryMatch(pending);
    }, this._PENDING_TIMEOUT);
  },

  _clearPending() {
    clearTimeout(this._pendingTimer);
    this._pendingKey = null;
    this._hint.classList.remove('visible');
  },

  _closeOverlays() {
    document.getElementById('help-overlay').classList.add('hidden');
    document.getElementById('modal-overlay').classList.add('hidden');
    document.getElementById('command-palette').classList.add('hidden');
  },

  _toggleHelp() {
    const overlay = document.getElementById('help-overlay');
    overlay.classList.toggle('hidden');
    if (!overlay.classList.contains('hidden')) {
      this._renderHelp();
    }
  },

  async _renderHelp() {
    const container = document.getElementById('help-shortcuts');
    const keys = await DB.getAllKeys();
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const modKey = isMac ? '⌘' : 'Ctrl';
    const shortcuts = [
      { keys: ['?'], desc: 'Toggle help' },
      { keys: [modKey, 'K'], desc: 'Command palette' },
      { keys: ['n'], desc: 'New bookmark' },
      { keys: ['e'], desc: 'Edit selected' },
      { keys: ['f'], desc: 'New folder' },
      { keys: ['Tab'], desc: 'Select next item' },
      { keys: ['Shift+Tab'], desc: 'Select previous item' },
      { keys: ['Enter'], desc: 'Open selected item' },
      { keys: ['d'], desc: 'Delete selected' },
      { keys: ['Esc'], desc: 'Close overlay / cancel' },
    ];

    const bindingShortcuts = [];
    for (const [key, info] of keys) {
      const displayKeys = key.length === 2 ? [key[0], key[1]] : [key];
      bindingShortcuts.push({
        keys: displayKeys,
        desc: `${info.item.name || info.item.text}`
      });
    }

    container.innerHTML = '';
    for (const s of [...shortcuts, ...bindingShortcuts]) {
      const row = document.createElement('div');
      row.className = 'shortcut-keys';
      row.innerHTML = s.keys.map(k => `<kbd>${k}</kbd>`).join('');
      const desc = document.createElement('div');
      desc.className = 'shortcut-desc';
      desc.textContent = s.desc;
      container.appendChild(row);
      container.appendChild(desc);
    }
  },

  showHint(text) {
    this._hint.textContent = text;
    this._hint.classList.add('visible');
    clearTimeout(this._hintTimer);
    this._hintTimer = setTimeout(() => {
      this._hint.classList.remove('visible');
    }, 1500);
  }
};
