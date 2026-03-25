const Eisenhower = {
  async render() {
    const data = await DB.get();
    const matrix = data.matrix;

    for (let q = 1; q <= 4; q++) {
      const container = document.querySelector(`.matrix-items[data-q="${q}"]`);
      const items = matrix[`q${q}`] || [];

      if (items.length === 0) {
        container.innerHTML = '';
      } else {
        container.innerHTML = items.map(item => `
          <div class="matrix-item${item.done ? ' done' : ''}"
               data-id="${item.id}" data-quadrant="${q}">
            <span class="mi-key">${item.key}</span>
            <span class="mi-text">${this._escape(item.text)}</span>
            ${item.dueDate ? `<span class="mi-due${this._isOverdue(item.dueDate) ? ' overdue' : ''}">${this._formatDue(item.dueDate)}</span>` : ''}
            <button class="mi-delete" data-delete="${item.id}" data-q="${q}">✕</button>
          </div>
        `).join('');
      }
    }

    // Delete handlers
    document.querySelectorAll('.mi-delete').forEach(btn => {
      btn.addEventListener('click', async (e) => {
        e.stopPropagation();
        const id = btn.dataset.delete;
        const q = btn.dataset.q;
        await DB.deleteMatrixItem(`q${q}`, id);
        await this.render();
      });
    });

    // Toggle done on click
    document.querySelectorAll('.matrix-item').forEach(el => {
      el.addEventListener('click', async () => {
        const id = el.dataset.id;
        const q = el.dataset.quadrant;
        await DB.toggleMatrixItem(`q${q}`, id);
        await this.render();
      });
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
      <input type="text" id="mi-key" placeholder="Keybinding (auto-assigned if empty)" maxlength="1">
      <div class="modal-actions">
        <button id="mi-cancel">Cancel</button>
        <button id="mi-save" class="primary">Add</button>
      </div>
    `;

    const textInput = document.getElementById('mi-text');
    const dueInput = document.getElementById('mi-due');
    const keyInput = document.getElementById('mi-key');
    textInput.focus();

    const save = async () => {
      const text = textInput.value.trim();
      const key = keyInput.value.trim() || null;
      const dueDate = dueInput.value || null;
      if (!text) return;
      await DB.addMatrixItem(quadrant, text, dueDate);
      overlay.classList.add('hidden');
      await this.render();
    };

    document.getElementById('mi-save').addEventListener('click', save);
    document.getElementById('mi-cancel').addEventListener('click', () => overlay.classList.add('hidden'));
    textInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); dueInput.focus(); } });
    dueInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); keyInput.focus(); } });
    keyInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') save(); });
  },

  async moveTo(id, fromQ, toQ) {
    await DB.moveMatrixItem(id, fromQ, toQ);
    await this.render();
  },

  handleKey(key, event, mode) {
    if (mode !== 'normal') return false;

    if (key.length === 1 || key.length === 2) {
      const data = DB._cache;
      if (!data?.matrix) return false;
      for (const [q, items] of Object.entries(data.matrix)) {
        const item = items.find(i => i.key === key);
        if (item) {
          DB.toggleMatrixItem(q, item.id).then(() => this.render());
          return true;
        }
      }
    }
    return false;
  },

  initHandlers() {
    document.querySelectorAll('.matrix-add').forEach(btn => {
      btn.addEventListener('click', () => {
        this.showAdd(`q${btn.dataset.q}`);
      });
    });
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
  },

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
