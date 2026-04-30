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
        background-image: url("data:image/svg+xml,%3Csvg version='1.1' xmlns='http://www.w3.org/2000/svg' width='32px' height='32px' viewBox='0 0 32 32'%3E%3Cg%3E%3Cpath fill='%23FFFFFF' d='M11.861,13.31c0.48-0.179,1.427-0.069,1.677,0.474c0.213,0.461,0.396,1.24,0.406,1.074 c0.024-0.369-0.024-6.167,0.137-6.584c0.117-0.304,0.347-0.59,0.686-0.691c0.285-0.086,0.621-0.115,0.917-0.055 c0.312,0.064,0.642,0.287,0.765,0.499c0.362,0.623,0.368,6.899,0.385,6.831c0.064-0.271,0.07-1.229,0.283-1.584 c0.141-0.234,0.497-0.445,0.688-0.479c0.294-0.053,0.655-0.068,0.964-0.008c0.249,0.049,0.586,0.344,0.677,0.486 c0.219,0.344,0.342,1.316,0.379,1.658c0.016,0.141,0.074-0.393,0.293-0.736c0.406-0.639,1.844-0.763,1.898,0.639 c0.025,0.654,0.02,0.625,0.02,1.064c0,0.516-0.012,0.828-0.04,1.203c-0.03,0.398-0.116,1.303-0.241,1.742 c-0.086,0.301-0.371,0.977-0.652,1.383c0,0-1.074,1.25-1.191,1.812s-0.078,0.566-0.102,0.965s0.121,0.924,0.121,0.924 s-0.802,0.104-1.234,0.033c-0.391-0.062-0.875-0.84-1-1.078c-0.172-0.328-0.539-0.266-0.682-0.023 c-0.225,0.383-0.709,1.07-1.051,1.113c-0.669,0.084-2.055,0.031-3.14,0.02c0,0,0.185-1.01-0.227-1.357 c-0.305-0.26-0.83-0.783-1.144-1.061l-0.832-0.92c-0.283-0.359-1.002-0.93-1.243-1.984c-0.213-0.938-0.192-1.396,0.037-1.771 c0.232-0.381,0.67-0.589,0.854-0.625c0.208-0.042,0.692-0.039,0.875,0.062c0.223,0.123,0.313,0.158,0.488,0.391 c0.23,0.306,0.312,0.457,0.213,0.121c-0.076-0.262-0.322-0.596-0.434-0.971c-0.109-0.36-0.401-0.942-0.38-1.525 C11.037,14.131,11.132,13.581,11.861,13.31'/%3E%3Cpath fill='none' stroke='%23010101' stroke-width='0.75' stroke-linejoin='round' d='M11.861,13.31 c0.48-0.179,1.427-0.069,1.677,0.474c0.213,0.461,0.396,1.24,0.406,1.074c0.024-0.369-0.024-6.167,0.137-6.584 c0.117-0.304,0.347-0.59,0.686-0.691c0.285-0.086,0.621-0.115,0.917-0.055c0.312,0.064,0.642,0.287,0.765,0.499 c0.362,0.623,0.368,6.899,0.385,6.831c0.064-0.271,0.07-1.229,0.283-1.584c0.141-0.234,0.497-0.445,0.688-0.479 c0.294-0.053,0.655-0.068,0.964-0.008c0.249,0.049,0.586,0.344,0.677,0.486c0.219,0.344,0.342,1.316,0.379,1.658 c0.016,0.141,0.074-0.393,0.293-0.736c0.406-0.639,1.844-0.763,1.898,0.639c0.025,0.654,0.02,0.625,0.02,1.064 c0,0.516-0.012,0.828-0.04,1.203c-0.03,0.398-0.116,1.303-0.241,1.742c-0.086,0.301-0.371,0.977-0.652,1.383 c0,0-1.074,1.25-1.191,1.812s-0.078,0.566-0.102,0.965s0.121,0.924,0.121,0.924s-0.802,0.104-1.234,0.033 c-0.391-0.062-0.875-0.84-1-1.078c-0.172-0.328-0.539-0.266-0.682-0.023c-0.225,0.383-0.709,1.07-1.051,1.113 c-0.669,0.084-2.055,0.031-3.14,0.02c0,0,0.185-1.01-0.227-1.357c-0.305-0.26-0.83-0.783-1.144-1.061l-0.832-0.92 c-0.283-0.359-1.002-0.93-1.243-1.984c-0.213-0.938-0.192-1.396,0.037-1.771c0.232-0.381,0.67-0.589,0.854-0.625 c0.208-0.042,0.692-0.039,0.875,0.062c0.223,0.123,0.313,0.158,0.488,0.391c0.23,0.306,0.312,0.457,0.213,0.121 c-0.076-0.262-0.322-0.596-0.434-0.971c-0.109-0.36-0.401-0.942-0.38-1.525C11.037,14.131,11.132,13.581,11.861,13.31z'/%3E%3Cline fill='none' stroke='%23010101' stroke-width='0.75' stroke-linecap='round' x1='18.854' y1='21.008' x2='18.854' y2='17.549'/%3E%3Cline fill='none' stroke='%23010101' stroke-width='0.75' stroke-linecap='round' x1='16.839' y1='21.02' x2='16.823' y2='17.547'/%3E%3Cline fill='none' stroke='%23010101' stroke-width='0.75' stroke-linecap='round' x1='14.843' y1='17.578' x2='14.864' y2='21.004'/%3E%3C/g%3E%3C/svg%3E");
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
