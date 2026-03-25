const App = {
  _mediaQuery: null,

  async init() {
    Keys.init();
    this._updatePlatformHints();
    await this._initTheme();
    await this._renderWorkspaces();
    await Bookmarks.render();
    await Eisenhower.render();
    Eisenhower.initHandlers();
    JWT.init();
    Generator.init();
    UrlCodec.init();
    this._bindToolsTabs();
    this._bindKeys();
    this._bindCommandPalette();
  },

  _updatePlatformHints() {
    const isMac = navigator.platform.toUpperCase().indexOf('MAC') >= 0;
    const kbd = document.getElementById('kbd-cmd');
    if (kbd) kbd.textContent = isMac ? '\u2318K' : 'Ctrl+K';
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

    document.getElementById('settings-btn').addEventListener('click', () => this._showSettings());
  },

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
    // Update active state in settings modal if open
    document.querySelectorAll('.theme-option').forEach(btn => {
      btn.classList.toggle('active', btn.dataset.theme === theme);
    });
  },

  _showSettings() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const data = DB._cache;
    const theme = data?.theme || 'system';
    const css = data?.customCSS || '';
    const openInNewTab = data?.openInNewTab || false;

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
        <div class="settings-label">Custom CSS</div>
        <textarea id="settings-css" placeholder=":root { --accent: #ff6600; }">${this._escape(css)}</textarea>
      </div>
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

    document.getElementById('settings-save').addEventListener('click', async () => {
      const d = await DB.get();
      d.customCSS = cssInput.value;
      d.openInNewTab = newTabInput.checked;
      await DB.save(d);
      this._applyCustomCSS(cssInput.value);
      close();
    });

    document.getElementById('settings-cancel').addEventListener('click', close);

    document.getElementById('settings-export').addEventListener('click', () => {
      const json = DB.exportData();
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
        await this._renderWorkspaces();
        await Bookmarks.render();
        await Eisenhower.render();
        Keys.showHint('Data imported');
      } catch (err) {
        alert('Import failed: ' + err.message);
      }
    });
  },

  async _renderWorkspaces() {
    const data = await DB.get();
    const container = document.getElementById('workspaces');
    container.innerHTML = data.workspaces.map((ws, i) => `
      <button class="workspace-btn${i === data.activeWorkspace ? ' active' : ''}"
              data-index="${i}">
        <span class="ws-name">${this._escape(ws.name)}</span>
        ${ws.key ? `<kbd class="ws-key">${ws.key}</kbd>` : ''}
      </button>
    `).join('') + `<button class="workspace-add" data-action="add">+</button>`;

    container.querySelectorAll('.workspace-btn').forEach(btn => {
      let clickTimer = null;

      btn.addEventListener('click', async () => {
        if (clickTimer) clearTimeout(clickTimer);
        clickTimer = setTimeout(async () => {
          await DB.switchWorkspace(parseInt(btn.dataset.index));
          await this._renderWorkspaces();
          await Bookmarks.render();
          await Eisenhower.render();
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
        if (confirm(`Delete workspace "${btn.querySelector('.ws-name').textContent}"?`)) {
          await DB.deleteWorkspace(idx);
          await this._renderWorkspaces();
          await Bookmarks.render();
          await Eisenhower.render();
        }
      });
    });

    container.querySelector('[data-action="add"]').addEventListener('click', async () => {
      const name = prompt('Workspace name:');
      if (name) {
        await DB.addWorkspace(name);
        const data = await DB.get();
        await DB.switchWorkspace(data.workspaces.length - 1);
        await this._renderWorkspaces();
        await Bookmarks.render();
        await Eisenhower.render();
      }
    });
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

  _bindToolsTabs() {
    const saved = localStorage.getItem('active-tool');
    if (saved) {
      document.querySelectorAll('.tools-tab').forEach(t => t.classList.remove('active'));
      document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
      const tab = document.querySelector(`.tools-tab[data-tool="${saved}"]`);
      if (tab) {
        tab.classList.add('active');
        const panel = document.getElementById(`tool-${saved}`);
        if (panel) panel.classList.add('active');
      }
    }

    document.querySelectorAll('.tools-tab').forEach(tab => {
      tab.addEventListener('click', () => {
        document.querySelectorAll('.tools-tab').forEach(t => t.classList.remove('active'));
        document.querySelectorAll('.tool-panel').forEach(p => p.classList.remove('active'));
        tab.classList.add('active');
        document.getElementById(`tool-${tab.dataset.tool}`).classList.add('active');
        localStorage.setItem('active-tool', tab.dataset.tool);
      });
    });
  },

  _bindKeys() {
    const toolKeys = { m: 'matrix', j: 'jwt', g: 'gen', u: 'urlcodec' };

    Keys.on(async (key, event, mode) => {
      if (mode !== 'normal') return false;
      if (event && (event.ctrlKey || event.metaKey || event.altKey)) return false;

      // Tool switching
      if (toolKeys[key]) {
        document.querySelector(`.tools-tab[data-tool="${toolKeys[key]}"]`).click();
        return true;
      }

      // Workspace switching by key
      const data = DB._cache;
      if (data?.workspaces) {
        const wsIdx = data.workspaces.findIndex(w => w.key === key);
        if (wsIdx >= 0 && wsIdx !== data.activeWorkspace) {
          await DB.switchWorkspace(wsIdx);
          await this._renderWorkspaces();
          await Bookmarks.render();
          await Eisenhower.render();
          return true;
        }
      }

      // Bookmarks get keyboard focus by default
      const handled = Bookmarks.handleKey(key, event, mode);
      if (handled) return true;

      // Matrix keybindings still work
      return Eisenhower.handleKey(key, event, mode);
    });
  },

  _bindCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('command-input');
    const results = document.getElementById('command-results');
    let allCommands = [];
    let filtered = [];
    let selectedIdx = 0;

    input.addEventListener('input', () => {
      filtered = this._filterCommands(allCommands, input.value);
      selectedIdx = 0;
      this._renderCommands(results, filtered, selectedIdx, input.value);
    });

    input.addEventListener('keydown', (e) => {
      const count = filtered.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (count === 0) return;
        selectedIdx = Math.min(selectedIdx + 1, count - 1);
        this._renderCommands(results, filtered, selectedIdx, input.value);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (count === 0) return;
        selectedIdx = Math.max(selectedIdx - 1, 0);
        this._renderCommands(results, filtered, selectedIdx, input.value);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (filtered[selectedIdx]) {
          filtered[selectedIdx].action();
          palette.classList.add('hidden');
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!palette.contains(e.target)) palette.classList.add('hidden');
    });

    this._commandPaletteState = { setCommands(cmds) { allCommands = cmds; filtered = cmds; selectedIdx = 0; } };
  },

  async toggleCommandPalette() {
    const palette = document.getElementById('command-palette');
    const input = document.getElementById('command-input');
    const results = document.getElementById('command-results');

    if (!palette.classList.contains('hidden')) {
      palette.classList.add('hidden');
      return;
    }

    palette.classList.remove('hidden');
    input.value = '';
    input.focus();

    const commands = await this._getCommands();
    this._commandPaletteState.setCommands(commands);
    this._renderCommands(results, commands, 0, '');
  },

  async _getCommands() {
    const keys = await DB.getAllKeys();
    const commands = [];

    // Bookmarks section
    commands.push({ name: 'New Bookmark', desc: 'Add a new bookmark', key: 'n', section: 'Bookmarks', action: () => Bookmarks.showAddBookmark() });
    commands.push({ name: 'New Folder', desc: 'Add a new folder', key: 'f', section: 'Bookmarks', action: () => Bookmarks.showAddFolder() });
    commands.push({ name: 'New Workspace', desc: 'Create a new workspace', section: 'Workspaces', action: () => { document.querySelector('.workspace-add').click(); } });

    const data = await DB.get();
    data.workspaces.forEach((ws, i) => {
      commands.push({
        name: `Switch to: ${ws.name}`,
        desc: i === data.activeWorkspace ? 'current' : '',
        key: ws.key || '',
        section: 'Workspaces',
        action: async () => {
          await DB.switchWorkspace(i);
          await this._renderWorkspaces();
          await Bookmarks.render();
          await Eisenhower.render();
        }
      });
    });

    // Eisenhower Matrix section
    commands.push({ name: 'Add to Do (Q1)', desc: 'Urgent & Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q1') });
    commands.push({ name: 'Add to Decide (Q2)', desc: 'Not Urgent & Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q2') });
    commands.push({ name: 'Add to Delegate (Q3)', desc: 'Urgent & Not Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q3') });
    commands.push({ name: 'Add to Delete (Q4)', desc: 'Not Urgent & Not Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q4') });

    // Tools section
    commands.push({ name: 'JWT Decoder', desc: 'Decode and verify JWTs', section: 'Tools', action: () => { document.querySelector('.tools-tab[data-tool="jwt"]').click(); document.getElementById('jwt-input').focus(); } });
    commands.push({ name: 'Generator', desc: 'Random emails, names, UUIDs, CUIDs', section: 'Tools', action: () => document.querySelector('.tools-tab[data-tool="gen"]').click() });
    commands.push({ name: 'URL Encode/Decode', desc: 'Encode and decode URLs', section: 'Tools', action: () => { document.querySelector('.tools-tab[data-tool="urlcodec"]').click(); document.getElementById('urlcodec-input').focus(); } });
    commands.push({ name: 'Eisenhower Matrix', desc: 'Task priority matrix', section: 'Tools', action: () => document.querySelector('.tools-tab[data-tool="matrix"]').click() });

    // Settings section
    commands.push({ name: 'Toggle Help', desc: 'Show keyboard shortcuts', key: '?', section: 'Settings', action: () => document.getElementById('help-overlay').classList.toggle('hidden') });
    commands.push({ name: 'Theme: Light', desc: '', section: 'Settings', action: () => this._setTheme('light') });
    commands.push({ name: 'Theme: Dark', desc: '', section: 'Settings', action: () => this._setTheme('dark') });
    commands.push({ name: 'Theme: System', desc: 'Use OS preference', section: 'Settings', action: () => this._setTheme('system') });
    commands.push({ name: 'Settings', desc: 'Theme & custom CSS', section: 'Settings', action: () => this._showSettings() });

    // Dynamic entries from storage
    for (const [key, info] of keys) {
      const name = info.item.name || info.item.text;
      let desc = '';
      if (info.type === 'bookmark' && info.item.url) {
        try { desc = new URL(info.item.url).hostname; } catch { desc = ''; }
      }
      commands.push({
        name,
        desc,
        key,
        section: info.type === 'bookmark' ? 'Bookmarks' : 'Eisenhower Matrix',
        action: () => {
          if (info.type === 'bookmark') {
            if (info.item.url) window.location.href = info.item.url;
          } else if (info.type === 'matrix') {
            DB.toggleMatrixItem(info.quadrant, info.item.id).then(() => Eisenhower.render());
          }
        }
      });
    }

    return commands;
  },

  _fuzzyMatchWord(word, text) {
    const w = word.toLowerCase();
    const t = text.toLowerCase();
    const indices = [];
    let wi = 0;
    let score = 0;
    let prevMatchIdx = -2;

    for (let ti = 0; ti < t.length && wi < w.length; ti++) {
      if (t[ti] === w[wi]) {
        indices.push(ti);
        if (ti === prevMatchIdx + 1) score += 10;
        if (ti === 0 || t[ti - 1] === ' ' || t[ti - 1] === '-' || t[ti - 1] === '(') score += 5;
        score += 1;
        prevMatchIdx = ti;
        wi++;
      }
    }

    if (wi !== w.length) return null;
    if (indices.length > 1) score -= (indices[indices.length - 1] - indices[0]) * 0.5;
    return { score, indices };
  },

  _highlightMatch(text, indices) {
    if (!indices || indices.length === 0) return this._escape(text);
    const chars = [...text];
    const idxSet = new Set(indices);
    return chars.map((ch, i) =>
      idxSet.has(i) ? `<b>${this._escape(ch)}</b>` : this._escape(ch)
    ).join('');
  },

  _filterCommands(allCommands, query) {
    if (!query) return allCommands;
    const words = query.toLowerCase().split(/\s+/).filter(Boolean);

    const scored = [];
    for (const cmd of allCommands) {
      let totalScore = 0;
      let allWordsMatch = true;
      const nameIndices = [];
      const descIndices = [];

      for (const word of words) {
        const nameResult = this._fuzzyMatchWord(word, cmd.name);
        const descResult = cmd.desc ? this._fuzzyMatchWord(word, cmd.desc) : null;
        const sectionResult = this._fuzzyMatchWord(word, cmd.section);

        let bestScore = 0;
        let matched = false;

        if (nameResult) {
          bestScore = nameResult.score + 100;
          nameIndices.push(...nameResult.indices);
          matched = true;
        }
        if (descResult && descResult.score + 50 > bestScore) {
          bestScore = descResult.score + 50;
          descIndices.push(...descResult.indices);
          matched = true;
        }
        if (sectionResult && sectionResult.score > bestScore) {
          bestScore = sectionResult.score;
          matched = true;
        }

        if (!matched) { allWordsMatch = false; break; }
        totalScore += bestScore;
      }

      if (allWordsMatch) {
        scored.push({
          cmd,
          score: totalScore,
          nameIndices: nameIndices.length ? [...new Set(nameIndices)] : null,
          descIndices: descIndices.length ? [...new Set(descIndices)] : null
        });
      }
    }

    scored.sort((a, b) => b.score - a.score);
    return scored.map(s => ({
      ...s.cmd,
      _nameIndices: s.nameIndices,
      _descIndices: s.descIndices
    }));
  },

  _renderCommands(container, commands, selected, query) {
    let selectableIdx = 0;
    let lastSection = null;

    container.innerHTML = commands.map((cmd) => {
      // Section label
      const sectionHtml = cmd.section !== lastSection
        ? `<div class="command-section">${this._escape(cmd.section)}</div>` : '';
      lastSection = cmd.section;

      const isSelected = selectableIdx === selected;
      selectableIdx++;

      const nameHtml = query && cmd._nameIndices
        ? this._highlightMatch(cmd.name, cmd._nameIndices)
        : this._escape(cmd.name);

      const descHtml = cmd.desc
        ? (query && cmd._descIndices
          ? this._highlightMatch(cmd.desc, cmd._descIndices)
          : `<span style="color:var(--text-dim);font-size:11px">${this._escape(cmd.desc)}</span>`)
        : '';

      return `
        ${sectionHtml}
        <div class="command-item${isSelected ? ' selected' : ''}" data-idx="${selectableIdx - 1}">
          ${cmd.key ? `<span class="cmd-key">${cmd.key}</span>` : '<span style="width:30px"></span>'}
          <span class="cmd-name">${nameHtml}</span>
          ${descHtml ? `<span class="cmd-desc">${descHtml}</span>` : ''}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.command-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        if (commands[idx]) {
          commands[idx].action();
          document.getElementById('command-palette').classList.add('hidden');
        }
      });
    });

    const selectedEl = container.querySelector('.command-item.selected');
    if (selectedEl) selectedEl.scrollIntoView({ block: 'nearest' });
  },

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};

// Boot
document.addEventListener('DOMContentLoaded', () => App.init());
