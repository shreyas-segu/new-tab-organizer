const Palette = {
  _input: null,
  _results: null,
  _palette: null,
  _allCommands: [],
  _filtered: [],
  _selectedIdx: 0,

  init() {
    this._palette = document.getElementById('command-palette');
    this._input = document.getElementById('command-input');
    this._results = document.getElementById('command-results');

    this._input.addEventListener('input', () => {
      this._filtered = this._filterCommands(this._allCommands, this._input.value);
      this._selectedIdx = 0;
      this._render();
    });

    this._input.addEventListener('keydown', (e) => {
      const count = this._filtered.length;
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        if (count === 0) return;
        this._selectedIdx = Math.min(this._selectedIdx + 1, count - 1);
        this._render();
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        if (count === 0) return;
        this._selectedIdx = Math.max(this._selectedIdx - 1, 0);
        this._render();
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const cmd = this._filtered[this._selectedIdx];
        if (cmd) {
          this.hide();
          cmd.action();
        }
      }
    });

    document.addEventListener('click', (e) => {
      if (!this._palette.contains(e.target)) this.hide();
    });
  },

  toggle() {
    if (!this._palette.classList.contains('hidden')) {
      this.hide();
      return;
    }

    this._palette.classList.remove('hidden');
    this._input.value = '';
    this._input.focus();

    this._getCommands().then(commands => {
      // Palette may have been closed while commands were loading
      if (this._palette.classList.contains('hidden')) return;
      this._allCommands = commands;
      this._filtered = commands;
      this._selectedIdx = 0;
      this._render();
    });
  },

  hide() {
    this._palette.classList.add('hidden');
  },

  async _getCommands() {
    const keys = await DB.getAllKeys();
    const data = await DB.get();
    const commands = [];

    // Bookmarks section
    commands.push({ name: 'New Bookmark', desc: 'Add a new bookmark', key: 'n', section: 'Bookmarks', action: () => Bookmarks.showBookmarkModal(null) });
    commands.push({ name: 'New Folder', desc: 'Add a new folder', key: 'f', section: 'Bookmarks', action: () => Bookmarks.showAddFolder() });
    commands.push({ name: 'Quick Open', desc: 'Jira issue, GitHub repo, ...', key: 'o', section: 'Bookmarks', action: () => QuickOpen.show() });
    commands.push({ name: 'Daily Notes', desc: "Today's log", key: 't', section: 'Bookmarks', action: () => App.switchTool('notes', true) });

    data.workspaces.forEach((ws, i) => {
      commands.push({
        name: `Switch to: ${ws.name}`,
        desc: i === data.activeWorkspace ? 'current' : '',
        key: ws.key || '',
        section: 'Workspaces',
        action: async () => {
          await DB.switchWorkspace(i);
          await App.refresh();
        }
      });
    });

    // Eisenhower Matrix section (part of the Matrix tool)
    if (App.isToolEnabled('matrix')) {
      commands.push({ name: 'Add to Do (Q1)', desc: 'Urgent & Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q1') });
      commands.push({ name: 'Add to Decide (Q2)', desc: 'Not Urgent & Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q2') });
      commands.push({ name: 'Add to Delegate (Q3)', desc: 'Urgent & Not Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q3') });
      commands.push({ name: 'Add to Delete (Q4)', desc: 'Not Urgent & Not Important', section: 'Eisenhower Matrix', action: () => Eisenhower.showAdd('q4') });
    }

    // Tools section
    if (App.isToolEnabled('jwt')) {
      commands.push({ name: 'JWT Decoder', desc: 'Decode and verify JWTs', section: 'Tools', action: () => App.switchTool('jwt', true) });
    }
    if (App.isToolEnabled('gen')) {
      commands.push({ name: 'Generator', desc: 'Random emails, names, UUIDs, CUIDs', section: 'Tools', action: () => App.switchTool('gen') });
    }
    if (App.isToolEnabled('urlcodec')) {
      commands.push({ name: 'URL Encode/Decode', desc: 'Encode and decode URLs', section: 'Tools', action: () => App.switchTool('urlcodec', true) });
    }
    if (App.isToolEnabled('matrix')) {
      commands.push({ name: 'Eisenhower Matrix', desc: 'Task priority matrix', section: 'Tools', action: () => App.switchTool('matrix') });
    }

    // Settings section
    commands.push({ name: 'Toggle Help', desc: 'Show keyboard shortcuts', key: '?', section: 'Settings', action: () => document.getElementById('help-overlay').classList.toggle('hidden') });
    commands.push({ name: 'Theme: Light', desc: '', section: 'Settings', action: () => App.setTheme('light') });
    commands.push({ name: 'Theme: Dark', desc: '', section: 'Settings', action: () => App.setTheme('dark') });
    commands.push({ name: 'Theme: System', desc: 'Use OS preference', section: 'Settings', action: () => App.setTheme('system') });
    commands.push({ name: 'Settings', desc: 'Theme & custom CSS', section: 'Settings', action: () => App.showSettings() });

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
            DB.get().then(d => Util.openUrl(info.item.url, d.openInNewTab));
          } else if (info.type === 'matrix') {
            DB.toggleMatrixItem(info.quadrant, info.item.id).then(() => Eisenhower.render());
          }
        }
      });
    }

    return commands;
  },

  // --- Fuzzy matching ---

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
    if (!indices || indices.length === 0) return Util.escape(text);
    const chars = [...text];
    const idxSet = new Set(indices);
    return chars.map((ch, i) =>
      idxSet.has(i) ? `<b>${Util.escape(ch)}</b>` : Util.escape(ch)
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

  // --- Rendering ---

  _render() {
    const commands = this._filtered;
    const query = this._input.value;
    const container = this._results;

    let selectableIdx = 0;
    let lastSection = null;

    container.innerHTML = commands.map((cmd) => {
      const sectionHtml = cmd.section !== lastSection
        ? `<div class="command-section">${Util.escape(cmd.section)}</div>` : '';
      lastSection = cmd.section;

      selectableIdx++;

      const nameHtml = query && cmd._nameIndices
        ? this._highlightMatch(cmd.name, cmd._nameIndices)
        : Util.escape(cmd.name);

      const descHtml = cmd.desc
        ? `<span class="cmd-desc${query && cmd._descIndices ? '' : ' dim'}">${
            query && cmd._descIndices
              ? this._highlightMatch(cmd.desc, cmd._descIndices)
              : Util.escape(cmd.desc)
          }</span>`
        : '';

      return `
        ${sectionHtml}
        <div class="command-item" data-idx="${selectableIdx - 1}">
          ${cmd.key ? `<span class="cmd-key">${Util.escape(cmd.key)}</span>` : '<span class="cmd-key-spacer"></span>'}
          <span class="cmd-name">${nameHtml}</span>
          ${descHtml}
        </div>
      `;
    }).join('');

    container.querySelectorAll('.command-item').forEach(el => {
      el.addEventListener('click', () => {
        const idx = parseInt(el.dataset.idx);
        if (commands[idx]) {
          this.hide();
          commands[idx].action();
        }
      });
      el.addEventListener('mouseenter', () => {
        this._selectedIdx = parseInt(el.dataset.idx);
        this._updateSelectedClass();
      });
    });

    this._updateSelectedClass(true);
  },

  _updateSelectedClass(scroll = false) {
    const els = this._results.querySelectorAll('.command-item');
    els.forEach(el => el.classList.remove('selected'));
    const selEl = this._results.querySelector(`.command-item[data-idx="${this._selectedIdx}"]`);
    if (selEl) {
      selEl.classList.add('selected');
      if (scroll) selEl.scrollIntoView({ block: 'nearest' });
    }
  }
};
