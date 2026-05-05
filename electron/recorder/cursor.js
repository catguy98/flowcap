const { clamp } = require('./utils')

async function installShowcaseCursor(page, cursor) {
  if (!cursor?.enabled) return

  await page.evaluate((cursorStyle) => {
    if (document.getElementById('flowcap-showcase-cursor')) return

    const style = document.createElement('style')
    style.id = 'flowcap-showcase-cursor-style'
    style.textContent = `
      html, body, body * { cursor: none !important; }
      #flowcap-showcase-cursor {
        --flowcap-x: 96;
        --flowcap-y: 96;
        --flowcap-duration: 0ms;
        position: fixed;
        top: 0;
        left: 0;
        pointer-events: none;
        z-index: 2147483647;
        transition:
          transform var(--flowcap-duration) cubic-bezier(0.22, 1, 0.36, 1),
          opacity 120ms ease;
      }
      #flowcap-showcase-cursor.is-dot {
        width: 18px;
        height: 18px;
        border-radius: 999px;
        background: rgba(15, 23, 42, 0.92);
        border: 2px solid rgba(255, 255, 255, 0.94);
        box-shadow: 0 6px 18px rgba(15, 23, 42, 0.18);
        transform: translate(
          calc(var(--flowcap-x) * 1px - 9px),
          calc(var(--flowcap-y) * 1px - 9px)
        );
      }
      #flowcap-showcase-cursor.is-dot::after {
        content: '';
        position: absolute;
        inset: -10px;
        border-radius: 999px;
        border: 2px solid rgba(15, 23, 42, 0.12);
        opacity: 0;
        transform: scale(0.55);
      }
      #flowcap-showcase-cursor.is-arrow {
        width: 48px;
        height: 48px;
        transform: translate(
          calc(var(--flowcap-x) * 1px - 2px),
          calc(var(--flowcap-y) * 1px - 2px)
        );
      }
      #flowcap-showcase-cursor.is-arrow::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg version='1.1' xmlns='http://www.w3.org/2000/svg' viewBox='0 0 28 28'%3E%3Cpolygon fill='%23FFFFFF' points='8.2,20.9 8.2,4.9 19.8,16.5 13,16.5 12.6,16.6 '/%3E%3Cpolygon fill='%23FFFFFF' points='17.3,21.6 13.7,23.1 9,12 12.7,10.5 '/%3E%3Crect x='12.5' y='13.6' transform='matrix(0.9221 -0.3871 0.3871 0.9221 -5.7605 6.5909)' width='2' height='8'/%3E%3Cpolygon points='9.2,7.3 9.2,18.5 12.2,15.6 12.6,15.5 17.4,15.5 '/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
      }
      #flowcap-showcase-cursor.is-arrow::after {
        content: '';
        position: absolute;
        display: none;
      }
      #flowcap-showcase-cursor.is-pointer {
        width: 48px;
        height: 48px;
        transform: translate(
          calc(var(--flowcap-x) * 1px - 8px),
          calc(var(--flowcap-y) * 1px - 2px)
        );
      }
      #flowcap-showcase-cursor.is-pointer::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg version=%221.1%22 id=%22Layer_1%22 xmlns=%22http://www.w3.org/2000/svg%22 xmlns:xlink=%22http://www.w3.org/1999/xlink%22 x=%220px%22 y=%220px%22 viewBox=%220 0 32 32%22 enable-background=%22new 0 0 32 32%22 xml:space=%22preserve%22%3E %3Cg%3E %3Cdefs%3E %3Crect id=%22SVGID_1_%22 width=%2232%22 height=%2232%22/%3E %3C/defs%3E %3CclipPath id=%22SVGID_2_%22%3E %3Cuse xlink:href=%22%23SVGID_1_%22 overflow=%22visible%22/%3E %3C/clipPath%3E %3Cpath clip-path=%22url(%23SVGID_2_)%22 fill=%22%23FFFFFF%22 d=%22M11.3,20.4c-0.3-0.4-0.6-1.1-1.2-2c-0.3-0.5-1.2-1.5-1.5-1.9 c-0.2-0.4-0.2-0.6-0.1-1c0.1-0.6,0.7-1.1,1.4-1.1c0.5,0,1,0.4,1.4,0.7c0.2,0.2,0.5,0.6,0.7,0.8c0.2,0.2,0.2,0.3,0.4,0.5 c0.2,0.3,0.3,0.5,0.2,0.1c-0.1-0.5-0.2-1.3-0.4-2.1c-0.1-0.6-0.2-0.7-0.3-1.1c-0.1-0.5-0.2-0.8-0.3-1.3c-0.1-0.3-0.2-1.1-0.3-1.5 c-0.1-0.5-0.1-1.4,0.3-1.8c0.3-0.3,0.9-0.4,1.3-0.2c0.5,0.3,0.8,1,0.9,1.3c0.2,0.5,0.4,1.2,0.5,2c0.2,1,0.5,2.5,0.5,2.8 c0-0.4-0.1-1.1,0-1.5c0.1-0.3,0.3-0.7,0.7-0.8c0.3-0.1,0.6-0.1,0.9-0.1c0.3,0.1,0.6,0.3,0.8,0.5c0.4,0.6,0.4,1.9,0.4,1.8 c0.1-0.4,0.1-1.2,0.3-1.6c0.1-0.2,0.5-0.4,0.7-0.5c0.3-0.1,0.7-0.1,1,0c0.2,0,0.6,0.3,0.7,0.5c0.2,0.3,0.3,1.3,0.4,1.7 c0,0.1,0.1-0.4,0.3-0.7c0.4-0.6,1.8-0.8,1.9,0.6c0,0.7,0,0.6,0,1.1c0,0.5,0,0.8,0,1.2c0,0.4-0.1,1.3-0.2,1.7 c-0.1,0.3-0.4,1-0.7,1.4c0,0-1.1,1.2-1.2,1.8c-0.1,0.6-0.1,0.6-0.1,1c0,0.4,0.1,0.9,0.1,0.9s-0.8,0.1-1.2,0c-0.4-0.1-0.9-0.8-1-1.1 c-0.2-0.3-0.5-0.3-0.7,0c-0.2,0.4-0.7,1.1-1.1,1.1c-0.7,0.1-2.1,0-3.1,0c0,0,0.2-1-0.2-1.4c-0.3-0.3-0.8-0.8-1.1-1.1L11.3,20.4z%22/%3E %3Cpath clip-path=%22url(%23SVGID_2_)%22 fill=%22none%22 stroke=%22%23000000%22 stroke-width=%220.75%22 stroke-linecap=%22round%22 stroke-linejoin=%22round%22 d=%22 M11.3,20.4c-0.3-0.4-0.6-1.1-1.2-2c-0.3-0.5-1.2-1.5-1.5-1.9c-0.2-0.4-0.2-0.6-0.1-1c0.1-0.6,0.7-1.1,1.4-1.1c0.5,0,1,0.4,1.4,0.7 c0.2,0.2,0.5,0.6,0.7,0.8c0.2,0.2,0.2,0.3,0.4,0.5c0.2,0.3,0.3,0.5,0.2,0.1c-0.1-0.5-0.2-1.3-0.4-2.1c-0.1-0.6-0.2-0.7-0.3-1.1 c-0.1-0.5-0.2-0.8-0.3-1.3c-0.1-0.3-0.2-1.1-0.3-1.5c-0.1-0.5-0.1-1.4,0.3-1.8c0.3-0.3,0.9-0.4,1.3-0.2c0.5,0.3,0.8,1,0.9,1.3 c0.2,0.5,0.4,1.2,0.5,2c0.2,1,0.5,2.5,0.5,2.8c0-0.4-0.1-1.1,0-1.5c0.1-0.3,0.3-0.7,0.7-0.8c0.3-0.1,0.6-0.1,0.9-0.1 c0.3,0.1,0.6,0.3,0.8,0.5c0.4,0.6,0.4,1.9,0.4,1.8c0.1-0.4,0.1-1.2,0.3-1.6c0.1-0.2,0.5-0.4,0.7-0.5c0.3-0.1,0.7-0.1,1,0 c0.2,0,0.6,0.3,0.7,0.5c0.2,0.3,0.3,1.3,0.4,1.7c0,0.1,0.1-0.4,0.3-0.7c0.4-0.6,1.8-0.8,1.9,0.6c0,0.7,0,0.6,0,1.1 c0,0.5,0,0.8,0,1.2c0,0.4-0.1,1.3-0.2,1.7c-0.1,0.3-0.4,1-0.7,1.4c0,0-1.1,1.2-1.2,1.8c-0.1,0.6-0.1,0.6-0.1,1 c0,0.4,0.1,0.9,0.1,0.9s-0.8,0.1-1.2,0c-0.4-0.1-0.9-0.8-1-1.1c-0.2-0.3-0.5-0.3-0.7,0c-0.2,0.4-0.7,1.1-1.1,1.1 c-0.7,0.1-2.1,0-3.1,0c0,0,0.2-1-0.2-1.4c-0.3-0.3-0.8-0.8-1.1-1.1L11.3,20.4z%22/%3E %3Cline clip-path=%22url(%23SVGID_2_)%22 fill=%22none%22 stroke=%22%23000000%22 stroke-width=%220.75%22 stroke-linecap=%22round%22 x1=%2219.6%22 y1=%2220.7%22 x2=%2219.6%22 y2=%2217.3%22/%3E %3Cline clip-path=%22url(%23SVGID_2_)%22 fill=%22none%22 stroke=%22%23000000%22 stroke-width=%220.75%22 stroke-linecap=%22round%22 x1=%2217.6%22 y1=%2220.7%22 x2=%2217.5%22 y2=%2217.3%22/%3E %3Cline clip-path=%22url(%23SVGID_2_)%22 fill=%22none%22 stroke=%22%23000000%22 stroke-width=%220.75%22 stroke-linecap=%22round%22 x1=%2215.6%22 y1=%2217.3%22 x2=%2215.6%22 y2=%2220.7%22/%3E %3C/g%3E %3C/svg%3E");
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
      }
      #flowcap-showcase-cursor.is-pointer::after {
        content: '';
        position: absolute;
        display: none;
      }
      #flowcap-showcase-cursor.is-clicking::after {
        animation: flowcap-cursor-click 360ms ease-out;
      }
      @keyframes flowcap-cursor-click {
        0% {
          opacity: 0.5;
          transform: scale(0.72);
        }
        100% {
          opacity: 0;
          transform: scale(1.45);
        }
      }
    `

    const cursorEl = document.createElement('div')
    cursorEl.id = 'flowcap-showcase-cursor'
    cursorEl.className = cursorStyle === 'arrow' ? 'is-arrow' : 'is-dot'
    document.documentElement.appendChild(style)
    document.documentElement.appendChild(cursorEl)
    window.__flowcapCursorPosition = {
      x: Math.round(window.innerWidth * 0.5),
      y: Math.round(window.innerHeight * 0.3),
    }
  }, cursor?.style || 'dot')
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

async function getLocatorInteractionPoint(locator) {
  const [targetPoint, box] = await Promise.all([getLocatorTargetPoint(locator), locator.boundingBox()])
  if (!targetPoint || !box) return null

  return {
    pageX: targetPoint.x,
    pageY: targetPoint.y,
    offsetX: clamp(targetPoint.x - box.x, 1, Math.max(box.width - 1, 1)),
    offsetY: clamp(targetPoint.y - box.y, 1, Math.max(box.height - 1, 1)),
  }
}

async function moveShowcaseCursorToLocator(page, locator, cursor, options = {}) {
  const targetPoint = await getLocatorTargetPoint(locator)
  if (!targetPoint) return

  const targetX = targetPoint.x
  const targetY = targetPoint.y

  if (!cursor?.enabled) {
    await page.mouse.move(targetX, targetY)
    return
  }

  const previous = await page.evaluate(() => window.__flowcapCursorPosition || {
    x: Math.round(window.innerWidth * 0.5),
    y: Math.round(window.innerHeight * 0.3),
  })

  const distance = Math.hypot(targetX - previous.x, targetY - previous.y)
  // Speed-driven timing: cursor.speed = pixels/second (default 450)
  // Video length is whatever the mouse naturally takes
  const speed = Number.parseFloat(cursor?.speed) || 450
  const baseDur = options.duration ?? Math.max(Math.round((distance / speed) * 1000), 120)
  // ±12% duration variance — no two moves feel identical
  const duration = options.duration ?? clamp(
    Math.round(baseDur * (0.88 + Math.random() * 0.24)), 100, 3000,
  )
  const steps = clamp(Math.round(duration / 16), 6, 30)

  const dx = targetX - previous.x
  const dy = targetY - previous.y
  const dist = Math.max(distance, 1)
  // Random arc side + magnitude — real hands don't always curve the same way
  const sign = Math.random() > 0.5 ? 1 : -1
  const perpMag = Math.min(dist * (0.07 + Math.random() * 0.07), 44)
  const px = (-dy / dist) * perpMag * sign
  const py = (dx / dist) * perpMag * sign
  const c1x = previous.x + dx * 0.35 + px
  const c1y = previous.y + dy * 0.35 + py
  const c2x = previous.x + dx * 0.75 + px * 0.2
  const c2y = previous.y + dy * 0.75 + py * 0.2

  // Unique noise seeds for this move
  const seedJ = (Math.random() * 9999) | 0
  const seedV = (Math.random() * 9999) | 0
  const seedT = (Math.random() * 9999) | 0

  const fullDuration = duration + 130

  // Reset cursor to arrow at the start of movement (don't travel as pointer)
  await page.evaluate(() => {
    const el = document.getElementById('flowcap-showcase-cursor')
    if (!el) return
    el.classList.remove('is-pointer', 'is-dot')
    el.classList.add('is-arrow')
  })

  await page.evaluate(
    ({ fromX, fromY, cx1, cy1, cx2, cy2, toX, toY, durationMs, fullDurationMs, dist: d, sJ, sV, sT }) => {
      const cursorEl = document.getElementById('flowcap-showcase-cursor')
      if (!cursorEl) return
      cursorEl.style.setProperty('--flowcap-duration', '0ms')
      const startTime = performance.now()

      // Deterministic smooth noise: returns -1..1
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
          x: u*u*u*fromX + 3*u*u*t*cx1 + 3*u*t*t*cx2 + t*t*t*toX,
          y: u*u*u*fromY + 3*u*u*t*cy1 + 3*u*t*t*cy2 + t*t*t*toY,
        }
      }

      // Perpendicular unit vector (normal to travel direction)
      const pathLen = Math.hypot(toX - fromX, toY - fromY) || 1
      const nX = -(toY - fromY) / pathLen
      const nY = (toX - fromX) / pathLen

      function tick() {
        const elapsed = performance.now() - startTime
        const t = Math.min(elapsed / durationMs, 1)

        // Two-phase: ballistic accelerate → homing decelerate
        let bezT
        if (t < 0.58) {
          bezT = Math.pow(t / 0.58, 1.7) * 0.82
        } else {
          const p = (t - 0.58) / 0.42
          bezT = 0.82 + (1 - Math.pow(1 - p, 2.1)) * 0.18
        }
        // Velocity micro-bumps: ±8% speed irregularity
        bezT += fbm(t * 5 + 0.3, sV) * 0.08 * Math.sin(Math.PI * t)
        bezT = Math.max(0, Math.min(bezT, 1))

        const pos = elapsed < durationMs ? bez(bezT) : { x: toX, y: toY }

        // Perpendicular jitter: organic wobble, peaks mid-move
        const jEnv = Math.sin(Math.PI * t) * Math.min(d * 0.012, 7)
        const j = fbm(t * 10, sJ) * jEnv
        pos.x += nX * j
        pos.y += nY * j

        // Arrival tremor: hand oscillates as it locks onto target
        if (t > 0.82) {
          const p = (t - 0.82) / 0.18
          const amp = (1 - p) * Math.min(d * 0.009, 5.5)
          pos.x += Math.sin(p * 6 * Math.PI) * amp
          pos.y += Math.cos(p * 7 * Math.PI) * amp * 0.6
        }

        // Post-landing: hand still vibrating slightly after it stops
        if (elapsed > durationMs) {
          const p = (elapsed - durationMs) / 130
          const amp = Math.exp(-p * 3.5) * Math.min(d * 0.006, 3.5)
          pos.x += Math.sin(p * 9 * Math.PI + sT * 0.01) * amp
          pos.y += Math.cos(p * 11 * Math.PI + sT * 0.01) * amp * 0.5
        }

        cursorEl.style.setProperty('--flowcap-x', pos.x.toFixed(2))
        cursorEl.style.setProperty('--flowcap-y', pos.y.toFixed(2))

        if (elapsed < fullDurationMs) {
          window.__flowcapCursorAnimFrame = window.requestAnimationFrame(tick)
        } else {
          cursorEl.style.setProperty('--flowcap-x', String(toX))
          cursorEl.style.setProperty('--flowcap-y', String(toY))
          window.__flowcapCursorPosition = { x: toX, y: toY }
        }
      }

      if (window.__flowcapCursorAnimFrame) window.cancelAnimationFrame(window.__flowcapCursorAnimFrame)
      window.__flowcapCursorAnimFrame = window.requestAnimationFrame(tick)
    },
    {
      fromX: previous.x, fromY: previous.y,
      cx1: c1x, cy1: c1y, cx2: c2x, cy2: c2y,
      toX: targetX, toY: targetY,
      durationMs: duration, fullDurationMs: fullDuration,
      dist, sJ: seedJ, sV: seedV, sT: seedT,
    },
  )

  if (!options.skipNativeMouseMove) {
    await page.mouse.move(targetX, targetY, { steps })
  }
  await page.waitForTimeout(fullDuration)

  // Switch cursor type based on target element
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
    el.classList.remove('is-pointer', 'is-arrow', 'is-dot')
    el.classList.add(isPointer ? 'is-pointer' : 'is-arrow')
  }, needsPointer)

  // Brief pause so cursor type change is visible
  await page.waitForTimeout(80)
}

async function pulseShowcaseCursor(page, cursor) {
  if (!cursor?.enabled) return

  await page.evaluate(() => {
    const cursorEl = document.getElementById('flowcap-showcase-cursor')
    if (!cursorEl) return
    cursorEl.classList.remove('is-clicking')
    void cursorEl.offsetWidth
    cursorEl.classList.add('is-clicking')
  })
}

module.exports = {
  installShowcaseCursor,
  getLocatorInteractionPoint,
  moveShowcaseCursorToLocator,
  pulseShowcaseCursor,
}
