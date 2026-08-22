const App = {
  _mediaQuery: null,
  _activeTool: 'matrix',
  _TOOL_DEFS: [
    { id: 'matrix', label: 'Matrix' },
    { id: 'notes', label: 'Notes' },
    { id: 'jwt', label: 'JWT' },
    { id: 'gen', label: 'Generator' },
    { id: 'urlcodec', label: 'URL Encode' },
  ],
  _TOOL_KEYS: { m: 'matrix', t: 'notes', j: 'jwt', g: 'gen', u: 'urlcodec' },

  async init() {
    Keys.init();
    Toast.init();
    await this._initTheme();
    await this.refresh();
    Eisenhower.initHandlers();
    JWT.init();
    Generator.init();
    UrlCodec.init();
    Palette.init();
    Notes.init();
    this._bindToolsTabs();
    this._restoreActiveTool();
    this._applyEnabledTools();
    this._bindKeys();
    this._updatePlatformHints();
  },

  async refresh() {
    await this._renderWorkspaces();
    await Bookmarks.render();
    await Eisenhower.render();
    await Keys.updatePrefixes();
  },

  // Central place to switch workspaces so every caller stays in sync
  async switchWorkspace(index) {
    await DB.switchWorkspace(index);
    Bookmarks._selectedId = null;
    Eisenhower._selectedId = null;
    await this.refresh();
  },

  _updatePlatformHints() {
    const kbd = document.getElementById('kbd-cmd');
    if (kbd) kbd.textContent = Util.isMac() ? '\u2318K' : 'Ctrl+K';
  },

  // --- Theme ---
  async _initTheme() {
    const data = await DB.get();
    this._applyTheme(data.theme || 'system');
    this._applyCustomCSS(data.customCSS || '');

    this._mediaQuery = window.matchMedia('(prefers-color-scheme: light)');
    this._mediaQuery.addEventListener('change', () => {
      const d = DB._cache;
      if (d && d.theme === 'system') this._applyTheme('system');
    });

    document.getElementById('settings-btn').addEventListener('click', () => this.showSettings());
  },

  setTheme(theme) { return this._setTheme(theme); },

  _applyTheme(theme) {
    if (theme === 'system') {
      const isLight = this._mediaQuery?.matches ?? window.matchMedia('(prefers-color-scheme: light)').matches;
      document.documentElement.setAttribute('data-theme', isLight ? 'light' : 'dark');
    } else {
      document.documentElement.setAttribute('data-theme', theme);
    }
  },

  _applyCustomCSS(css) {
    document.getElementById('custom-css').textContent = css;
  },

  async _setTheme(theme) {
    const data = await DB.get();
    data.theme = theme;
    await DB.save(data);
    this._applyTheme(theme);
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  showSettings() { return this._showSettings(); },

  _showSettings() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const data = DB._cache;
    const theme = data?.theme || 'system';
    const css = data?.customCSS || '';
    const openInNewTab = data?.openInNewTab || false;
    const enabledTools = data?.enabledTools || {};

    modal.innerHTML = `
      <h3>Settings</h3>
      <div class="settings-section">
        <div class="settings-label">Theme</div>
        <div class="theme-options">
          <button class="theme-option${theme === 'light' ? ' active' : ''}" data-theme="light">Light</button>
          <button class="theme-option${theme === 'dark' ? ' active' : ''}" data-theme="dark">Dark</button>
          <button class="theme-option${theme === 'system' ? ' active' : ''}" data-theme="system">System</button>
        </div>
      </div>
      <div class="settings-section">
        <div class="settings-label">Bookmarks</div>
        <label class="settings-toggle">
          <input type="checkbox" id="settings-newtab"${openInNewTab ? ' checked' : ''}>
          <span>Open bookmarks in new tab</span>
        </label>
      </div>
      <div class="settings-section">
        <div class="settings-label">Tools</div>
        ${this._TOOL_DEFS.map(t => `
          <label class="settings-toggle">
            <input type="checkbox" class="tool-toggle" data-tool="${t.id}"${enabledTools[t.id] !== false ? ' checked' : ''}>
            <span>${Util.escape(t.label)}</span>
          </label>`).join('')}
      </div>
      <div class="settings-section">
        <div class="settings-label">Custom CSS</div>
        <textarea id="settings-css" placeholder=":root { --accent: #ff6600; }">${Util.escape(css)}</textarea>
      </div>
      <div class="settings-section">
        <div class="settings-label">Quick Open <span class="settings-hint-inline">(press <kbd>o</kbd>)</span></div>
        <div id="qo-rules"></div>
        <button type="button" id="qo-add-rule" class="settings-add-btn">+ Add rule</button>
        <p class="settings-hint">Pattern is a regex tested against what you type (use .+ as catch-all); URL must contain {query}. Examples: PROJ-123 &rarr; Jira, owner/repo &rarr; GitHub.</p>
      </div>
      <div class="settings-section">
        <div class="settings-label">LogSeq Sync</div>
        <div id="logseq-io"></div>
        <p class="settings-hint">Writes each day's notes to <code>journals/YYYY_MM_DD.md</code> inside the folder you pick. One-way: notes → LogSeq. LogSeq picks up changes automatically.</p>
      </div>
      <div id="settings-error" class="modal-error hidden"></div>
      <div class="settings-section">
        <div class="settings-label">Data</div>
        <div class="settings-io">
          <button id="settings-export">Export</button>
          <button id="settings-import">Import</button>
          <input type="file" id="settings-import-file" accept=".json" style="display:none">
        </div>
      </div>
      <div class="modal-actions">
        <button id="settings-cancel">Cancel</button>
        <button id="settings-save" class="primary">Save</button>
      </div>
    `;

    modal.querySelectorAll('.theme-option').forEach(btn => {
      btn.addEventListener('click', () => this._setTheme(btn.dataset.theme));
    });

    const cssInput = document.getElementById('settings-css');
    const newTabInput = document.getElementById('settings-newtab');
    const close = () => overlay.classList.add('hidden');

    // --- Quick Open rule editor ---
    const qoContainer = document.getElementById('qo-rules');
    const ruleRow = (r = {}) => `
      <div class="qo-rule" data-id="${Util.escape(r.id || '')}">
        <input type="text" class="qo-rule-name" placeholder="Name" value="${Util.escape(r.name || '')}">
        <input type="text" class="qo-rule-pattern" placeholder="Pattern (regex)" value="${Util.escape(r.pattern || '')}">
        <input type="text" class="qo-rule-template" placeholder="https://.../{query}" value="${Util.escape(r.template || '')}">
        <button type="button" class="qo-rule-delete" title="Delete">✕</button>
      </div>
    `;
    (data?.quickOpenRules || []).forEach(r => {
      qoContainer.insertAdjacentHTML('beforeend', ruleRow(r));
    });

    document.getElementById('qo-add-rule').addEventListener('click', () => {
      qoContainer.insertAdjacentHTML('beforeend', ruleRow());
      const rows = qoContainer.querySelectorAll('.qo-rule');
      rows[rows.length - 1].querySelector('.qo-rule-name').focus();
    });

    qoContainer.addEventListener('click', (e) => {
      const del = e.target.closest('.qo-rule-delete');
      if (del) del.closest('.qo-rule').remove();
    });

    // --- LogSeq sync ---
    const logseqIo = document.getElementById('logseq-io');
    const renderLogseqIo = () => {
      const ls = Notes.getLogseqStatus();
      if (!ls.available) {
        logseqIo.innerHTML = '<span class="settings-hint-inline">Not supported in this browser</span>';
        return;
      }
      if (ls.connected) {
        const state = ls.needsReconnect
          ? '<span class="ls-warn">Needs reconnect</span>'
          : `<span class="ls-ok">Connected</span>`;
        logseqIo.innerHTML = `
          <span class="ls-folder">${state} — ${Util.escape(ls.folderName)}</span>
          ${ls.needsReconnect ? '<button id="logseq-connect">Reconnect</button>' : ''}
          <button id="logseq-disconnect">Disconnect</button>
        `;
      } else {
        logseqIo.innerHTML = '<button id="logseq-connect">Choose journals folder…</button>';
      }

      const connectBtn = document.getElementById('logseq-connect');
      if (connectBtn) {
        connectBtn.addEventListener('click', async () => {
          try {
            await Notes.connectLogseq();
            renderLogseqIo();
            Toast.show('LogSeq sync connected');
          } catch (err) {
            if (err?.name !== 'AbortError') {
              Toast.show('Could not open folder picker: ' + err.message);
            }
          }
        });
      }
      const disconnectBtn = document.getElementById('logseq-disconnect');
      if (disconnectBtn) {
        disconnectBtn.addEventListener('click', async () => {
          await Notes.disconnectLogseq();
          renderLogseqIo();
        });
      }
    };
    renderLogseqIo();

    document.getElementById('settings-save').addEventListener('click', async () => {
      const d = await DB.get();
      d.customCSS = cssInput.value;
      d.openInNewTab = newTabInput.checked;
      modal.querySelectorAll('.tool-toggle').forEach(cb => {
        d.enabledTools[cb.dataset.tool] = cb.checked;
      });
      try {
        d.quickOpenRules = [...qoContainer.querySelectorAll('.qo-rule')].map(row => ({
          id: row.dataset.id || `qo-${Util.id()}`,
          name: row.querySelector('.qo-rule-name').value.trim(),
          pattern: row.querySelector('.qo-rule-pattern').value.trim(),
          template: row.querySelector('.qo-rule-template').value.trim(),
        }));
        for (const rule of d.quickOpenRules) {
          if (!rule.name && !rule.pattern && !rule.template) continue; // skip blank rows
          const check = DB.validateQuickOpenRule(rule);
          if (!check.ok) throw new Error(`Quick open "${rule.name || 'rule'}": ${check.error}`);
        }
        d.quickOpenRules = d.quickOpenRules.filter(r => r.name || r.pattern || r.template);
        await DB.save(d);
      } catch (err) {
        const errEl = document.getElementById('settings-error');
        errEl.textContent = err.message;
        errEl.classList.remove('hidden');
        return;
      }
      this._applyCustomCSS(cssInput.value);
      this._applyEnabledTools();
      close();
    });

    document.getElementById('settings-cancel').addEventListener('click', close);

    document.getElementById('settings-export').addEventListener('click', async () => {
      const json = await DB.exportData();
      const blob = new Blob([json], { type: 'application/json' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = 'new-tab-organizer-backup.json';
      a.click();
      URL.revokeObjectURL(url);
    });

    document.getElementById('settings-import').addEventListener('click', () => {
      document.getElementById('settings-import-file').click();
    });

    document.getElementById('settings-import-file').addEventListener('change', async (e) => {
      const file = e.target.files[0];
      if (!file) return;
      try {
        const text = await file.text();
        await DB.importData(text);
        close();
        await this.refresh();
        Toast.show('Data imported');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    });
  },

  // --- Workspaces ---

  async _renderWorkspaces() {
    const data = await DB.get();
    const container = document.getElementById('workspaces');
    container.innerHTML = data.workspaces.map((ws, i) => `
      <button class="workspace-btn${i === data.activeWorkspace ? ' active' : ''}"
              data-index="${i}">
        <span class="ws-name">${Util.escape(ws.name)}</span>
        ${ws.key ? `<kbd class="ws-key">${Util.escape(ws.key)}</kbd>` : ''}
      </button>
    `).join('') + `<button class="workspace-add" data-action="add">+</button>`;

    container.querySelectorAll('.workspace-btn').forEach(btn => {
      let clickTimer = null;

      btn.addEventListener('click', () => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(() => {
          this.switchWorkspace(parseInt(btn.dataset.index));
        }, 0);
      });

      btn.addEventListener('dblclick', (e) => {
        if (clickTimer) { clearTimeout(clickTimer); clickTimer = null; }
        e.stopPropagation();
        this._renameWorkspaceInline(btn);
      });

      btn.addEventListener('contextmenu', async (e) => {
        e.preventDefault();
        const idx = parseInt(btn.dataset.index);
        const entry = await DB.deleteWorkspace(idx);
        if (!entry) return;
        await this.refresh();
        Toast.show(`Deleted workspace "${entry.workspace.name}"`, {
          actionLabel: 'Undo',
          onAction: async () => {
            await DB.restoreWorkspace(entry);
            await this.refresh();
          }
        });
      });
    });

    container.querySelector('[data-action="add"]').addEventListener('click', () => {
      this._showAddWorkspaceModal();
    });
  },

  _showAddWorkspaceModal() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    modal.innerHTML = `
      <h3>New Workspace</h3>
      <input type="text" id="ws-name" placeholder="Workspace name" autofocus>
      <div class="modal-actions">
        <button id="ws-cancel">Cancel</button>
        <button id="ws-save" class="primary">Save</button>
      </div>
    `;

    const nameInput = document.getElementById('ws-name');
    nameInput.focus();

    const save = async () => {
      const name = nameInput.value.trim();
      if (!name) return;
      await DB.addWorkspace(name);
      overlay.classList.add('hidden');
      await this.switchWorkspace(DB._cache.workspaces.length - 1);
      Keys.showHint(`Added workspace: ${name}`);
    };

    document.getElementById('ws-save').addEventListener('click', save);
    document.getElementById('ws-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    nameInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  async _renameWorkspaceInline(btn) {
    const idx = parseInt(btn.dataset.index);
    const nameEl = btn.querySelector('.ws-name');
    const keyEl = btn.querySelector('.ws-key');
    const oldName = nameEl.textContent;

    const input = document.createElement('input');
    input.type = 'text';
    input.className = 'ws-rename-input';
    input.value = oldName;

    nameEl.textContent = '';
    nameEl.appendChild(input);
    if (keyEl) keyEl.style.display = 'none';
    input.focus();
    input.select();

    const finish = async (save) => {
      const newName = input.value.trim();
      input.removeEventListener('blur', onBlur);
      input.removeEventListener('keydown', onKeydown);
      if (save && newName && newName !== oldName) {
        await DB.renameWorkspace(idx, newName);
      }
      await this._renderWorkspaces();
    };

    const onBlur = () => finish(true);
    const onKeydown = (e) => {
      if (e.key === 'Enter') { e.preventDefault(); finish(true); }
      if (e.key === 'Escape') { e.preventDefault(); finish(false); }
    };

    input.addEventListener('blur', onBlur);
    input.addEventListener('keydown', onKeydown);
  },

  // --- Tools tabs ---

  isToolEnabled(id) {
    const t = DB._cache?.enabledTools;
    return !t || t[id] !== false;
  },

  // Hide disabled tool tabs; fall back to the first enabled tool if the
  // active one was just turned off.
  _applyEnabledTools() {
    document.querySelectorAll('.tools-tab').forEach(tab => {
      tab.classList.toggle('hidden', !this.isToolEnabled(tab.dataset.tool));
    });
    document.querySelectorAll('.help-tool').forEach(el => {
      el.classList.toggle('hidden', !this.isToolEnabled(el.dataset.tool));
    });
    if (!this.isToolEnabled(this._activeTool)) {
      const first = this._TOOL_DEFS.find(t => this.isToolEnabled(t.id));
      if (first) this.switchTool(first.id);
    }
  },

  switchTool(tool, focusInput = false) {
    document.querySelectorAll('.tools-tab').forEach(t =>
      t.classList.toggle('active', t.dataset.tool === tool));
    document.querySelectorAll('.tool-panel').forEach(p =>
      p.classList.toggle('active', p.id === `tool-${tool}`));
    localStorage.setItem('active-tool', tool);
    this._activeTool = tool;
    if (focusInput) {
      const first = document.querySelector(`#tool-${tool} textarea, #tool-${tool} input`);
      if (first) first.focus();
    }
  },

  _bindToolsTabs() {
    document.querySelectorAll('.tools-tab').forEach(tab => {
      tab.addEventListener('click', () => this.switchTool(tab.dataset.tool));
    });
  },

  _restoreActiveTool() {
    const saved = localStorage.getItem('active-tool');
    if (saved && this.isToolEnabled(saved) &&
        document.querySelector(`.tools-tab[data-tool="${saved}"]`)) {
      this.switchTool(saved);
    }
  },

  // --- Global keys ---

  _bindKeys() {
    Keys.on(async (key, event, mode) => {
      if (mode !== 'normal') return false;
      if (event && (event.ctrlKey || event.metaKey || event.altKey)) return false;

      // Quick open (templates like Jira issues / GitHub repos).
      // Yields to a user-assigned combo starting with 'o', e.g. "od".
      if (!event && key === 'o' && !Keys.isPrefix('o')) {
        QuickOpen.show();
        return true;
      }

      // Tool switching
      if (!event && this._TOOL_KEYS[key]) {
        const tool = this._TOOL_KEYS[key];
        if (this.isToolEnabled(tool)) {
          this.switchTool(tool);
          return true;
        }
        return false;
      }

      // Workspace switching by key
      if (!event && key.length <= 2) {
        const data = DB._cache;
        const wsIdx = data?.workspaces.findIndex(w => w.key === key);
        if (data && wsIdx >= 0 && wsIdx !== data.activeWorkspace) {
          await this.switchWorkspace(wsIdx);
          return true;
        }
      }

      // Selection/movement keys go to whichever panel owns them.
      const matrixHasSelection = !!Eisenhower._selectedId;
      if (this._activeTool === 'matrix' || matrixHasSelection) {
        if (Eisenhower.handleKey(key, event, mode)) return true;
        return Bookmarks.handleKey(key, event, mode, { selection: false });
      }

      if (Bookmarks.handleKey(key, event, mode)) return true;
      return Eisenhower.handleKey(key, event, mode);
    });
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
