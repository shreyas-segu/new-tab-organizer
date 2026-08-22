# New Tab Organizer

A keyboard-driven bookmark organizer and Eisenhower matrix for Chrome.

## Features

- **Bookmarks** with folders, auto-suggested two-key keybindings, and drag & drop or `Shift+Arrow` reordering
- **Eisenhower matrix** for tasks with due dates, cross-quadrant drag & drop, and keyboard navigation
- **Quick Open** (`o`) — type `PROJ-123` or `owner/repo` and jump straight to your Jira instance / GitHub. Fully configurable with regex rules in Settings (each rule maps a pattern to a URL template containing `{query}`)
- **Daily notes** (`t`) — markdown-first journal per day with four sections: Daily Log, Tasks, Meetings, Follow-ups. Quick-capture bar routes by prefix: plain text → daily log, `x` → tasks, `@` → meetings (timestamped), `+` → follow-ups. Open follow-ups carry over to the next day automatically. **Standup button** generates a copy-paste summary of the **previous work day** (most recent day with notes) and lists every Jira issue key touched (click to copy). Notes are plain markdown (`[[wiki-links]]`, `#tags` work in LogSeq exports)
- **LogSeq sync** — connect a folder in Settings and every save is pushed one-way to `journals/YYYY_MM_DD.md` inside it, written in LogSeq's native list format so files render and round-trip perfectly. The **Sync button** in the notes panel pulls the journal file for the viewed day verbatim, replacing local content (with a 5-second undo). The folder handle persists across sessions (reconnect if Chrome drops permission)
- **Command palette** (`Ctrl/⌘+K`) with fuzzy search over all actions, bookmarks, and tasks
- **JWT decoder** — decode payloads and verify HS*/RS*/PS*/ES* signatures
- **Test data generator** — emails (with Mailinator inbox links), names, UUIDs, CUIDs; click to copy
- **URL encode/decode** tool
- **Workspaces** — multiple bookmark sets switchable by number key; double-click to rename, right-click to delete (with undo)
- **Themes** — dark/light/system plus user-defined custom CSS
- Everything deletes are undoable via toast for 5 seconds

## Keyboard shortcuts

| Key | Action |
|---|---|
| `n` / `f` | New bookmark / folder |
| `e` / `d` | Edit / delete selection |
| `Tab` / `Shift+Tab` | Select next / previous item |
| `Enter` | Open selected bookmark / toggle task |
| `Shift+↑↓` | Move item within its container |
| `Shift+←→` | Move item between folders/quadrants |
| `o` | Quick Open — Jira issue, GitHub repo, etc. |
| `m` / `t` / `j` / `g` / `u` | Switch tool panel |
| `Ctrl/⌘+K` | Command palette |
| `?` | Full shortcut help |

## Installation

1. Open Chrome and navigate to `chrome://extensions`
2. Enable **Developer mode** (toggle in top-right corner)
3. Click **Load unpacked**
4. Select the project root folder (where this README is located)

## Reload After Changes

After editing any source files, click the refresh icon on the extension card in `chrome://extensions` to reload.

## Theme Customization

Open the settings (gear icon or press `?`) to switch between built-in themes (dark/light/system).

### Catppuccin Mocha Override

To override the theme with Catppuccin Mocha, add this to **Custom CSS** in settings:

```css
:root {
  /* Catppuccin Mocha */
  --bg: #1e1e2e;
  --bg0: #181825;
  --bg0-hard: #11111b;
  --bg1: #313244;
  --bg2: #45475a;
  --bg3: #585b70;
  --fg: #cdd6f4;
  --fg0: #a6adc8;
  --fg1: #cdd6f4;
  --fg2: #bac2de;
  --fg3: #a6adc8;
  --fg4: #9399b2;
  --red: #f38ba8;
  --green: #a6e3a1;
  --yellow: #f9e2af;
  --blue: #89b4fa;
  --purple: #cba6f7;
  --aqua: #94e2d5;
  --orange: #fab387;
  --gray: #6c7086;
}

[data-theme='light'] {
  /* Catppuccin Latte */
  --bg: #eff1f5;
  --bg0: #e6e9ef;
  --bg0-hard: #dce0e8;
  --bg1: #ccd0da;
  --bg2: #bcc0cc;
  --bg3: #acb0be;
  --fg: #4c4f69;
  --fg0: #5c5f77;
  --fg1: #4c4f69;
  --fg2: #5c5f77;
  --fg3: #6c6f85;
  --fg4: #7c7f99;
  --red: #d20f39;
  --green: #40a02b;
  --yellow: #df8e1d;
  --blue: #1e66f5;
  --purple: #8839ef;
  --aqua: #179299;
  --orange: #fe640b;
  --gray: #9ca0b0;
}
```

Save and the theme will apply immediately.
