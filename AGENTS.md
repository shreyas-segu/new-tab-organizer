# AGENTS.md

## Project Overview

Chrome Extension (Manifest V3) that replaces the new tab page with a keyboard-driven bookmark organizer and Eisenhower matrix. Vanilla JavaScript, zero dependencies, no build step.

## Build / Run / Test Commands

| Task | Command |
|---|---|
| **Load extension** | Open `chrome://extensions`, enable Developer Mode, click "Load unpacked", select project root |
| **Reload after changes** | Click refresh icon on the extension card in `chrome://extensions` |
| **Open DevTools** | Right-click new tab page → Inspect |
| **Run tests** | **None exist.** No test framework is installed. |
| **Lint** | **None exist.** No linter is installed. |
| **Format** | **None exist.** No formatter is installed. |

There is no `package.json`, no `node_modules`, no bundler, and no compilation step. All JS files are loaded directly via `<script>` tags in `index.html`.

## Architecture

The codebase uses **global singleton objects** as modules — no ES modules, no classes, no framework:

| Singleton | File | Responsibility |
|---|---|---|
| `Util` | `utils.js` | Shared helpers: HTML escaping, platform detection, URL opening. Also hosts reserved-key list and shared id generator (`Util.id`) |
| `Toast` | `utils.js` | Undo/notification toasts (delete actions are undoable for 5s) |
| `DB` | `storage.js` | `chrome.storage.local` abstraction with in-memory cache, schema versioning/migration, keybinding validation |
| `Keys` | `keybindings.js` | Vim-style keybinding system, two-key combos (only buffered when a combo prefix is registered), pending key display |
| `Bookmarks` | `bookmarks.js` | Bookmark rendering, CRUD, keyboard navigation, reordering/moving, drag & drop |
| `Eisenhower` | `eisenhower.js` | Eisenhower matrix UI, CRUD, keyboard handling, drag & drop between quadrants |
| `JWT` | `jwt.js` | JWT decode + signature verification (HS*, RS*, PS*, ES*) |
| `Generator` | `generator.js` | Random test data generation |
| `UrlCodec` | `urlcodec.js` | URL encode/decode tool |
| `Palette` | `palette.js` | Command palette UI and fuzzy matching |
| `QuickOpen` | `quickopen.js` | Quick Open modal (`o` key): regex rules → URL templates (Jira issues, GitHub repos) |
| `Notes` | `notes.js` | Daily notes tool: markdown-as-source-of-truth journal in **LogSeq's native format** (top-level `- ## Section` items, `\t- ` child bullets) with four sections (Daily Log, Tasks, Meetings, Follow-ups), quick-capture bar (plain → log, `x` → tasks, `@` → meetings, `+` → follow-ups), day navigation, carry-over of previous day's follow-up bullets, standup summary generator + Jira-key extraction, one-way LogSeq sync via File System Access API (directory handle persisted in IndexedDB; manual Sync button pulls the journal file whole-file with undo toast — last action wins, no merge; pull saves local state without pushing first and waits out any in-flight flush) |
| `App` | `app.js` | Theme, settings modal, workspace switching, tool tabs, quick open rules editor, global key routing |

Load order matters — each module depends on globals from scripts loaded before it (defined in `index.html`):
`utils.js` → `storage.js` → `keybindings.js` → `bookmarks.js` → `eisenhower.js` → `jwt.js` → `generator.js` → `urlcodec.js` → `palette.js` → `quickopen.js` → `notes.js` → `app.js`

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
Use direct DOM manipulation with `innerHTML` + template literals. Always escape user content with `Util.escape()`:
```js
container.innerHTML = items.map(item => `
  <div class="item">${Util.escape(item.name)}</div>
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

Manifest V3 (`manifest.json`). Permissions: `storage`, `favicon`. Icons in `icons/` (16, 48, 128px). No content scripts, no background service worker.

## Key Constraints

- **No build step** — changes are loaded directly by Chrome
- **No dependencies** — do not introduce npm packages or external scripts
- **Global module pattern** — do not refactor to ES modules or classes
- **Cache-busting** — script tags in `index.html` use `?v=N` query strings; increment when adding new files
- **XSS prevention** — always use `Util.escape()` for any user-provided string rendered as HTML (it escapes quotes too, safe inside attributes)

## Reordering / Moving Items

- Bookmarks: `Shift+↑/↓` moves the selected item within its container (spilling into the adjacent folder at boundaries); `Shift+←/→` moves it between folders/root. Folders reorder via `Shift+←/→` when a folder header is selected.
- Everything is also drag & drop-able: bookmark items, folder headers, and matrix items (matrix items can be dropped into any quadrant at any position).
- All mutations go through `DB` methods (`moveBookmark`, `reorderBookmark`, `moveFolder`, `moveMatrixItem`, `reorderMatrixItem`), followed by `App.refresh()`.
