const UrlCodec = {
  init() {
    this._input = document.getElementById('urlcodec-input');
    this._output = document.getElementById('urlcodec-output');
    this._encodeBtn = document.getElementById('urlcodec-encode');
    this._decodeBtn = document.getElementById('urlcodec-decode');
    this._swapBtn = document.getElementById('urlcodec-swap');
    this._clearBtn = document.getElementById('urlcodec-clear');

    this._encodeBtn.addEventListener('click', () => this._encode());
    this._decodeBtn.addEventListener('click', () => this._decode());
    this._swapBtn.addEventListener('click', () => this._swap());
    this._clearBtn.addEventListener('click', () => this._clear());
    this._input.addEventListener('input', () => this._autoDecode());
  },

  _encode() {
    const val = this._input.value;
    if (!val) return;
    try {
      this._output.value = encodeURIComponent(val);
    } catch {
      this._output.value = 'Encoding error';
    }
  },

  _decode() {
    const val = this._input.value;
    if (!val) { this._output.value = ''; return; }
    try {
      this._output.value = decodeURIComponent(val);
    } catch {
      this._output.value = 'Invalid URL-encoded string';
    }
  },

  _autoDecode() {
    const val = this._input.value;
    if (!val) { this._output.value = ''; return; }
    const hasPercent = val.includes('%');
    if (hasPercent) {
      this._decode();
    } else {
      this._encode();
    }
  },

  _swap() {
    const tmp = this._input.value;
    this._input.value = this._output.value;
    this._output.value = tmp;
  },

  _clear() {
    this._input.value = '';
    this._output.value = '';
    this._input.focus();
  }
};
