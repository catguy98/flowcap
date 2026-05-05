# MEMORY — FlowCap Project Rules & Context

> **Read this file at the start of EVERY task. All rules are mandatory.**

---

## 🔴 RULES (NEVER VIOLATE)

1. **NEVER `git push` unless the user explicitly says to push.** Save files, commit only if asked, but never push without permission.
2. **NEVER stack multiple delays.** If the user says "1-2 seconds per step", that means the TOTAL pause per step is 1-2s — not each individual delay. Always think about what adds up before changing timing.
3. **1 second = 1000ms. 2 seconds = 2000ms.** Never confuse these. 200ms is 0.2 seconds, NOT 2 seconds.
4. **Clarify before assuming.** If a request is ambiguous, ask once. Don't guess and redo it 3 times.
5. **One change at a time.** Make the change, show the result, wait for feedback. Don't chain 5 edits and push them all.
6. **Don't over-engineer.** If the user asks for a simple timing change, change the timing. Don't restructure architecture.
7. **NEVER lie or give misinformation.** If you haven't read the file, say so. Never claim "it's already off" or "no change needed" without verifying by actually reading the relevant code. If you're unsure, read the file first.
8. **Always bring evidence.** Before stating any fact about the codebase ("X is already off by default", "Y has no delay"), use `read_file` or `search_files` to prove it. Show the user the exact line(s).
9. **"No changes" means NO changes.** When the user says "no changes, let me know if you understood", just confirm understanding. Do NOT make any edits. Wait for explicit permission like "now apply" before touching files.
10. **Know which mode you're editing.** The project has TWO recording modes — Realtime (`step-runner.js`) and Studio (`frame-renderer.js`). Before making any timing/recording change, confirm which file(s) need editing. If unsure, ask. Editing the wrong file = wasted time.
11. **Test your assumptions.** If you think a fix "should work" but the user says it doesn't — stop and re-investigate immediately. Don't repeat the same approach. The problem is almost certainly in a different file than you think.
12. **Read before referencing.** When the user asks about a specific file or feature, read it fresh. Don't rely on memory from a previous task — code may have changed.
13. **Own your mistakes.** When called out, acknowledge directly. Don't deflect or re-explain. Fix it and move on.

---

## 📁 PROJECT STRUCTURE

```
video-recorder/
├── package.json              # Electron app ("video-recorder"), start: "electron ."
├── icon.ico                  # App icon
├── cursor.svg                # Cursor SVG asset
├── Pointer.svg               # Pointer cursor SVG
│
├── electron/
│   ├── main.js               # Electron main process — BrowserWindow, IPC handlers
│   ├── preload.js            # Preload script — exposes safe IPC API to renderer
│   ├── recorder.js           # Recording orchestrator (realtime Playwright mode)
│   └── recorder/
│       ├── step-runner.js    # Step execution for realtime mode (click, type, hover, scroll, zoom)
│       ├── frame-renderer.js # Studio mode — CDP screencast capture, frame-by-frame rendering
│       ├── cursor.js         # Showcase cursor — bezier paths, human-like movement, overshoot, jitter
│       ├── motion.js         # Motion timeline — content zoom, pan animations via CSS transforms
│       ├── compose.js        # FFmpeg composition — rounded mask, mockup overlay, camera zoom, final encode
│       ├── mockups.js        # Device mockup frame generation (browser, phone)
│       ├── analyzer.js       # URL/page analyzer — detects clickable/typeable targets
│       ├── preview.js        # Preview state renderer — renders a specific point in the flow
│       ├── timing.js         # Timing utilities
│       └── utils.js          # Shared utilities (clamp, etc.)
│
├── src/
│   ├── index.html            # Renderer HTML — the full FlowCap UI
│   ├── index.css             # Renderer styles (dark theme)
│   ├── app.mjs               # Main renderer logic — wires UI to IPC, manages state
│   ├── core/
│   │   └── flow-timing.mjs   # Derives motion keyframes from steps, calculates flow duration
│   ├── runtime/
│   │   └── live-preview.mjs  # Live preview controller — connects to iframe, sends motion commands
│   └── ui/
│       ├── elements.mjs      # DOM element references (all UI inputs, buttons, containers)
│       ├── steps.mjs         # Step renderer — renders/editable flow step list
│       ├── preview.mjs       # Preview renderer — renders preview snapshot/live frame
│       ├── motion-editor.mjs # Motion keyframe editor — timeline, inspector, keyframe CRUD
│       └── (any future UI modules)
│
├── demo-app/
│   ├── index.html            # Demo app for testing recordings
│   ├── script.js
│   └── style.css
│
└── projects/                 # Saved flow JSON files (url-slug/flow.json)
```

---

## 🧠 ARCHITECTURE

### What is FlowCap?
FlowCap is an Electron desktop app that records high-quality videos of web app interactions. It automates a browser to perform clicks, typing, scrolling, and zooming, while capturing the result as a polished MP4 video with optional device mockups, rounded corners, background colors/images, and cinematic camera movement.

### Two Recording Modes

#### 1. Realtime Mode (`recorder.js` → `step-runner.js` → `cursor.js`)
- Uses Playwright's built-in video recording (`record_video` context option)
- Steps executed via `executeStep()` in step-runner.js
- Cursor moved via `moveShowcaseCursorToLocator()` in cursor.js
- Records at natural speed — every action plays in real time
- Post-processing: trim start (PAGE_LOAD_TRIM_SEC), create rounded mask, add mockup frame, apply camera zoom, compose via FFmpeg

#### 2. Studio Mode (`frame-renderer.js`)
- Uses Chrome DevTools Protocol `Page.startScreencast` to capture every compositor frame as PNG
- Steps executed via `executeRealtimeStep()` in frame-renderer.js (has its own cursor movement logic)
- Runs at natural speed but captures every rendered frame
- Frame padding fills gaps during static pauses (duplicate last frame to match wall-clock time)
- Encoded via FFmpeg with optional motion blur (tmix filter), then composed same as realtime mode
- Slower but higher quality — better for publishing

### Cursor System (`cursor.js`)
- Human-like cursor movement using bezier curves with perpendicular arc
- Speed-based timing: `cursor.speed` = pixels/second (default 450)
- Organic effects: jitter (fbm noise), arrival tremor, overshoot (40% chance), post-landing vibration
- Dynamic cursor types: dot (default), arrow, pointer (auto-switches over clickable elements)
- Click pulse animation

### Motion System (`motion.js`)
- CSS transform-based zoom and pan
- Content zoom: scales content around a specific element
- Global zoom: scales the entire viewport
- Easing: cubic-bezier for smooth transitions

### Composition Pipeline (`compose.js`)
- FFmpeg-based post-processing
- Steps: raw video → rounded corner mask → mockup overlay → camera zoom → background color/image → final MP4
- Quality presets: standard, high, ultra (affects CRF and encoding speed)
- Camera zoom: eases in over `cameraZoomDurationMs`, then holds

### UI Architecture (`src/`)
- Single-page app with three panels: sidebar (config), center (flow steps + motion preview), right (record + log)
- Two tabs: "Flow Steps" (edit steps) and "Motion" (keyframe editor with live preview)
- Live preview: renders the target app in an iframe, sends motion commands via bridge
- Fallback preview: screenshots via Playwright if iframe bridge not available

---

## ⏱️ TIMING & DELAYS

### Current Per-Step Breakdown (Studio Mode — `frame-renderer.js`)
- **waitForStableLocatorRealtime**: up to 400ms (wait for element to stop moving)
- **Cursor movement**: 150-1700ms (distance-based, capped at 1500ms + overshoot/vibration)
- **80ms** cursor type switch (negligible)
- **Inter-step pause**: 200-400ms (brief pause between steps)
- **Total per step**: ~800-2500ms

### Current Per-Step Breakdown (Realtime Mode — `step-runner.js` + `cursor.js`)
- **waitForStableLocator**: up to 1400ms (wait for element to stop moving)
- **Cursor movement**: 100-1630ms (distance-based, capped at 1500ms in cursor.js + 130ms vibration)
- **No second waitForStableLocator** (removed — was 900ms stacked wait)
- **No post-click settle** (removed — was 400ms stacked wait)
- **No inter-step pause** (steps execute back-to-back)
- **Total per click step**: ~1500-3030ms (cursor movement IS the action, not extra delay)

### Timing Math Reference
```
100ms  = 0.1 seconds
200ms  = 0.2 seconds
500ms  = 0.5 seconds
1000ms = 1 second
2000ms = 2 seconds
```

### How to add a 1-2s delay
```js
await page.waitForTimeout(1000 + Math.round(Math.random() * 1000))
// This is 1 to 2 seconds. NOT 200ms.
```

---

## 🔧 IPC API (`preload.js`)

The renderer (`src/app.mjs`) communicates with the main process via these IPC channels:
- `start-recording` — starts recording with all config, returns `{ success, outputPath }`
- `analyze-url` — analyzes a URL, returns detected targets and suggested steps
- `render-preview-state` — renders a preview screenshot at a specific time
- `select-image` — file dialog for background image
- `select-html-file` — file dialog for HTML files
- `select-flow-file` — file dialog for flow JSON files
- `save-flow` / `load-flow` — save/load flow definitions to/from `projects/` dir
- `open-file` — opens a file with the system default app
- `close-window` / `minimize-window` / `toggle-maximize-window` — window controls

Progress updates are sent from main→renderer via `recording-progress` channel.

---

## 📝 USER PREFERENCES

- Language: English
- Prefers direct action, minimal back-and-forth
- Wants clean, simple solutions — not over-engineered ones
- Does NOT want auto-push to git — save locally only
- When told "1-2 seconds", that means TOTAL per step, not per individual pause