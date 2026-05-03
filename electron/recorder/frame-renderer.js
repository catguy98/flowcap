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

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

// ---------------------------------------------------------------------------
// CDP Screencast Capture
//
// Uses Chrome DevTools Protocol Page.startScreencast to capture EVERY frame
// the compositor renders. No virtual clock, no syncWebAnimations hacks.
// The browser runs at natural speed, and we capture exactly what a user sees.
// ---------------------------------------------------------------------------

async function startScreencastCapture(cdpSession, framesDir) {
  let frameIndex = 0
  const pendingWrites = []

  cdpSession.on('Page.screencastFrame', async ({ data, metadata, sessionId }) => {
    // Acknowledge immediately so the next frame can be sent
    try {
      await cdpSession.send('Page.screencastFrameAck', { sessionId })
    } catch { /* session may have closed */ }

    frameIndex += 1
    const framePath = path.join(framesDir, `frame_${padFrameNumber(frameIndex)}.png`)
    const writePromise = fs.writeFile(framePath, Buffer.from(data, 'base64'))
    pendingWrites.push(writePromise)
    writePromise.then(() => {
      const idx = pendingWrites.indexOf(writePromise)
      if (idx !== -1) pendingWrites.splice(idx, 1)
    })
  })

  await cdpSession.send('Page.startScreencast', {
    format: 'png',
    quality: 100,
    maxWidth: 0,
    maxHeight: 0,
    everyNthFrame: 1,
  })

  return {
    get frameIndex() { return frameIndex },
    async stop() {
      try { await cdpSession.send('Page.stopScreencast') } catch { /* ignore */ }
      // Wait for any in-progress frame writes to complete
      await Promise.all(pendingWrites)
    },
  }
}

// ---------------------------------------------------------------------------
// Real-time cursor movement
//
// Uses requestAnimationFrame (not setInterval) so cursor updates are synced
// to the browser's actual render cycle — matching what a real user sees.
// ---------------------------------------------------------------------------

async function moveRealtimeCursorToLocator(page, locator, cursor) {
  const interactionPoint = await getLocatorInteractionPoint(locator)
  if (!interactionPoint) return

  const targetX = interactionPoint.pageX
  const targetY = interactionPoint.pageY

  if (!cursor?.enabled) {
    await page.mouse.move(targetX, targetY)
    return
  }

  const previous = await page.evaluate(() => window.__flowcapCursorPosition || {
    x: Math.round(window.innerWidth * 0.5),
    y: Math.round(window.innerHeight * 0.3),
  })

  const distance = Math.hypot(targetX - previous.x, targetY - previous.y)
  const paceScale = Number.parseFloat(cursor?.paceScale) || 1
  const speed = Number.parseFloat(cursor?.speed) || 450
  const baseDur = Math.max(Math.round((distance / speed) * 1000), 500)
  const duration = clamp(
    Math.round(baseDur * paceScale * (0.88 + Math.random() * 0.24)), 250, 4000,
  )

  const dx = targetX - previous.x
  const dy = targetY - previous.y
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

  const doOvershoot = Math.random() < 0.4 && distance > 30
  const overshootPx = doOvershoot ? (5 + Math.random() * 10) : 0
  const overshootX = targetX + (dx / dist) * overshootPx
  const overshootY = targetY + (dy / dist) * overshootPx
  const correctMs = doOvershoot ? (80 + Math.random() * 60) : 0

  const fullDuration = duration + 130 + correctMs

  // Use requestAnimationFrame for real-time cursor animation
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
        if (t < 0.45) {
          bezT = Math.pow(t / 0.45, 1.7) * 0.65
        } else {
          const p = (t - 0.45) / 0.55
          bezT = 0.65 + (1 - Math.pow(1 - p, 2.1)) * 0.35
        }
        bezT += fbm(t * 5 + 0.3, sV) * 0.08 * Math.sin(Math.PI * t)
        bezT = Math.max(0, Math.min(bezT, 1))

        const pos = elapsed < durationMs ? bez(bezT) : { x: toX, y: toY }

        const jEnv = Math.sin(Math.PI * t) * Math.min(d * 0.012, 7)
        const j = fbm(t * 10, sJ) * jEnv
        pos.x += nX * j
        pos.y += nY * j

        if (t > 0.75) {
          const p = (t - 0.75) / 0.25
          const amp = (1 - p) * Math.min(d * 0.009, 5.5)
          pos.x += Math.sin(p * 6 * Math.PI) * amp
          pos.y += Math.cos(p * 7 * Math.PI) * amp * 0.6
        }

        if (doOvershoot && t > 0.80 && elapsed < durationMs) {
          const overT = (t - 0.80) / 0.20
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
          cursorEl.style.setProperty('--flowcap-x', String(toX))
          cursorEl.style.setProperty('--flowcap-y', String(toY))
          window.__flowcapCursorPosition = { x: toX, y: toY }
          return true // animation complete
        }

        return false // continue
      }

      if (window.__flowcapCursorRAF) cancelAnimationFrame(window.__flowcapCursorRAF)
      function loop() {
        const done = update()
        if (!done) window.__flowcapCursorRAF = requestAnimationFrame(loop)
      }
      window.__flowcapCursorRAF = requestAnimationFrame(loop)
    },
    {
      fromX: previous.x, fromY: previous.y,
      cx1: c1x, cy1: c1y, cx2: c2x, cy2: c2y,
      toX: targetX, toY: targetY,
      durationMs: duration, fullDurationMs: fullDuration,
      dist: distance, sJ: seedJ, sV: seedV, sT: seedT,
      doOvershoot, overX: overshootX, overY: overshootY, correctMs,
    },
  )

  // Wait for the full cursor animation to play out in real time
  await page.waitForTimeout(fullDuration)

  // Move native mouse to target
  await page.mouse.move(targetX, targetY)

  // Dynamic cursor: switch to pointer over clickable targets
  const needsPointer = await locator.evaluate((el) => {
    const styleEl = document.getElementById('flowcap-showcase-cursor-style')
    if (styleEl) {
      const saved = styleEl.textContent
      styleEl.textContent = saved.replace(/html, body, body \* \{ cursor: none !important; \}/, '')
      void el.offsetHeight
      var result = window.getComputedStyle(el).cursor === 'pointer'
      styleEl.textContent = saved
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

  // Brief pause so cursor type change is visible
  await page.waitForTimeout(80)
}

// ---------------------------------------------------------------------------
// Step execution — real-time waits, no virtual clock
// ---------------------------------------------------------------------------

async function waitForStableLocatorRealtime(locator, page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1200
  const stableMs = options.stableMs ?? 160
  const threshold = options.threshold ?? 0.75
  const startedAt = Date.now()
  let lastBox = null
  let stableSince = 0

  while (Date.now() - startedAt < timeoutMs) {
    const box = await locator.boundingBox().catch(() => null)
    if (!box) {
      stableSince = 0
      lastBox = null
      await page.waitForTimeout(50)
      continue
    }

    if (
      lastBox &&
      Math.abs(box.x - lastBox.x) <= threshold &&
      Math.abs(box.y - lastBox.y) <= threshold &&
      Math.abs(box.width - lastBox.width) <= threshold &&
      Math.abs(box.height - lastBox.height) <= threshold
    ) {
      if (!stableSince) stableSince = Date.now()
      if (Date.now() - stableSince >= stableMs) return box
    } else {
      stableSince = 0
    }

    lastBox = box
    await page.waitForTimeout(50)
  }

  return lastBox
}

async function executeRealtimeStep(page, step, cursor, interaction, onProgress) {
  onProgress(`Executing: ${step.action}`)

  switch (step.action) {
    case 'wait': {
      const waitMs = parseInt(step.ms, 10) || 1000
      await page.waitForTimeout(waitMs)
      return
    }
    case 'wait_for': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({
        state: step.state || 'visible',
        timeout: parseInt(step.timeout, 10) || 5000,
      })
      // Let the resulting animation play out fully
      const captureMs = parseInt(step.captureMs, 10) || 1200
      await page.waitForTimeout(captureMs)
      return
    }
    case 'hover': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocatorRealtime(locator, page, { timeoutMs: 200, stableMs: 40 })
      await moveRealtimeCursorToLocator(page, locator, cursor)
      const tp = await getLocatorInteractionPoint(locator)
      if (tp) await locator.hover({ position: { x: tp.offsetX, y: tp.offsetY } })
      else await locator.hover()
      // Human hover dwell — longer pause to observe before moving on
      await page.waitForTimeout(2200 + Math.round(Math.random() * 800))
      return
    }
    case 'click': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocatorRealtime(locator, page)
      await moveRealtimeCursorToLocator(page, locator, cursor)
      // Human dwell before clicking — absorb the target
      await page.waitForTimeout(2200 + Math.round(Math.random() * 600))
      await pulseShowcaseCursor(page, cursor)

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

      await page.mouse.move(0, 0)

      // Settle time — let the user see the result
      await page.waitForTimeout(2500 + Math.round(Math.random() * 1000))
      return
    }
    case 'type': {
      const locator = page.locator(step.selector).first()
      await locator.waitFor({ state: 'visible', timeout: 5000 })
      await waitForStableLocatorRealtime(locator, page)
      const isAlreadyFocused = await locator.evaluate(
        (element) => element === document.activeElement,
      )

      if (!isAlreadyFocused) {
        await moveRealtimeCursorToLocator(page, locator, cursor)
        await pulseShowcaseCursor(page, cursor)
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
        await page.waitForTimeout(delay)
      }
      return
    }
    case 'scroll':
      await page.evaluate((y) => window.scrollBy(0, y), parseInt(step.y, 10) || 0)
      await page.waitForTimeout(60)
      return
    default:
      return
  }
}

// ---------------------------------------------------------------------------
// Encoding — same as before
// ---------------------------------------------------------------------------

async function encodeFrameSequence({ framesDir, rawVideoPath, fps, render, onProgress }) {
  const motionBlurRaw = parseInt(render?.motionBlur, 10)
  const blurFrames = Number.isFinite(motionBlurRaw) && motionBlurRaw >= 0
    ? Math.min(motionBlurRaw, 5)
    : 0  // no motion blur by default

  if (blurFrames > 0) {
    const half = Math.floor(blurFrames / 2)
    const weights = []
    for (let i = -half; i <= half; i += 1) {
      weights.push(i === 0 ? String(half * 2 + 1) : '1')
    }
    const weightStr = weights.join(' ')
    const totalFrames = blurFrames * 2 + 1

    onProgress(
      `Encoding frames -> ${fps}fps with motion blur (tmix frames=${totalFrames} weights='${weightStr}')...`,
    )
    await runFfmpeg([
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%06d.png'),
      '-vf', `tmix=frames=${totalFrames}:weights='${weightStr}'`,
      '-c:v', 'libx264rgb',
      '-preset', 'ultrafast',
      '-crf', '0',
      '-pix_fmt', 'rgb24',
      rawVideoPath,
    ])
  } else {
    onProgress(`Encoding frame sequence -> ${fps}fps lossless intermediate...`)
    await runFfmpeg([
      '-y',
      '-framerate', String(fps),
      '-i', path.join(framesDir, 'frame_%06d.png'),
      '-c:v', 'libx264rgb',
      '-preset', 'ultrafast',
      '-crf', '0',
      '-pix_fmt', 'rgb24',
      rawVideoPath,
    ])
  }
}

// ---------------------------------------------------------------------------
// Subject detection
// ---------------------------------------------------------------------------

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

// ---------------------------------------------------------------------------
// Main entry point — same signature as before
// ---------------------------------------------------------------------------

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
  let page = null
  let cdpSession = null
  let screencast = null
  let mockupFramePath = null
  let maskPath = null

  await fs.mkdir(framesDir, { recursive: true })

  try {
    onProgress(`Studio Render (CDP Screencast) -> browser=${browserConfig.width}x${browserConfig.height} fps=${fps}`)

    browser = await chromium.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--enable-gpu-rasterization',
        '--enable-zero-copy',
        '--use-gl=swiftshader',
      ],
    })

    context = await browser.newContext({
      viewport: { width: browserConfig.width, height: browserConfig.height },
      deviceScaleFactor: 2,
    })

    page = await context.newPage()

    // Create CDP session for screencast
    cdpSession = await context.newCDPSession(page)

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
    }

    // Wait for page to settle
    await page.waitForTimeout(1000)

    await installShowcaseCursor(page, cursor)
    await installMotionTimeline(page, motion)

    // Start capturing EVERY compositor frame
    onProgress('Starting CDP screencast capture...')
    screencast = await startScreencastCapture(cdpSession, framesDir)

    const paceScale = Number.parseFloat(render?.paceScale)
    const clampedPaceScale = Number.isFinite(paceScale)
      ? clamp(paceScale, 0.5, 3)
      : 1
    onProgress(`Studio pacing -> actionScale=${clampedPaceScale.toFixed(2)}x`)

    // Execute all steps in real-time — every frame is captured
    for (let index = 0; index < steps.length; index += 1) {
      await executeRealtimeStep(
        page,
        steps[index],
        { ...cursor, paceScale: clampedPaceScale },
        interaction,
        onProgress,
      )

      // Inter-step "thinking" gap — a real human pauses to decide what's next
      if (index < steps.length - 1) {
        const nextAction = steps[index + 1]?.action
        // Longer gap before clicks/hovers (thinking what to do), shorter before waits
        const gapMs = (nextAction === 'click' || nextAction === 'hover')
          ? 1900 + Math.round(Math.random() * 600)   // 1900-2500ms
          : 1500 + Math.round(Math.random() * 300)   // 1500-1800ms
        await page.waitForTimeout(gapMs)
      }
    }

    // Stop capturing
    await screencast.stop()
    onProgress(`Captured ${screencast.frameIndex} compositor frames`)

    // Wait briefly for any pending frame writes to flush
    await page.waitForTimeout(200)

    // Now encode the captured frames
    const frameCount = screencast.frameIndex
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

    await page.close().catch(() => {})
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
    if (screencast) await screencast.stop().catch(() => {})
    await cleanupRecordingArtifacts([rawVideoPath, maskPath, mockupFramePath])
    await fs.rm(framesDir, { recursive: true, force: true }).catch(() => {})
    if (context) await context.close().catch(() => {})
    if (browser) await browser.close().catch(() => {})
    throw error
  }
}

module.exports = {
  startFrameRenderedRecording,
}