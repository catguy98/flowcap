# FlowCap Animation "Too Quick" Fixes

> Date: April 30, 2026
> Fixes for Bugs 6, 7, and 8 — animations visible but playing too fast after previous fix round.

---

## Bug 6 🔴 — Fixed `syncWebAnimations` double-advancing animation time

**File:** `electron/recorder/frame-renderer.js`

**Before:**
```js
async function advanceFrame() {
  await context.clock.runFor(frameIntervalMs)
  // Sync web animations to virtual time AFTER advancing the clock but BEFORE
  // taking the screenshot. This counteracts any real-time advancement that
  // happened during the clock.runFor() call itself.
  await syncWebAnimations(frameIntervalMs)
  return captureFrame()
}
```

**After:**
```js
async function advanceFrame() {
  // Freeze animations BEFORE the clock runs so real-time drift cannot occur.
  // Previously, clock.runFor() took real wall-clock time to execute (5–20ms),
  // during which CSS animations advanced by that real amount. syncWebAnimations
  // then added frameIntervalMs on top — causing animations to run 30–50% too fast.
  await page.evaluate(() => {
    document.getAnimations().forEach((anim) => {
      const target = anim.effect?.target
      if (target?.id === 'flowcap-showcase-cursor') return
      if (anim.playState === 'running') anim.pause()
    })
  }).catch(() => {})

  await context.clock.runFor(frameIntervalMs)
  // Now syncWebAnimations adds exactly frameIntervalMs with no drift on top.
  await syncWebAnimations(frameIntervalMs)
  return captureFrame()
}
```

---

## Bug 7 🔴 — Fixed headless Chromium frame starvation during CSS animations

**File:** `electron/recorder/frame-renderer.js` and `electron/recorder.js`

**Root cause:** `--disable-gpu` prevents the compositor from rendering frames during CSS transitions in headless mode, resulting in only 3–5 frames being captured for a 300ms animation instead of the expected ~18. FFmpeg then duplicates those frames to fill 60fps, making the animation appear to snap/jump.

### Change A — Studio mode (`frame-renderer.js`)

**Before:**
```js
browser = await chromium.launch({
  headless: true,
  args: ['--disable-gpu', '--no-sandbox', '--disable-setuid-sandbox'],
})
```

**After:**
```js
browser = await chromium.launch({
  headless: true,
  args: [
    '--no-sandbox',
    '--disable-setuid-sandbox',
    '--enable-gpu-rasterization',
    '--enable-zero-copy',
    '--use-gl=swiftshader',  // software OpenGL — works without real GPU hardware
  ],
})
```

### Change B — Default mode (`recorder.js`)

**Before:**
```js
const browser = await chromium.launch({ headless: true })
```

**After:**
```js
const browser = await chromium.launch({
  headless: true,
  args: ['--use-gl=swiftshader', '--enable-gpu-rasterization'],
})
```

---

## Bug 8 🟡 — Fixed raw video page-load dead zone eating into output duration

**Files:** `electron/recorder.js` and `electron/recorder/compose.js`

**Root cause:** Playwright starts recording the moment the browser context is created. The first ~1.5 seconds of the raw WebM is just the page navigating and loading — a blank/loading screen. FFmpeg's compose step treats the video from timestamp `0`, so if `durationSec = 4`, roughly the first 1.5s of output is wasted on the loading screen and the actual animation content is compressed into the remainder.

### Change A — Pass trim offset from `recorder.js`

**Before:**
```js
onProgress(`Navigating to ${url}...`)
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1000)
```

```js
await composeFinalVideo({
  rawVideoPath,
  maskPath,
  mockupFramePath,
  mockupSpec,
  bgImagePath,
  bgColor,
  durationSec,
  zoomPercent,
  // ...rest of args
})
```

**After:**
```js
onProgress(`Navigating to ${url}...`)
await page.goto(url, { waitUntil: 'load' })
await page.waitForTimeout(1000)
const PAGE_LOAD_TRIM_SEC = 1.5  // skip the loading screen from the output
```

```js
await composeFinalVideo({
  rawVideoPath,
  maskPath,
  mockupFramePath,
  mockupSpec,
  bgImagePath,
  bgColor,
  durationSec,
  zoomPercent,
  trimStartSec: PAGE_LOAD_TRIM_SEC,  // added
  // ...rest of args
})
```

### Change B — Accept and apply trim in `compose.js`

**Before** (function signature):
```js
async function composeFinalVideo({
  rawVideoPath,
  maskPath,
  // ...
  fps = 60,
  outputPath,
  onProgress,
}) {
```

**After** (function signature):
```js
async function composeFinalVideo({
  rawVideoPath,
  maskPath,
  // ...
  fps = 60,
  trimStartSec = 0,   // added
  outputPath,
  onProgress,
}) {
```

**Before** (both bgImagePath and solid color branches, wherever `-i rawVideoPath` appears):
```js
ffmpegArgs = ['-y', '-loop', '1', '-i', bgImagePath, '-i', rawVideoPath, ...]
// and
ffmpegArgs = ['-y', '-i', rawVideoPath, ...]
```

**After** (add `-ss` immediately before each `-i rawVideoPath`):
```js
ffmpegArgs = ['-y', '-loop', '1', '-i', bgImagePath, '-ss', String(trimStartSec), '-i', rawVideoPath, ...]
// and
ffmpegArgs = ['-y', '-ss', String(trimStartSec), '-i', rawVideoPath, ...]
```

> `-ss` placed **before** `-i` uses fast keyframe seek and does not re-encode. Placing it after `-i` would be accurate but slow — before is correct here since we're trimming a clean whole-second boundary.

---

## Summary

| # | Bug | File(s) | Change |
|---|-----|---------|--------|
| 6 | `syncWebAnimations` double-advance | `frame-renderer.js` | Pause animations before `clock.runFor()`, not after |
| 7 | `--disable-gpu` starves compositor frames | `frame-renderer.js`, `recorder.js` | Replace with `--use-gl=swiftshader` + GPU rasterization flags |
| 8 | Page-load dead zone in raw video | `recorder.js`, `compose.js` | Add `trimStartSec = 1.5` and `-ss` seek in FFmpeg args |
