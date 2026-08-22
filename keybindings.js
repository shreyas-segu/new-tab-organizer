const Keys = {
  _mode: 'normal',
  _listeners: [],
  _hint: null,
  _pendingKey: null,
  _pendingTimer: null,
  _PENDING_TIMEOUT: 500,
  // First characters of registered two-key combos. Only these are
  // buffered on first press; everything else fires immediately.
  _prefixes: new Set(),

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

  setPrefixes(prefixes) {
    this._prefixes = new Set(prefixes);
  },

  isPrefix(key) {
    return this._prefixes.has(key);
  },

  async updatePrefixes() {
    this.setPrefixes(await DB.getComboPrefixes());
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
      Palette.toggle();
      return;
    }

    if (e.ctrlKey || e.metaKey || e.altKey) return;

    if (e.key === '?') {
      e.preventDefault();
      this._toggleHelp();
      return;
    }

    // Non-character keys (Tab, Enter, arrows, etc.) — pass directly to listeners
    if (e.key.length !== 1) {
      this._dispatch(e.key, e);
      return;
    }

    // Two-key combo in progress?
    if (this._pendingKey) {
      e.preventDefault();
      clearTimeout(this._pendingTimer);
      const pending = this._pendingKey;
      this._pendingKey = null;
      this._hint.classList.remove('visible');
      const combo = pending + e.key;

      if (this._tryMatch(combo)) return;

      // Combo didn't match: fire the second key on its own, or re-buffer
      // it if it could start another combo.
      if (this._prefixes.has(e.key)) {
        this._startPending(e.key);
      } else {
        this._tryMatch(e.key);
      }
      return;
    }

    // Buffer only keys that may begin a two-key combo
    if (this._prefixes.has(e.key)) {
      e.preventDefault();
      this._startPending(e.key);
      return;
    }

    e.preventDefault();
    this._tryMatch(e.key);
  },

  _dispatch(key, event) {
    this._listeners.some(fn => fn(key, event, this._mode));
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
    const modKey = Util.modKey();
    const shortcuts = [
      { keys: ['?'], desc: 'Toggle help' },
      { keys: [modKey, 'K'], desc: 'Command palette' },
      { keys: ['n'], desc: 'New bookmark' },
      { keys: ['e'], desc: 'Edit selected' },
      { keys: ['f'], desc: 'New folder' },
      { keys: ['t'], desc: 'Daily notes' },
      { keys: ['o'], desc: 'Quick open (Jira/GitHub)' },
      { keys: ['Tab'], desc: 'Select next item' },
      { keys: ['Shift+Tab'], desc: 'Select previous item' },
      { keys: ['Enter'], desc: 'Open selected / toggle' },
      { keys: ['d'], desc: 'Delete selected' },
      { keys: ['Shift+↑↓'], desc: 'Move selected item' },
      { keys: ['Shift+←→'], desc: 'Move between folders/quadrants' },
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
      s.keys.forEach(k => {
        const kbd = document.createElement('kbd');
        kbd.textContent = k;
        row.appendChild(kbd);
      });
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
