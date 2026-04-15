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
        width: 26px;
        height: 38px;
        transform: translate(
          calc(var(--flowcap-x) * 1px - 2px),
          calc(var(--flowcap-y) * 1px - 2px)
        );
      }
      #flowcap-showcase-cursor.is-arrow::before {
        content: '';
        position: absolute;
        inset: 0;
        background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 26 38'%3E%3Cpath fill='%230f172a' stroke='%23ffffff' stroke-width='1.8' stroke-linejoin='round' d='M2 1v31l7.8-7.4 5.1 11.8 7-3.2-4.9-11.5H26L2 1Z'/%3E%3C/svg%3E");
        background-repeat: no-repeat;
        background-position: center;
        background-size: contain;
        filter: drop-shadow(0 3px 8px rgba(15, 23, 42, 0.22));
      }
      #flowcap-showcase-cursor.is-arrow::after {
        content: '';
        position: absolute;
        top: 2px;
        left: 1px;
        width: 24px;
        height: 24px;
        border-radius: 999px;
        border: 2px solid rgba(15, 23, 42, 0.12);
        opacity: 0;
        transform: scale(0.55);
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
    window.__flowcapCursorPosition = { x: 96, y: 96 }
  }, cursor?.style || 'dot')
}

async function moveShowcaseCursorToLocator(page, locator, cursor, options = {}) {
  const box = await locator.boundingBox()
  if (!box) return

  const targetX = box.x + box.width / 2
  const targetY = box.y + box.height / 2

  if (!cursor?.enabled) {
    await page.mouse.move(targetX, targetY)
    return
  }

  const previous = await page.evaluate(() => window.__flowcapCursorPosition || { x: 96, y: 96 })
  const distance = Math.hypot(targetX - previous.x, targetY - previous.y)
  const timingFactor =
    cursor?.adaptiveTiming && Number.isFinite(cursor?.durationSec)
      ? clamp(cursor.durationSec / 14, 0.85, 1.45)
      : 1
  const duration =
    options.duration ??
    clamp(Math.round(distance * 0.9 * timingFactor), 180, Math.round(420 * timingFactor))
  const steps = clamp(Math.round(duration / 16), 8, 30)

  await page.evaluate(
    ({ x, y, duration: moveDuration }) => {
      const cursorEl = document.getElementById('flowcap-showcase-cursor')
      if (!cursorEl) return
      cursorEl.style.setProperty('--flowcap-duration', `${moveDuration}ms`)
      cursorEl.style.setProperty('--flowcap-x', String(x))
      cursorEl.style.setProperty('--flowcap-y', String(y))
      window.__flowcapCursorPosition = { x, y }
    },
    { x: targetX, y: targetY, duration },
  )

  await page.mouse.move(targetX, targetY, { steps })
  await page.waitForTimeout(duration)
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
  moveShowcaseCursorToLocator,
  pulseShowcaseCursor,
}
