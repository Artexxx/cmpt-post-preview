# Post Previews (Hugo) — Internal Page Popups

A small component for the Hugo FixIt theme that shows a popup preview for **internal blog pages only** (same-origin HTML pages). It is designed to be fast, safe, and non-intrusive.

## Features

- Internal links only (same origin)
- Ignores assets and files (images, PDFs, archives, etc.)
- Disabled on mobile/touch devices
- Disabled on home page by default
- Disabled inside a configurable container selector (useful for post lists with built-in previews)
- No recursion: it never runs inside iframes and never triggers on links inside the popup
- Deferred loading: CSS and JS are injected **only after `window.load`**
- “Crop top” behavior: the iframe view is shifted up by `cropTopPx` to hide the theme header without removing it (prevents layout jumps)
- Optional debug logs


## Requirements

- FixIt v0.4.0 or later.

## Install Component

The installation method is the same as [installing a theme](https://fixit.lruihao.cn/documentation/installation/). There are several ways to install, choose one, for example, install through Hugo Modules:

```diff
[module]
  [[module.imports]]
    path = "github.com/hugo-fixit/FixIt"
+ [[module.imports]]
+   path = "github.com/Artexxx/cmpt-post-preview"
```

## Configuration

In order to Inject the partial `cmpt-post-preview.html` into the `custom-head` through the [custom block](https://fixit.lruihao.cn/references/blocks/) opened by the FixIt theme in the `layouts/_partials/custom.html` file, you need to fill in the following necessary configurations:

```toml
[params]
  [params.customPartials]
    # ... other partials
    head = [ "inject/cmpt-post-preview.html" ]
    # ... other partials
```

## Configuration

All options live under `[linkPreviews]`.

Common options:
- `enable` (bool): master switch
- `disableOnHome` (bool): disable on `/` and `/<lang>/`
- `excludeSelector` (string): do not activate within this container
- `mobileBp` (int): disable if viewport width is <= this breakpoint
- `cropTopPx` (int): visually hide the top part of iframe content
- `maxWidthPx`, `maxHeightPx`, `maxHeightVh`, `minWidthPx`, `minHeightPx`: popup size constraints
- `showDelay`, `hideDelay`: hover delays
- `debug` (bool): console logs

CDN settings:
- `tippyCss`, `tippyAnimCss`, `tippyJs`

in config/_default/params.toml:

```toml
[params.postPreview]
# Master switch for the component
enable = true
# Enables console logs: [post-preview] ...
debug = false
# Disable previews on small viewports (also disabled on touch devices via media queries in JS)
mobileBp = 900
# Disable previews on the home page ("/" and "/<lang>/", e.g. "/en/")
disableOnHome = true
# Disable previews for links inside this container (useful for post lists with built-in previews)
excludeSelector = "body > div.wrapper > main > div"
# Hover delay before showing the popup (ms)
showDelay = 120
# Delay before hiding after leaving link+popup (ms)
hideDelay = 220
# Crop top pixels inside iframe to avoid header reflow/jumps
cropTopPx = 60
# If true: load Popper/Tippy from CDN; if false: use bundled assets in the component
tippyFromCdn = false
```

## Notes

- Previews work only for same-origin pages. External sites are intentionally ignored.
- The iframe uses a permissive sandbox for internal pages to preserve FixIt styling and behavior.
- If you want to further exclude areas, adjust `excludeSelector` or add additional selectors in the JS eligibility check.
