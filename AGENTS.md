# AGENTS.md

## Project Overview

Chrome Extension (Manifest V3) that replaces the new tab page with a keyboard-driven bookmark organizer and Eisenhower matrix. Vanilla JavaScript, zero dependencies, no build step.

## Build / Run / Test Commands

| Task | Command |
|---|---|
| **Load extension** | Open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select project root |
| **Reload after changes** | Click refresh icon on the extension card in `chrome://extensions` |
| **Open DevTools** | Right-click new tab page → Inspect, or go to `chrome://extensions` → "Inspect views: background page" for service worker |
| **Run tests** | **None exist.** No test framework is installed. |
| **Lint** | **None exist.** No linter is installed. |
| **Format** | **None exist.** No formatter is installed. |

There is no `package.json`, no `node_modules`, no bundler, and no compilation step. All JS files are loaded directly via `<script>` tags in `index.html`.

## Architecture

The codebase uses **global singleton objects** as modules — no ES modules, no classes, no framework:

| Singleton | File | Responsibility |
|---|---|---|
| `DB` | `storage.js` | `chrome.storage.local` abstraction with in-memory cache |
| `Keys` | `keybindings.js` | Vim-style keybinding system, two-key combos, pending key display |
| `Bookmarks` | `bookmarks.js` | Bookmark rendering, CRUD, keyboard navigation |
| `Eisenhower` | `eisenhower.js` | Eisenhower matrix UI, CRUD, keyboard handling |
| `App` | `app.js` | Theme, settings modal, workspace switching, command palette |

Load order matters — each module depends on globals from scripts loaded before it (defined in `index.html`):
`storage.js` → `keybindings.js` → `bookmarks.js` → `eisenhower.js` → `app.js`

All modules communicate through global scope. Do not add `import`/`export` statements.

## Code Style

### Naming
- **Public methods**: `camelCase` — `render()`, `handleKey()`, `showAdd()`
- **Private methods**: `_camelCase` (underscore prefix) — `_renderItem()`, `_bindEvents()`, `_escape()`
- **Private properties**: `_camelCase` — `_cache`, `_selected`, `_currentTool`
- **Constants**: `_UPPER_SNAKE_CASE` — `_RESERVED`, `_PENDING_TIMEOUT`
- **Module names**: PascalCase — `App`, `DB`, `Bookmarks`
- **CSS classes**: `kebab-case` — `bookmark-item`, `folder-group-header`
- **HTML IDs**: `kebab-case` — `bookmarks-list`, `modal-overlay`

### Modules
Define modules as plain object literals with methods and state:
```js
const MyModule = {
  _state: null,

  async init() { /* ... */ },

  _helper() { /* ... */ },
};
```
Do not use classes, ES modules, or CommonJS. Everything is a global.

### Async / Storage
All Chrome storage operations use `async/await` through the `DB` helper:
```js
const data = await DB.get();
data.items.push(newItem);
await DB.save(data);
```

### DOM Manipulation
Use direct DOM manipulation with `innerHTML` + template literals. Always escape user content with `_escape()`:
```js
container.innerHTML = items.map(item => `
  <div class="item">${this._escape(item.name)}</div>
`).join('');
```

### Error Handling
Use `try/catch` sparingly — primarily for URL validation and external API calls:
```js
try {
  new URL(fullUrl);
} catch {
  urlInput.focus();
  showError('Invalid URL');
  return;
}
```

### Event Handling
Bind events directly in module methods with `addEventListener`. Query elements by ID or data attributes:
```js
document.getElementById('settings-btn').addEventListener('click', () => this._showSettings());
```

### Comments
Use comments sparingly — only for section headers within large modules (e.g., `// --- Theme ---`). Do not add JSDoc or inline comments for obvious code.

## Styling (CSS)

- Single stylesheet: `styles.css`
- Uses CSS custom properties for theming (Gruvbox color scheme)
- Theme variants: `dark`, `light`, `system` — toggled via `data-theme` attribute on `<html>`
- Font stack: `SF Mono`, `Cascadia Code`, `JetBrains Mono`, `Fira Code` (monospace)
- User-overridable CSS via `#custom-css` style element

## Extension Manifest

Manifest V3 (`manifest.json`). Only permission is `storage`. Icons in `icons/` (16, 48, 128px). No content scripts. Background is a minimal service worker (`background.js`).

## Key Constraints

- **No build step** — changes are loaded directly by Chrome
- **No dependencies** — do not introduce npm packages or external scripts
- **Global module pattern** — do not refactor to ES modules or classes
- **Cache-busting** — script tags in `index.html` use `?v=N` query strings; increment when adding new files
- **XSS prevention** — always use `_escape()` for any user-provided string rendered as HTML
