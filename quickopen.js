const QuickOpen = {
  _input: null,
  _preview: null,
  _errorEl: null,

  show() {
    const modal = document.getElementById('modal');
    const overlay = document.getElementById('modal-overlay');
    overlay.classList.remove('hidden');

    modal.innerHTML = `
      <h3>Quick Open</h3>
      <input type="text" id="qo-input" placeholder="PROJ-123, owner/repo..." autofocus>
      <div id="qo-preview"></div>
      <div id="qo-error" class="modal-error hidden"></div>
      <div class="modal-actions">
        <span class="key-label">Enter opens first match</span>
        <button id="qo-cancel">Cancel</button>
      </div>
    `;

    this._input = document.getElementById('qo-input');
    this._preview = document.getElementById('qo-preview');
    this._errorEl = document.getElementById('qo-error');

    this._input.addEventListener('input', () => this._updatePreview());
    document.getElementById('qo-cancel').addEventListener('click', () => this.hide());
    this._input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') { e.preventDefault(); this._openFirst(); }
    });

    this._input.focus();
    this._updatePreview();
  },

  hide() {
    document.getElementById('modal-overlay').classList.add('hidden');
  },

  _matches(query) {
    return DB.matchQuickOpenRules(query);
  },

  _updatePreview() {
    const q = this._input.value;
    const matches = this._matches(q);
    if (!q.trim()) {
      this._preview.innerHTML = '<div class="qo-hint">Type an issue key, repo, or anything matching your quick open rules.</div>';
      return;
    }
    if (matches.length === 0) {
      this._preview.innerHTML = `<div class="qo-hint">No quick open rule matches "<b>${Util.escape(q.trim())}</b>"</div>`;
      return;
    }
    this._preview.innerHTML = matches.map((m, i) => `
      <div class="qo-match${i === 0 ? ' primary' : ''}" data-url="${Util.escape(m.url)}">
        <span class="qo-name">${i === 0 ? '↵ ' : ''}${Util.escape(m.name)}</span>
        <span class="qo-url">${Util.escape(m.url)}</span>
      </div>
    `).join('');

    this._preview.querySelectorAll('.qo-match').forEach(el => {
      el.addEventListener('click', () => {
        this.hide();
        this._openUrl(el.dataset.url);
      });
    });
  },

  _openFirst() {
    const matches = this._matches(this._input.value);
    if (matches.length === 0) {
      this._errorEl.textContent = 'No matching rule';
      this._errorEl.classList.remove('hidden');
      return;
    }
    this.hide();
    this._openUrl(matches[0].url);
  },

  _openUrl(url) {
    DB.get().then(d => Util.openUrl(url, d.openInNewTab));
  }
};
