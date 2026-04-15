const { clamp } = require('./utils')

function buildZoomFilterChain(inputLabel, outputLabel, zoomPercent, durationSec) {
  const numericZoom = Number.parseFloat(zoomPercent)
  if (!Number.isFinite(numericZoom) || numericZoom <= 0) {
    return `${inputLabel}format=yuv420p${outputLabel}`
  }

  const growth = (numericZoom / 100).toFixed(6)
  const duration = Math.max(Number.parseFloat(durationSec) || 0, 0.001).toFixed(3)
  const finalScale = (1 + Number.parseFloat(growth)).toFixed(6)

  return `${inputLabel}scale=w='iw*(if(lte(t\\,${duration})\\,1+${growth}*(t/${duration})\\,${finalScale}))':h='ih*(if(lte(t\\,${duration})\\,1+${growth}*(t/${duration})\\,${finalScale}))':eval=frame:flags=lanczos,crop=1920:1080:(iw-1920)/2:(ih-1080)/2,format=yuv420p${outputLabel}`
}

async function applyContentZoom(page, step) {
  const duration = parseInt(step.duration, 10) || 420
  const percent = Number.parseFloat(step.percent ?? step.level) || 0
  const scale = 1 + percent / 100
  let originX = 50
  let originY = 50

  if (step.selector) {
    const locator = page.locator(step.selector).first()
    await locator.waitFor({ state: 'visible', timeout: 5000 })
    const box = await locator.boundingBox()
    const viewport = page.viewportSize()

    if (box && viewport) {
      originX = clamp(((box.x + box.width / 2) / viewport.width) * 100, 0, 100)
      originY = clamp(((box.y + box.height / 2) / viewport.height) * 100, 0, 100)
    }
  } else if (percent === 0) {
    const lastOrigin = await page.evaluate(() => window.__flowcapContentZoomOrigin || null)
    if (lastOrigin) {
      originX = lastOrigin.x
      originY = lastOrigin.y
    }
  }

  await page.evaluate(
    ({ durationMs, scaleValue, originXPercent, originYPercent, resetAfter }) => {
      const root =
        document.querySelector('[data-flowcap-zoom-root]') ||
        document.getElementById('root') ||
        document.querySelector('main') ||
        document.body.firstElementChild ||
        document.body
      if (!root) return

      root.style.transition = `transform ${durationMs}ms cubic-bezier(0.16, 1, 0.3, 1)`
      root.style.transformOrigin = `${originXPercent}% ${originYPercent}%`
      root.style.transform = `scale(${scaleValue})`
      root.style.willChange = 'transform'
      window.__flowcapContentZoomOrigin = { x: originXPercent, y: originYPercent }

      if (resetAfter) {
        window.setTimeout(() => {
          root.style.willChange = ''
          root.style.transformOrigin = '50% 50%'
          window.__flowcapContentZoomOrigin = null
        }, durationMs)
      }
    },
    {
      durationMs: duration,
      scaleValue: scale,
      originXPercent: originX,
      originYPercent: originY,
      resetAfter: percent === 0,
    },
  )

  await page.waitForTimeout(duration)
}

async function installMotionTimeline(page, motion) {
  const keyframes = Array.isArray(motion?.keyframes)
    ? motion.keyframes
        .map((keyframe) => ({
          scope: keyframe.scope === 'device' ? 'device' : 'content',
          timeMs: parseInt(keyframe.timeMs, 10) || 0,
          x: parseInt(keyframe.x, 10) || 0,
          y: parseInt(keyframe.y, 10) || 0,
          scale: Number.parseFloat(keyframe.scale) || 1,
        }))
        .sort((a, b) => a.timeMs - b.timeMs)
    : []

  if (keyframes.length === 0) return

  await page.evaluate((timelineKeyframes) => {
    const root =
      document.querySelector('[data-flowcap-zoom-root]') ||
      document.getElementById('root') ||
      document.querySelector('main') ||
      document.body.firstElementChild ||
      document.body
    if (!root) return

    const groups = {
      content: timelineKeyframes.filter((keyframe) => keyframe.scope === 'content'),
      device: timelineKeyframes.filter((keyframe) => keyframe.scope === 'device'),
    }

    function interpolate(track, timeMs) {
      const base = { x: 0, y: 0, scale: 1 }
      if (!track.length) return base

      if (timeMs <= track[0].timeMs) {
        if (track[0].timeMs <= 0) return { ...base, ...track[0] }
        const ratio = timeMs / Math.max(track[0].timeMs, 1)
        return {
          x: base.x + (track[0].x - base.x) * ratio,
          y: base.y + (track[0].y - base.y) * ratio,
          scale: base.scale + (track[0].scale - base.scale) * ratio,
        }
      }

      for (let index = 0; index < track.length - 1; index += 1) {
        const left = track[index]
        const right = track[index + 1]
        if (timeMs >= left.timeMs && timeMs <= right.timeMs) {
          const ratio = (timeMs - left.timeMs) / Math.max(right.timeMs - left.timeMs, 1)
          return {
            x: left.x + (right.x - left.x) * ratio,
            y: left.y + (right.y - left.y) * ratio,
            scale: left.scale + (right.scale - left.scale) * ratio,
          }
        }
      }

      return { ...base, ...track[track.length - 1] }
    }

    if (window.__flowcapMotionFrame) {
      window.cancelAnimationFrame(window.__flowcapMotionFrame)
    }

    const start = performance.now()
    root.style.willChange = 'transform'

    function tick() {
      const elapsed = performance.now() - start
      const content = interpolate(groups.content, elapsed)
      const device = interpolate(groups.device, elapsed)
      const totalX = content.x + device.x
      const totalY = content.y + device.y
      const totalScale = content.scale * device.scale

      root.style.transformOrigin = '50% 50%'
      root.style.transform = `translate(${totalX}px, ${totalY}px) scale(${totalScale})`
      window.__flowcapMotionFrame = window.requestAnimationFrame(tick)
    }

    window.__flowcapMotionFrame = window.requestAnimationFrame(tick)
  }, keyframes)
}

module.exports = {
  buildZoomFilterChain,
  applyContentZoom,
  installMotionTimeline,
}
