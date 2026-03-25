const JWT = {
  init() {
    this._input = document.getElementById('jwt-input');
    this._secret = document.getElementById('jwt-secret');
    this._output = document.getElementById('jwt-output');
    this._clearBtn = document.getElementById('jwt-clear');
    this._status = document.getElementById('jwt-status');

    this._input.addEventListener('input', () => this._decode());
    this._secret.addEventListener('input', () => this._validateSignature());
    this._clearBtn.addEventListener('click', () => this._clear());
  },

  _decode() {
    const token = this._input.value.trim();
    if (!token) {
      this._output.innerHTML = '';
      this._status.innerHTML = '';
      return;
    }

    const parts = token.split('.');
    if (parts.length !== 3) {
      this._output.innerHTML = `<div class="jwt-error">Invalid JWT: expected 3 parts (header.payload.signature), got ${parts.length}</div>`;
      this._status.innerHTML = '';
      return;
    }

    const header = this._decodePart(parts[0]);
    const payload = this._decodePart(parts[1]);

    if (!header || !payload) {
      this._output.innerHTML = '<div class="jwt-error">Failed to decode JWT parts</div>';
      this._status.innerHTML = '';
      return;
    }

    let headerObj, payloadObj;
    try {
      headerObj = JSON.parse(header);
      payloadObj = JSON.parse(payload);
    } catch {
      this._output.innerHTML = '<div class="jwt-error">Invalid JSON in JWT</div>';
      return;
    }

    const now = Math.floor(Date.now() / 1000);
    const exp = payloadObj.exp;
    const iat = payloadObj.iat;
    const nbf = payloadObj.nbf;

    let timeInfo = '';
    if (exp !== undefined) {
      const expired = exp < now;
      timeInfo += `<div class="jwt-time ${expired ? 'jwt-expired' : 'jwt-valid'}">${expired ? 'EXPIRED' : 'Valid'} — exp: ${this._formatTime(exp)} (${this._relativeTime(exp, now)})</div>`;
    }
    if (nbf !== undefined) {
      const notYet = nbf > now;
      timeInfo += `<div class="jwt-time ${notYet ? 'jwt-expired' : 'jwt-valid'}">${notYet ? 'NOT YET VALID' : 'Active'} — nbf: ${this._formatTime(nbf)} (${this._relativeTime(nbf, now)})</div>`;
    }
    if (iat !== undefined) {
      timeInfo += `<div class="jwt-time">Issued: ${this._formatTime(iat)} (${this._relativeTime(iat, now)} ago)</div>`;
    }

    this._output.innerHTML = `
      <div class="jwt-section">
        <div class="jwt-section-label">Header <span class="jwt-algo">${this._escape(headerObj.alg || 'none')}</span></div>
        <pre class="jwt-json">${this._syntaxHighlight(JSON.stringify(headerObj, null, 2))}</pre>
      </div>
      <div class="jwt-section">
        <div class="jwt-section-label">Payload</div>
        ${timeInfo}
        <pre class="jwt-json">${this._syntaxHighlight(JSON.stringify(payloadObj, null, 2))}</pre>
      </div>
      <div class="jwt-section">
        <div class="jwt-section-label">Signature</div>
        <div class="jwt-signature">${this._escape(parts[2])}</div>
      </div>
    `;

    this._validateSignature();
  },

  async _validateSignature() {
    const token = this._input.value.trim();
    const secret = this._secret.value;

    if (!token || !secret) {
      const existing = this._status.querySelector('.jwt-sig-result');
      if (existing) existing.remove();
      return;
    }

    const parts = token.split('.');
    if (parts.length !== 3) return;

    let headerObj;
    try {
      headerObj = JSON.parse(this._decodePart(parts[0]));
    } catch {
      return;
    }

    const alg = headerObj.alg;

    let valid = false;
    let error = '';

    try {
      if (alg.startsWith('HS')) {
        valid = await this._verifyHMAC(parts, alg, secret);
      } else if (alg === 'none') {
        valid = true;
        error = 'Algorithm is "none" — no signature to verify';
      } else if (alg.startsWith('RS') || alg.startsWith('PS')) {
        valid = await this._verifyRSA(parts, alg, secret);
      } else {
        error = `Unsupported algorithm: ${alg}`;
      }
    } catch (e) {
      error = e.message;
    }

    const existing = this._status.querySelector('.jwt-sig-result');
    if (existing) existing.remove();

    const el = document.createElement('div');
    el.className = 'jwt-sig-result';
    if (error) {
      el.innerHTML = `<span class="jwt-sig-warn">${this._escape(error)}</span>`;
    } else if (valid) {
      el.innerHTML = '<span class="jwt-sig-valid">Signature VALID</span>';
    } else {
      el.innerHTML = '<span class="jwt-sig-invalid">Signature INVALID</span>';
    }
    this._status.appendChild(el);
  },

  async _verifyHMAC(parts, alg, secret) {
    const hashMap = { HS256: 'SHA-256', HS384: 'SHA-384', HS512: 'SHA-512' };
    const hash = hashMap[alg];
    if (!hash) throw new Error('Unknown HMAC algorithm');

    const key = await crypto.subtle.importKey(
      'raw',
      new TextEncoder().encode(secret),
      { name: 'HMAC', hash },
      false,
      ['sign']
    );

    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const sig = await crypto.subtle.sign('HMAC', key, data);
    const sigB64 = this._arrayBufferToBase64url(sig);

    return sigB64 === parts[2];
  },

  async _verifyRSA(parts, alg, pem) {
    const cleaned = pem
      .replace(/-----BEGIN (PUBLIC KEY|PRIVATE KEY)-----/g, '')
      .replace(/-----END (PUBLIC KEY|PRIVATE KEY)-----/g, '')
      .replace(/\s/g, '');

    let keyData;
    try {
      keyData = this._base64ToArrayBuffer(cleaned);
    } catch {
      throw new Error('Invalid PEM key format');
    }

    const hashMap = { RS256: 'SHA-256', RS384: 'SHA-384', RS512: 'SHA-512', PS256: 'SHA-256', PS384: 'SHA-384', PS512: 'SHA-512' };
    const hash = hashMap[alg];
    const isPSS = alg.startsWith('PS');

    let key;
    try {
      key = await crypto.subtle.importKey(
        'spki',
        keyData,
        isPSS
          ? { name: 'RSA-PSS', hash }
          : { name: 'RSASSA-PKCS1-v1_5', hash },
        false,
        ['verify']
      );
    } catch {
      throw new Error('Failed to import RSA key (must be SPKI public key)');
    }

    const data = new TextEncoder().encode(parts[0] + '.' + parts[1]);
    const sig = this._base64urlToArrayBuffer(parts[2]);

    const algo = isPSS
      ? { name: 'RSA-PSS', saltLength: 32 }
      : { name: 'RSASSA-PKCS1-v1_5' };

    return crypto.subtle.verify(algo, key, sig, data);
  },

  _decodePart(str) {
    try {
      const padded = str + '='.repeat((4 - str.length % 4) % 4);
      const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
      return decodeURIComponent(
        [...binary].map(c => '%' + c.charCodeAt(0).toString(16).padStart(2, '0')).join('')
      );
    } catch {
      return null;
    }
  },

  _base64urlToArrayBuffer(str) {
    const padded = str + '='.repeat((4 - str.length % 4) % 4);
    const binary = atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf.buffer;
  },

  _base64ToArrayBuffer(str) {
    const binary = atob(str);
    const buf = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) buf[i] = binary.charCodeAt(i);
    return buf.buffer;
  },

  _arrayBufferToBase64url(buffer) {
    const bytes = new Uint8Array(buffer);
    let binary = '';
    for (const b of bytes) binary += String.fromCharCode(b);
    return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  },

  _formatTime(ts) {
    return new Date(ts * 1000).toLocaleString();
  },

  _relativeTime(ts, now) {
    const diff = ts - now;
    const abs = Math.abs(diff);
    if (abs < 60) return diff > 0 ? 'in a few seconds' : 'a few seconds';
    if (abs < 3600) {
      const m = Math.round(abs / 60);
      return diff > 0 ? `in ${m}m` : `${m}m`;
    }
    if (abs < 86400) {
      const h = Math.round(abs / 3600);
      return diff > 0 ? `in ${h}h` : `${h}h`;
    }
    const d = Math.round(abs / 86400);
    return diff > 0 ? `in ${d}d` : `${d}d`;
  },

  _syntaxHighlight(json) {
    return this._escape(json).replace(
      /("(\\u[\da-fA-F]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g,
      (match) => {
        let cls = 'jwt-num';
        if (/^"/.test(match)) {
          cls = /:$/.test(match) ? 'jwt-key' : 'jwt-str';
        } else if (/true|false/.test(match)) {
          cls = 'jwt-bool';
        } else if (/null/.test(match)) {
          cls = 'jwt-null';
        }
        return `<span class="${cls}">${match}</span>`;
      }
    );
  },

  _clear() {
    this._input.value = '';
    this._secret.value = '';
    this._output.innerHTML = '';
    this._status.innerHTML = '';
    this._input.focus();
  },

  _escape(str) {
    const d = document.createElement('div');
    d.textContent = str;
    return d.innerHTML;
  }
};
