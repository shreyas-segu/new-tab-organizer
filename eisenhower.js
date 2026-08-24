const Eisenhower = {
  _QUADRANTS: ['q1', 'q2', 'q3', 'q4'],
  _selectedId: null,

  async render() {
    const data = await DB.get();
    const matrix = data.matrix;

    for (let q = 1; q <= 4; q++) {
      const container = document.querySelector(`.matrix-items[data-q="${q}"]`);
      const items = matrix[`q${q}`] || [];

      container.innerHTML = items.map(item => `
        <div class="matrix-item${item.done ? ' done' : ''}${item.id === this._selectedId ? ' selected' : ''}"
             data-id="${item.id}" data-quadrant="q${q}"
             draggable="true"
             ${item.key ? `title="Press ${item.key.length === 2 ? `${Util.escape(item.key[0])} then ${Util.escape(item.key[1])}` : Util.escape(item.key)} to toggle"` : ''}>
          ${item.key ? `<span class="mi-key">${Util.escape(item.key)}</span>` : ''}
          <span class="mi-text" title="${Util.escape(item.text)}">${Util.escape(item.text)}</span>
          ${item.dueDate ? `<span class="mi-due${this._isOverdue(item.dueDate) ? ' overdue' : ''}">${this._formatDue(item.dueDate)}</span>` : ''}
          <button class="mi-delete" data-delete="${item.id}" data-q="q${q}">✕</button>
        </div>
      `).join('');
    }

    // Delete handlers
    document.querySelectorAll('.mi-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        await this._deleteItem(btn.dataset.q, btn.dataset.delete);
      });
    });

    // Click toggles done + selects
    document.querySelectorAll('.matrix-item').forEach(el => {
      el.addEventListener('click', async () => {
        this._selectedId = el.dataset.id;
        this._updateSelectionUI();
        const id = el.dataset.id;
        const q = el.dataset.quadrant;
        await DB.toggleMatrixItem(q, id);
        await this.render();
      });
      this._bindDrag(el);
    });

    // Quadrants are drop targets
    document.querySelectorAll('.matrix-items').forEach(el => {
      this._bindQuadrantDrop(el);
    });
  },

  _updateSelectionUI() {
    document.querySelectorAll('.matrix-item.selected').forEach(el => el.classList.remove('selected'));
    if (!this._selectedId) return;
    const el = document.querySelector(`.matrix-item[data-id="${this._selectedId}"]`);
    if (el) {
      el.classList.add('selected');
      el.scrollIntoView({ block: 'nearest' });
    }
  },

  _flatItems() {
    const data = DB._cache;
    if (!data?.matrix) return [];
    return this._QUADRANTS.flatMap(q => (data.matrix[q] || []).map(item => ({ ...item, quadrant: q })));
  },

  // Selection / movement keys — take priority when the matrix is the
  // active tool. Returns true when the key was consumed.
  handleKey(key, event, mode) {
    if (mode !== 'normal') return false;
    if (event && (event.ctrlKey || event.metaKey || event.altKey)) return false;

    const current = this._flatItems().find(i => i.id === this._selectedId);

    // Custom keybindings toggle their item (only when nothing selected,
    // so 'd'/'e'-like keys act on the selection first)
    if (!current && !event && (key.length === 1 || key.length === 2)) {
      const data = DB._cache;
      if (data?.matrix) {
        for (const [q, items] of Object.entries(data.matrix)) {
          const item = items.find(i => i.key === key);
          if (item) {
            DB.toggleMatrixItem(q, item.id).then(() => this.render());
            return true;
          }
        }
      }
    }

    if (!event || !current) {
      // Allow starting a selection with Tab even when nothing is selected
      if (event && key === 'Tab') {
        event.preventDefault();
        const flat = this._flatItems();
        if (flat.length > 0) {
          this._selectedId = event.shiftKey ? flat[flat.length - 1].id : flat[0].id;
          this._updateSelectionUI();
          return true;
        }
      }
      return false;
    }

    switch (key) {
      case 'Tab': {
        event.preventDefault();
        const flat = this._flatItems();
        const idx = flat.findIndex(i => i.id === this._selectedId);
        const next = event.shiftKey
          ? (idx <= 0 ? flat.length - 1 : idx - 1)
          : (idx === flat.length - 1 ? 0 : idx + 1);
        this._selectedId = flat[next].id;
        this._updateSelectionUI();
        return true;
      }

      case 'Enter':
        event.preventDefault();
        DB.toggleMatrixItem(current.quadrant, current.id).then(() => this.render());
        return true;

      case 'd':
        event.preventDefault();
        this._deleteItem(current.quadrant, current.id);
        return true;

      case 'ArrowDown':
      case 'ArrowUp':
        event.preventDefault();
        if (event.shiftKey) {
          DB.reorderMatrixItem(current.quadrant, current.id, key === 'ArrowDown' ? 1 : -1)
            .then(moved => { if (moved) this.render(); });
        } else {
          const items = DB._cache.matrix[current.quadrant];
          const idx = items.findIndex(i => i.id === current.id);
          const to = key === 'ArrowDown' ? idx + 1 : idx - 1;
          if (to >= 0 && to < items.length) {
            this._selectedId = items[to].id;
          }
          this._updateSelectionUI();
        }
        return true;

      case 'ArrowLeft':
      case 'ArrowRight':
        event.preventDefault();
        if (event.shiftKey) {
          const qi = this._QUADRANTS.indexOf(current.quadrant);
          const toQ = this._QUADRANTS[qi + (key === 'ArrowRight' ? 1 : -1)];
          if (toQ) {
            DB.moveMatrixItem(current.id, current.quadrant, toQ).then(async () => {
              await this.render();
              Keys.showHint('Moved');
            });
          }
        }
        return true;
    }

    return false;
  },

  async _deleteItem(quadrant, id) {
    const entry = await DB.deleteMatrixItem(quadrant, id);
    if (!entry) return;
    if (this._selectedId === id) this._selectedId = null;
    await this.render();
    Toast.show(`Deleted "${entry.item.text}"`, {
      actionLabel: 'Undo',
      onAction: async () => {
        await DB.restoreMatrixItem(entry);
        await this.render();
        await Keys.updatePrefixes();
      }
    });
  },

  initHandlers() {
    document.querySelectorAll('.matrix-add').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showAdd(`q${btn.dataset.q}`);
      });
    });
  },

  // --- Drag & drop ---

  _bindDrag(el) {
    el.addEventListener('dragstart', (e) => {
      e.dataTransfer.effectAllowed = 'move';
      e.dataTransfer.setData('text/plain', JSON.stringify({
        kind: 'matrix', id: el.dataset.id, quadrant: el.dataset.quadrant
      }));
      el.classList.add('dragging');
    });
    el.addEventListener('dragend', () => el.classList.remove('dragging'));
  },

  _bindQuadrantDrop(container) {
    container.addEventListener('dragover', (e) => {
      e.preventDefault();
      e.dataTransfer.dropEffect = 'move';
      container.closest('.matrix-quadrant').classList.add('drop-target');
    });
    container.addEventListener('dragleave', (e) => {
      if (container.contains(e.relatedTarget)) return;
      container.closest('.matrix-quadrant').classList.remove('drop-target');
    });
    container.addEventListener('drop', async (e) => {
      e.preventDefault();
      container.closest('.matrix-quadrant').classList.remove('drop-target');
      let payload;
      try { payload = JSON.parse(e.dataTransfer.getData('text/plain')); } catch { return; }
      if (payload?.kind !== 'matrix') return;

      // Insertion index from pointer position, excluding the dragged element
      const others = [...container.querySelectorAll('.matrix-item:not(.dragging)')];
      let insertAt = others.findIndex(el =>
        e.clientY < el.getBoundingClientRect().top + el.offsetHeight / 2);
      if (insertAt === -1) insertAt = others.length;

      await DB.moveMatrixItem(payload.id, payload.quadrant, container.dataset.q, insertAt);
      this._selectedId = payload.id;
      await this.render();
      await Keys.updatePrefixes();
      Keys.showHint('Moved');
    });
  },

  showAdd(quadrant) {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    const labels = { q1: 'Do', q2: 'Decide', q3: 'Delegate', q4: 'Delete' };

    modal.innerHTML = `
      <h3>Add to ${labels[quadrant]}</h3>
      <input type="text" id="mi-text" placeholder="Task description" autofocus>
      <input type="date" id="mi-due" placeholder="Due date (optional)">
      <input type="text" id="mi-key" placeholder="Keybinding (auto-assigned if empty)" maxlength="2">
      <div id="mi-error" class="modal-error hidden"></div>
      <div class="modal-actions">
        <button id="mi-cancel">Cancel</button>
        <button id="mi-save" class="primary">Add</button>
      </div>
    `;

    const textInput = document.getElementById('mi-text');
    const dueInput = document.getElementById('mi-due');
    const keyInput = document.getElementById('mi-key');
    const errorEl = document.getElementById('mi-error');
    textInput.focus();

    const save = async () => {
      const text = textInput.value.trim();
      const key = keyInput.value.trim().toLowerCase() || null;
      const dueDate = dueInput.value || null;
      if (!text) return;
      if (key) {
        const check = DB.validateKey(key);
        if (!check.ok) {
          errorEl.textContent = check.error;
          errorEl.classList.remove('hidden');
          keyInput.focus();
          return;
        }
      }
      await DB.addMatrixItem(quadrant, text, dueDate);
      overlay.classList.add('hidden');
      await this.render();
      await Keys.updatePrefixes();
    };

    document.getElementById('mi-save').addEventListener('click', save);
    document.getElementById('mi-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dueInput.focus(); } });
    dueInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keyInput.focus(); } });
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  _isOverdue(dueDate) {
    if (!dueDate) return false;
    return new Date(dueDate + 'T23:59:59') < new Date();
  },

  _formatDue(dueDate) {
    if (!dueDate) return '';
    const d = new Date(dueDate + 'T00:00:00');
    const now = new Date();
    const diff = Math.ceil((d - now) / 86400000);
    if (diff < 0) return `${Math.abs(diff)}d ago`;
    if (diff === 0) return 'today';
    if (diff === 1) return 'tomorrow';
    return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  }
};
