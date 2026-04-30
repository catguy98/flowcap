const path = require('path')
const fs = require('fs/promises')
const { installShowcaseCursor } = require('./cursor')
const {
  getLocatorInteractionPoint,
  pulseShowcaseCursor,
} = require('./cursor')
const { installMotionTimeline } = require('./motion')
const { getMockupSpec, createMockupFrame } = require('./mockups')
const {
  createRoundedMask,
  composeFinalVideo,
  cleanupRecordingArtifacts,
  runFfmpeg,
} = require('./compose')

function padFrameNumber(value) {
  return String(value).padStart(6, '0')
}

function getStudioFps(render) {
  const fps = parseInt(render?.fps, 10)
  if (!Number.isFinite(fps)) return 60
  return Math.min(Math.max(fps, 24), 90)
}

function estimateStudioStepDuration(step) {
  switch (step.action) {
    case 'wait':
      return parseInt(step.ms, 10) || 0
    case 'wait_for':
      return 180
    case 'hover':
      return 340
    case 'click':
      return 360
    case 'scroll':
      return 260
    case 'type': {
      const textLength = (step.text || '').length
      const delay = parseInt(step.delay, 10) || 70
      return textLength * Math.max(delay, 30) + 280
    }
    default:
      return 220
  }
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

async function encodeFrameSequence({ framesDir, rawVideoPath, fps, render, onProgress }) {
  const motionBlurRaw = parseInt(render?.motionBlur, 10)
  const blurFrames = Number.isFinite(motionBlurRaw) && motionBlurRaw >= 0
    ? Math.min(motionBlurRaw, 5)
    : 1

  if (blurFrames > 0) {
    // Build weighted tmix: center frame gets highest weight, neighbors taper off
    // e.g. frames=3 -> weights='1 4 1', frames=5 -> weights='1 2 5 2 1'
    const half = Math.floor(blurFrames / 2)
    const weights = []
    for (let i = -half; i <= half; i += 1) {
      weights.push(i === 0 ? String(half * 2 + 1) : '1')
    }
    const weightStr = weights.join(' ')
    const totalFrames = blurFrames * 2 + 1

    onProgress(
      `Encoding Studio frames -> ${fps}fps with motion blur (tmix frames=${totalFrames} weights='${weightStr}')...`,
    )
    await runFfmpeg([
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(framesDir, 'frame_%06d.png'),
      '-vf',
      `tmix=frames=${totalFrames}:weights='${weightStr}'`,
      '-c:v',
      'libx264rgb',
      '-preset',
      'ultrafast',
      '-crf',
      '0',
      '-pix_fmt',
      'rgb24',
      rawVideoPath,
    ])
  } else {
    onProgress(`Encoding Studio frame sequence -> ${fps}fps lossless intermediate...`)
    await runFfmpeg([
      '-y',
      '-framerate',
      String(fps),
      '-i',
      path.join(framesDir, 'frame_%06d.png'),
      '-c:v',
      'libx264rgb',
      '-preset',
      'ultrafast',
      '-crf',
      '0',
      '-pix_fmt',
      'rgb24',
      rawVideoPath,
    ])
  }
}

async function getLocatorTargetPoint(locator) {
  return locator.evaluate((element) => {
    const rect = element.getBoundingClientRect()
    if (!rect || rect.width <= 0 || rect.height <= 0) return null

    const visualControl =
      element.matches('label')
        ? element.querySelector(
          '.privacy-option-control, [data-record-target$="-control"], [role="radio"], [role="checkbox"]',
        )
        : null

    if (visualControl instanceof HTMLElement) {
      const controlRect = visualControl.getBoundingClientRect()
      if (controlRect.width > 0 && controlRect.height > 0) {
        return {
          x: controlRect.x + controlRect.width / 2,
          y: controlRect.y + controlRect.height / 2,
        }
      }
    }

    return {
      x: rect.x + rect.width / 2,
      y: rect.y + rect.height / 2,
    }
  })
}

async function waitForStableLocator(locator, page, timeline, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1200
  const stableMs = options.stableMs ?? 160
  const threshold = options.threshold ?? 0.75
  let elapsed = 0
  let lastBox = null
  let stableFor = 0

  // Use captureFor (not fastForward) so that any ongoing layout animation is
  // recorded frame-by-frame. Previously this used fastForward, silently eating
  // up to 1200ms of animation that the viewer would never see.
  while (elapsed < timeoutMs) {
    const box = await locator.boundingBox().catch(() => null)
    if (!box) {
      stableFor = 0
      lastBox = null
      await timeline.captureFor(50)
      elapsed += 50
      continue
    }

    if (
      lastBox &&
      Math.abs(box.x - lastBox.x) <= threshold &&
      Math.abs(box.y - lastBox.y) <= threshold &&
      Math.abs(box.width - lastBox.width) <= threshold &&
      Math.abs(box.height - lastBox.height) <= threshold
    ) {
      stableFor += 50
      if (stableFor >= stableMs) return box
    } else {
      stableFor = 0
    }

    lastBox = box
    await timeline.captureFor(50)
    elapsed += 50
  }

  return lastBox
}

async function createStudioTimeline({ context, page, framesDir, fps, onProgress }) {
  const frameIntervalMs = 1000 / fps
  let frameIndex = 0

  // Sync ALL active Web Animations (CSS transitions, CSS keyframes, WAAPI, Framer Motion
  // in WAAPI mode) to the virtual clock by pausing them and manually advancing currentTime.
  //
  // Why this is necessary: rAF fires in real-time between our await calls (Playwright wraps
  // it but does not freeze it). Real time leaks into animation timelines, causing CSS
  // transitions and JS animations to race ahead of the virtual frame clock. Without this,
  // a 300ms animation may complete in just 3-4 frames of captured video instead of ~18.
  //
  // We skip the FlowCap cursor element so its click-pulse keyframe still plays correctly.
  async function syncWebAnimations(intervalMs) {
    await page.evaluate((interval) => {
      document.getAnimations().forEach((anim) => {
        // Skip cursor animations — they're intentionally real-time driven
        const target = anim.effect && anim.effect.target
        if (target && target.id === 'flowcap-showcase-cursor') return

        if (anim.playState === 'running') {
          anim.pause()
        }
        if (anim.playState === 'paused') {
          anim.currentTime = (anim.currentTime || 0) + interval
        }
      })
    }, intervalMs).catch(() => {})
  }

  async function captureFrame() {
    frameIndex += 1
    const framePath = path.join(framesDir, `frame_${padFrameNumber(frameIndex)}.png`)
    for (let attempt = 0; attempt < 3; attempt += 1) {
      try {
        await page.screenshot({
          path: framePath,
          scale: 'css',
          animations: 'allow',
          timeout: 15000,
        })
        break
      } catch (err) {
        if (attempt >= 2) throw err
        await context.clock.runFor(80)
        await syncWebAnimations(80)
      }
    }
    if (frameIndex === 1 || frameIndex % fps === 0) {
      onProgress(`Studio frame ${frameIndex}`)
    }
    return true
  }

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

  async function captureFor(durationMs) {
    const frames = Math.max(1, Math.ceil((Number.parseFloat(durationMs) || 0) / frameIntervalMs))
    for (let index = 0; index < frames; index += 1) {
      await advanceFrame()
    }
  }

  async function fastForward(durationMs) {
    // Advance virtual clock without capturing frames.
    await context.clock.runFor(durationMs)
    // Still sync animations so they don't drift ahead during skipped time.
    await syncWebAnimations(durationMs)
  }

  return {
    get frameIndex() {
      return frameIndex
    },
    frameIntervalMs,
    captureFrame,
    advanceFrame,
    captureFor,
    fastForward,
  }
}

async function moveStudioCursorToLocator(page, locator, timeline, cursor, options = {}) {
  const targetPoint = await getLocatorTargetPoint(locator)
  if (!targetPoint) return

  if (!cursor?.enabled) {
    await page.mouse.move(targetPoint.x, targetPoint.y)
    return
  }

  const previous = await page.evaluate(() => window.__flowcapCursorPosition || {
    x: Math.round(window.innerWidth * 0.5),
    y: Math.round(window.innerHeight * 0.3),
  })

  const distance = Math.hypot(targetPoint.x - previous.x, targetPoint.y - previous.y)
  const paceScale = Number.parseFloat(cursor?.paceScale) || 1
  // Human-like speed: cursor.speed = pixels/second (default 450)
  // Humans move at 200-600 px/s depending on distance
  const speed = Number.parseFloat(cursor?.speed) || 450
  // Minimum 350ms — even tiny moves take time for a real hand
  // Long distances get faster effective speed (Fitts' Law — humans speed up for big moves)
  const baseDur = options.duration ?? Math.max(Math.round((distance / speed) * 1000), 350)
  const duration = options.duration ?? clamp(
    Math.round(baseDur * paceScale * (0.88 + Math.random() * 0.24)), 250, 4000,
  )

  const dx = targetPoint.x - previous.x
  const dy = targetPoint.y - previous.y
  const dist = Math.max(distance, 1)
  const sign = Math.random() > 0.5 ? 1 : -1
  const perpMag = Math.min(dist * (0.07 + Math.random() * 0.07), 44)
  const px = (-dy / dist) * perpMag * sign
  const py = (dx / dist) * perpMag * sign
  const c1x = previous.x + dx * 0.35 + px
  const c1y = previous.y + dy * 0.35 + py
  const c2x = previous.x + dx * 0.75 + px * 0.2
  const c2y = previous.y + dy * 0.75 + py * 0.2

  const seedJ = (Math.random() * 9999) | 0
  const seedV = (Math.random() * 9999) | 0
  const seedT = (Math.random() * 9999) | 0

  // Overshoot behavior: ~40% chance to overshoot target by 5-15px, then correct back
  const doOvershoot = Math.random() < 0.4 && distance > 30
  const overshootPx = doOvershoot ? (5 + Math.random() * 10) : 0
  const overshootX = targetPoint.x + (dx / dist) * overshootPx
  const overshootY = targetPoint.y + (dy / dist) * overshootPx
  const correctMs = doOvershoot ? (80 + Math.random() * 60) : 0  // 80-140ms correction

  const fullDuration = duration + 130 + correctMs

  // Clear hover from the previous element — dispatch mouseout/mouseleave
  // so the old target loses its hover highlight during cursor animation.
  // page.mouse.move(-1,-1) alone doesn't reliably trigger mouseleave.
  await page.evaluate(() => {
    const pos = window.__flowcapCursorPosition
    if (pos) {
      const el = document.elementFromPoint(pos.x, pos.y)
      if (el) {
        el.dispatchEvent(new MouseEvent('mouseleave', { bubbles: true }))
        el.dispatchEvent(new MouseEvent('mouseout', { bubbles: true }))
      }
    }
  })
  // Also move native mouse to a safe neutral position
  await page.mouse.move(0, 0)

  // setInterval(1ms) fires each virtual clock ms — updates cursor position every captured frame
  await page.evaluate(
    ({ fromX, fromY, cx1, cy1, cx2, cy2, toX, toY, durationMs, fullDurationMs, dist: d, sJ, sV, sT, doOvershoot, overX, overY, correctMs: corrMs }) => {
      const cursorEl = document.getElementById('flowcap-showcase-cursor')
      if (!cursorEl) return
      cursorEl.style.setProperty('--flowcap-duration', '0ms')
      const startTime = performance.now()

      function h(n) { const s = Math.sin(n * 127.1) * 43758.5453; return s - Math.floor(s) }
      function sn(x, seed) {
        const i = Math.floor(x), f = x - i, u = f * f * (3 - 2 * f)
        return (h(i + seed * 0.01) * (1 - u) + h(i + 1 + seed * 0.01) * u) * 2 - 1
      }
      function fbm(x, seed) {
        return sn(x, seed) * 0.50 + sn(x * 2.1 + 3.7, seed + 73) * 0.33 + sn(x * 4.6, seed + 157) * 0.17
      }

      function bez(t) {
        const u = 1 - t
        return {
          x: u * u * u * fromX + 3 * u * u * t * cx1 + 3 * u * t * t * cx2 + t * t * t * toX,
          y: u * u * u * fromY + 3 * u * u * t * cy1 + 3 * u * t * t * cy2 + t * t * t * toY,
        }
      }

      const pathLen = Math.hypot(toX - fromX, toY - fromY) || 1
      const nX = -(toY - fromY) / pathLen
      const nY = (toX - fromX) / pathLen

      function update() {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / durationMs, 1)

        let bezT
        if (t < 0.58) {
          bezT = Math.pow(t / 0.58, 1.7) * 0.82
        } else {
          const p = (t - 0.58) / 0.42
          bezT = 0.82 + (1 - Math.pow(1 - p, 2.1)) * 0.18
        }
        bezT += fbm(t * 5 + 0.3, sV) * 0.08 * Math.sin(Math.PI * t)
        bezT = Math.max(0, Math.min(bezT, 1))

        const pos = elapsed < durationMs ? bez(bezT) : { x: toX, y: toY }

        const jEnv = Math.sin(Math.PI * t) * Math.min(d * 0.012, 7)
        const j = fbm(t * 10, sJ) * jEnv
        pos.x += nX * j
        pos.y += nY * j

        if (t > 0.82) {
          const p = (t - 0.82) / 0.18
          const amp = (1 - p) * Math.min(d * 0.009, 5.5)
          pos.x += Math.sin(p * 6 * Math.PI) * amp
          pos.y += Math.cos(p * 7 * Math.PI) * amp * 0.6
        }

        if (doOvershoot && t > 0.85 && elapsed < durationMs) {
          const overT = (t - 0.85) / 0.15
          pos.x += (overX - toX) * overT * overT
          pos.y += (overY - toY) * overT * overT
        }

        if (elapsed > durationMs) {
          if (doOvershoot && elapsed < durationMs + corrMs) {
            const ct = (elapsed - durationMs) / corrMs
            const ease = 1 - (1 - ct) * (1 - ct)
            pos.x = overX + (toX - overX) * ease
            pos.y = overY + (toY - overY) * ease
          } else {
            const base = doOvershoot ? durationMs + corrMs : durationMs
            if (elapsed > base) {
              const p = (elapsed - base) / 130
              const amp = Math.exp(-p * 3.5) * Math.min(d * 0.006, 3.5)
              pos.x += Math.sin(p * 9 * Math.PI + sT * 0.01) * amp
              pos.y += Math.cos(p * 11 * Math.PI + sT * 0.01) * amp * 0.5
            }
          }
        }

        cursorEl.style.setProperty('--flowcap-x', pos.x.toFixed(2))
        cursorEl.style.setProperty('--flowcap-y', pos.y.toFixed(2))

        if (elapsed >= fullDurationMs) {
          clearInterval(window.__flowcapCursorInterval)
          cursorEl.style.setProperty('--flowcap-x', String(toX))
          cursorEl.style.setProperty('--flowcap-y', String(toY))
          window.__flowcapCursorPosition = { x: toX, y: toY }
        }
      }

      if (window.__flowcapCursorInterval) clearInterval(window.__flowcapCursorInterval)
      window.__flowcapCursorInterval = setInterval(update, 1)
    },
    {
      fromX: previous.x, fromY: previous.y,
      cx1: c1x, cy1: c1y, cx2: c2x, cy2: c2y,
      toX: targetPoint.x, toY: targetPoint.y,
      durationMs: duration, fullDurationMs: fullDuration,
      dist, sJ: seedJ, sV: seedV, sT: seedT,
      doOvershoot, overX: overshootX, overY: overshootY, correctMs,
    },
  )

  // Capture all animation frames (cursor traveling from A to B + post-landing vibration)
  await timeline.captureFor(fullDuration)

  // Move native mouse to target now that visual cursor has arrived.
  // This triggers correct CSS hover / mouseenter on the target element
  // for all subsequent dwell frames.
  await page.mouse.move(targetPoint.x, targetPoint.y)

  // Dynamic cursor: switch to pointer over clickable targets, dot otherwise
  // Temporarily remove cursor:none override to read the real cursor style
  const needsPointer = await locator.evaluate((el) => {
    const styleEl = document.getElementById('flowcap-showcase-cursor-style')
    if (styleEl) {
      const saved = styleEl.textContent
      styleEl.textContent = saved.replace(/html, body, body \* \{ cursor: none !important; \}/, '')
      void el.offsetHeight // force reflow
      var result = window.getComputedStyle(el).cursor === 'pointer'
      styleEl.textContent = saved // restore
      return result
    }
    return window.getComputedStyle(el).cursor === 'pointer'
  }).catch(() => false)

  await page.evaluate((isPointer) => {
    const el = document.getElementById('flowcap-showcase-cursor')
    if (!el) return
    el.classList.remove('is-arrow', 'is-dot')
    el.classList.add(isPointer ? 'is-pointer' : 'is-arrow')
  }, needsPointer)

  // Capture a few frames after cursor type switch so the new shape is visible
  await timeline.captureFor(80)
}

async function executeStudioStep(page, step, timeline, runtime, onProgress) {
  onProgress(`Studio executing: ${step.action}`)

  // Cursor is the driver — cursor travel time IS the video timing.
  // Actions happen on arrival. No artificial waits.

  switch (step.action) {
    // wait: honour explicit pauses — capture frames so the viewer sees the UI at rest.
    // Previously silently ignored, making flows feel rushed and cutting intentional pauses.
    case 'wait': {
      const waitMs = parseInt(step.ms, 10) || 1000
      await timeline.captureFor(waitMs)
      return
    }
    case 'wait_for': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({
        state: step.state || 'visible',
        timeout: parseInt(step.timeout, 10) || 5000,
      })
      // Capture the full animation from first frame to settled state — no frames skipped.
      // Previously 400ms was discarded via fastForward, gutting the middle of every
      // expand/collapse transition and making the UI appear to snap.
      // captureMs can be overridden per-step via step.captureMs (e.g. 300 for fast transitions).
      const captureMs = parseInt(step.captureMs, 10) || 1200
      await timeline.captureFor(captureMs)
      return
    }
    case 'hover': {
      // Cursor drives: move to target, arrive, dwell to observe, settle
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocator(locator, page, timeline, { timeoutMs: 200, stableMs: 40 })
      await moveStudioCursorToLocator(page, locator, timeline, runtime.cursor)
      const tp = await getLocatorInteractionPoint(locator)
      if (tp) await locator.hover({ position: { x: tp.offsetX, y: tp.offsetY } })
      else await locator.hover()
      // Human hover dwell: pause to read/examine what you hovered (500-900ms)
      await timeline.captureFor(500 + Math.round(Math.random() * 400))
      return
    }
    case 'click': {
      // Cursor drives: move to target, arrive, dwell, click, brief visual settle
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocator(locator, page, timeline)
      await moveStudioCursorToLocator(page, locator, timeline, runtime.cursor)
      // Human dwell: pause after arriving before clicking — reading the target (400-700ms)
      await timeline.captureFor(400 + Math.round(Math.random() * 300))
      await pulseShowcaseCursor(page, runtime.cursor)

      if (
        typeof step.selector === 'string' &&
        /privacy-(shared|private)-control/.test(step.selector)
      ) {
        const inputLocator = page.locator(step.selector.replace(/-control$/, '-input')).first()
        await inputLocator.waitFor({ state: 'attached', timeout: 5000 })
        await inputLocator.check({ force: true })
      } else {
        const targetPoint = await getLocatorInteractionPoint(locator)
        if (targetPoint) {
          await locator.click({
            position: { x: targetPoint.offsetX, y: targetPoint.offsetY },
            force: true,
          })
        } else {
          await locator.click({ force: true })
        }
      }

      // Move native mouse off the clicked element so hover doesn't linger
      // on it or any newly-appearing elements during the settle phase
      await page.mouse.move(0, 0)

      // Human settle: pause to observe the click result (600-1000ms)
      // Humans don't instantly rush to the next target — they watch the UI react
      await timeline.captureFor(900 + Math.round(Math.random() * 600))
      return
    }
    case 'type': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocator(locator, page, timeline)
      const isAlreadyFocused = await locator.evaluate(
        (element) => element === document.activeElement,
      )

      if (!isAlreadyFocused) {
        await moveStudioCursorToLocator(page, locator, timeline, runtime.cursor)
        await pulseShowcaseCursor(page, runtime.cursor)
        const targetPoint = await getLocatorInteractionPoint(locator)
        if (targetPoint) {
          await locator.click({
            position: { x: targetPoint.offsetX, y: targetPoint.offsetY },
            force: true,
          })
        } else {
          await locator.click({ force: true })
        }
      }

      await locator.fill('')

      const delay = Math.max(parseInt(step.delay, 10) || 70, 30)
      for (const char of step.text || '') {
        await page.keyboard.type(char)
        await timeline.captureFor(delay)
      }
      return
    }
    case 'scroll':
      await page.evaluate((y) => window.scrollBy(0, y), parseInt(step.y, 10) || 0)
      await timeline.captureFor(60)
      return
    default:
      return
  }
}

async function captureStudioFrames({
  context,
  page,
  steps,
  framesDir,
  fps,
  cursor,
  interaction,
  render,
  onProgress,
}) {
  const timeline = await createStudioTimeline({
    context,
    page,
    framesDir,
    fps,
    onProgress,
  })

  onProgress(`Capturing Studio frames with virtual clock at ${fps}fps`)
  const requestedPaceScale = Number.parseFloat(render?.paceScale)
  const paceScale = Number.isFinite(requestedPaceScale)
    ? clamp(requestedPaceScale, 0.5, 3)
    : 1
  onProgress(`Studio pacing -> actionScale=${paceScale.toFixed(2)}x`)
  await timeline.captureFrame()

  for (let index = 0; index < steps.length; index += 1) {
    await executeStudioStep(
      page,
      steps[index],
      timeline,
      {
        cursor: { ...cursor, paceScale },
        interaction,
        paceScale,
      },
      onProgress,
    )
  }

  return timeline.frameIndex
}

async function findSubjectCenter(page) {
  return page.evaluate(() => {
    const candidates = [
      '[data-flowcap-motion-target="create-folder-modal"]',
      '[data-flowcap-motion-target="folder-card"]',
      '[data-flowcap-motion-target="empty-state"]',
      '[data-flowcap-motion-target="workspace-card"]',
    ]

    for (const selector of candidates) {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      return {
        selector,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

    return null
  })
}

async function startFrameRenderedRecording({
  chromium,
  url,
  steps,
  durationSec,
  bgColor,
  bgImagePath,
  borderRadius,
  zoomPercent,
  camera,
  quality,
  browserConfig,
  placement,
  cursor,
  interaction,
  mockup,
  motion,
  render,
  outputPath,
  onProgress,
}) {
  const fps = getStudioFps(render)
  const outputDir = path.join(__dirname, '..', '..', 'output')
  const renderId = Date.now()
  const framesDir = path.join(outputDir, `studio_frames_${renderId}`)
  const rawVideoPath = path.join(outputDir, `studio_raw_${renderId}.mkv`)
  let browser = null
  let context = null
  let mockupFramePath = null
  let maskPath = null

  await fs.mkdir(framesDir, { recursive: true })

  try {
    onProgress(`Studio Render -> browser=${browserConfig.width}x${browserConfig.height} fps=${fps}`)
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
    context = await browser.newContext({
      viewport: { width: browserConfig.width, height: browserConfig.height },
      deviceScaleFactor: 2,
    })
    await context.clock.install({ time: Date.now() })
    const page = await context.newPage()

    onProgress(`Navigating to ${url}...`)
    await page.goto(url, { waitUntil: 'load' })
    const contentScale = Number.parseFloat(browserConfig?.captureScale)
    if (Number.isFinite(contentScale) && contentScale > 0 && contentScale !== 1) {
      onProgress(`Content scale -> transform scale=${contentScale}x`)
      await page.evaluate((scale) => {
        const root = document.getElementById('root') || document.body.firstElementChild || document.body
        root.style.transform = `scale(${scale})`
        root.style.transformOrigin = 'center center'
      }, contentScale)
      await context.clock.runFor(100)
    }
    await context.clock.runFor(1000)
    await installShowcaseCursor(page, cursor)
    await installMotionTimeline(page, motion)

    const frameCount = await captureStudioFrames({
      context,
      page,
      steps,
      framesDir,
      fps,
      cursor,
      interaction,
      render,
      onProgress,
    })
    const actualDurationSec = frameCount / fps
    onProgress(`Studio captured ${frameCount} frames -> ${actualDurationSec.toFixed(2)}s at ${fps}fps`)

    const subjectCenter = await findSubjectCenter(page)
    if (subjectCenter) {
      onProgress(
        `Subject center -> ${subjectCenter.selector} center=(${subjectCenter.x},${subjectCenter.y}) size=${subjectCenter.width}x${subjectCenter.height}`,
      )
    }

    await encodeFrameSequence({ framesDir, rawVideoPath, fps, render, onProgress })

    const mockupSpec = getMockupSpec(mockup, browserConfig, borderRadius)
    if (mockupSpec) {
      onProgress('Generating mockup frame...')
      mockupFramePath = await createMockupFrame(browser, mockupSpec, url)
    }

    onProgress('Generating rounded corner mask...')
    maskPath = await createRoundedMask(context, browserConfig, borderRadius, mockupSpec)

    await page.close().catch(() => { })
    await context.close()
    await browser.close()
    context = null
    browser = null

    await composeFinalVideo({
      rawVideoPath,
      maskPath,
      mockupFramePath,
      mockupSpec,
      bgImagePath,
      bgColor,
      durationSec: actualDurationSec,
      zoomPercent,
      camera:
        camera?.anchorMode === 'subject' && subjectCenter
          ? {
            ...camera,
            anchorX: subjectCenter.x,
            anchorY: subjectCenter.y,
            anchorSpace: 'content',
          }
          : {
            ...camera,
            anchorSpace: camera?.anchorSpace === 'content' ? 'content' : 'canvas',
          },
      quality,
      browserConfig,
      placement,
      fps,
      outputPath,
      onProgress,
    })

    onProgress('Cleaning up Studio render files...')
    await cleanupRecordingArtifacts([rawVideoPath, maskPath, mockupFramePath])
    await fs.rm(framesDir, { recursive: true, force: true })
    onProgress(`Done! Saved to ${outputPath}`)
  } catch (error) {
    await cleanupRecordingArtifacts([rawVideoPath, maskPath, mockupFramePath])
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => { })
    if (context) await context.close().catch(() => { })
    if (browser) await browser.close().catch(() => { })
    throw error
  }
}

module.exports = {
  startFrameRenderedRecording,
}
