# New Tab Organizer

A keyboard-driven bookmark organizer and Eisenhower matrix for Chrome.

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
