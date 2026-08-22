const Util = {
  // Keys that are reserved for built-in actions and cannot be
  // assigned to bookmarks/matrix items.
  RESERVED_KEYS: new Set(['n', 'f', 'r', 'd', 'e', 'o', 't', '?', 'm', 'j', 'g', 'u']),

  escape(str) {
    if (str == null) return '';
    return String(str)
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  },

  isMac() {
    if (navigator.userAgentData && navigator.userAgentData.platform) {
      return navigator.userAgentData.platform.toLowerCase().includes('mac');
    }
    return (navigator.platform || '').toUpperCase().includes('MAC');
  },

  modKey() {
    return this.isMac() ? '⌘' : 'Ctrl';
  },

  openUrl(url, newTab) {
    if (newTab) {
      window.open(url, '_blank', 'noopener');
    } else {
      window.location.href = url;
    }
  }
};

const Toast = {
  _el: null,
  _timer: null,
  _DURATION: 5000,

  init() {
    if (this._el) return;
    this._el = document.createElement('div');
    this._el.id = 'toast';
    document.body.appendChild(this._el);
  },

  show(message, { actionLabel = null, onAction = null, duration = this._DURATION } = {}) {
    clearTimeout(this._timer);
    this._el.innerHTML = '';

    const msg = document.createElement('span');
    msg.textContent = message;
    this._el.appendChild(msg);

    if (actionLabel && onAction) {
      const btn = document.createElement('button');
      btn.textContent = actionLabel;
      btn.addEventListener('click', () => { clearTimeout(this._timer); this.hide(); onAction(); });
      this._el.appendChild(btn);
    }

    this._el.classList.add('visible');
    this._timer = setTimeout(() => this.hide(), duration);
  },

  hide() {
    this._el.classList.remove('visible');
  }
};
