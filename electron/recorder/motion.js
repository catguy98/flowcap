const { clamp } = require('./utils')

function buildZoomFilterChain(inputLabel, outputLabel, zoomPercent, durationSec, camera = {}, outputWidth = 1920, outputHeight = 1080) {
  const numericZoom = Number.parseFloat(zoomPercent)
  if (!Number.isFinite(numericZoom) || numericZoom <= 0) {
    return `${inputLabel}format=yuv420p${outputLabel}`
  }

  const growth = (numericZoom / 100).toFixed(6)
  const totalDurationSec = Math.max(Number.parseFloat(durationSec) || 0, 0.001)
  const suggestedDurationMs = Math.min(
    Math.max(Math.round(totalDurationSec * 1000 * 0.18), 650),
    1400,
  )
  const maxZoomStartMs = Math.max(Math.round(totalDurationSec * 1000) - 120, 0)
  const cameraZoomStartMs = Math.min(
    Math.max(parseInt(camera?.zoomStartMs, 10) || 0, 0),
    maxZoomStartMs,
  )
  const cameraZoomDurationMs =
    Math.max(parseInt(camera?.zoomDurationMs, 10) || suggestedDurationMs, 120)
  const availableZoomDurationMs = Math.max(
    Math.round(totalDurationSec * 1000) - cameraZoomStartMs - 50,
    120,
  )
  const zoomDurationSec = (cameraZoomDurationMs / 1000).toFixed(3)
  const clampedZoomDurationSec = Math.min(
    Number.parseFloat(zoomDurationSec),
    availableZoomDurationMs / 1000,
  ).toFixed(3)
  const zoomStartSec = (cameraZoomStartMs / 1000).toFixed(3)
  const zoomEndSec = (Number.parseFloat(zoomStartSec) + Number.parseFloat(clampedZoomDurationSec)).toFixed(3)
  const rawAnchorX = Number.parseFloat(camera?.anchorX)
  const rawAnchorY = Number.parseFloat(camera?.anchorY)
  const anchorX = clamp(Math.round(Number.isFinite(rawAnchorX) ? rawAnchorX : outputWidth / 2), 0, outputWidth)
  const anchorY = clamp(Math.round(Number.isFinite(rawAnchorY) ? rawAnchorY : outputHeight / 2), 0, outputHeight)
  const progressExpr = `if(lt(t\\,${zoomStartSec})\\,0\\,if(lte(t\\,${zoomEndSec})\\,(t-${zoomStartSec})/${clampedZoomDurationSec}\\,1))`
  const easedProgressExpr = `if(lte(${progressExpr}\\,0.5)\\,16*pow(${progressExpr}\\,5)\\,1-pow(-2*${progressExpr}+2\\,5)/2)`
  const scaleExpr = `1+${growth}*(${easedProgressExpr})`
  const scaledW = `${outputWidth}*(${scaleExpr})`
  const scaledH = `${outputHeight}*(${scaleExpr})`
  const cropXExpr = `max(0\\,min(${scaledW}-${outputWidth}\\,${anchorX}*(${scaleExpr})-${anchorX}))`
  const cropYExpr = `max(0\\,min(${scaledH}-${outputHeight}\\,${anchorY}*(${scaleExpr})-${anchorY}))`

  return `${inputLabel}scale=w='iw*(${scaleExpr})':h='ih*(${scaleExpr})':eval=frame:flags=bicubic,crop=${outputWidth}:${outputHeight}:${cropXExpr}:${cropYExpr},format=yuv420p${outputLabel}`
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
          targetId: typeof keyframe.targetId === 'string' ? keyframe.targetId : '',
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

    function easeCinematic(ratio) {
      if (ratio < 0.5) {
        return 16 * ratio * ratio * ratio * ratio * ratio
      }

      return 1 - Math.pow(-2 * ratio + 2, 5) / 2
    }

    function getTargetElement(targetId) {
      if (!targetId) return null
      const selectorValue =
        window.CSS && typeof window.CSS.escape === 'function'
          ? window.CSS.escape(targetId)
          : String(targetId).replace(/["\\]/g, '\\$&')
      return document.querySelector(`[data-flowcap-motion-target="${selectorValue}"]`)
    }

    function resolveKeyframe(keyframe) {
      const base = { x: 0, y: 0, scale: 1 }
      if (!keyframe) return base

      const resolved = {
        x: Number.isFinite(keyframe.x) ? keyframe.x : 0,
        y: Number.isFinite(keyframe.y) ? keyframe.y : 0,
        scale: Number.isFinite(keyframe.scale) ? keyframe.scale : 1,
      }

      if (!keyframe.targetId) return resolved

      const target = getTargetElement(keyframe.targetId)
      const viewportWidth = Math.max(window.innerWidth, 1)
      const viewportHeight = Math.max(window.innerHeight, 1)
      const box = target?.getBoundingClientRect()
      if (!box || box.width <= 0 || box.height <= 0) return resolved

      const zoomFactor = Math.min(Math.max((resolved.scale - 1) / 0.6, 0), 1)
      const paddedTargetWidth =
        box.width + viewportWidth * (0.22 - zoomFactor * 0.1)
      const paddedTargetHeight =
        box.height + viewportHeight * (0.22 - zoomFactor * 0.1)
      const fitScale = Math.min(
        viewportWidth / Math.max(paddedTargetWidth, 1),
        viewportHeight / Math.max(paddedTargetHeight, 1),
      )
      const framedScale = Math.max(
        1,
        1 + (Math.max(fitScale, 1) - 1) * easeCinematic(zoomFactor),
      )
      const targetCenterX = box.x + box.width / 2
      const targetCenterY = box.y + box.height / 2
      const centerX = viewportWidth / 2
      const centerY = viewportHeight / 2

      return {
        x: Math.round((centerX - targetCenterX) * framedScale + resolved.x),
        y: Math.round((centerY - targetCenterY) * framedScale + resolved.y),
        scale: framedScale,
      }
    }

    function interpolate(track, timeMs) {
      const base = { x: 0, y: 0, scale: 1 }
      if (!track.length) return base

      if (timeMs <= track[0].timeMs) {
        if (track[0].timeMs <= 0) return resolveKeyframe(track[0])
        const ratio = easeCinematic(timeMs / Math.max(track[0].timeMs, 1))
        const right = resolveKeyframe(track[0])
        return {
          x: base.x + (right.x - base.x) * ratio,
          y: base.y + (right.y - base.y) * ratio,
          scale: base.scale + (right.scale - base.scale) * ratio,
        }
      }

      for (let index = 0; index < track.length - 1; index += 1) {
        const left = track[index]
        const right = track[index + 1]
        if (timeMs >= left.timeMs && timeMs <= right.timeMs) {
          const ratio = easeCinematic(
            (timeMs - left.timeMs) / Math.max(right.timeMs - left.timeMs, 1),
          )
          const leftResolved = resolveKeyframe(left)
          const rightResolved = resolveKeyframe(right)
          return {
            x: leftResolved.x + (rightResolved.x - leftResolved.x) * ratio,
            y: leftResolved.y + (rightResolved.y - leftResolved.y) * ratio,
            scale:
              leftResolved.scale + (rightResolved.scale - leftResolved.scale) * ratio,
          }
        }
      }

      return resolveKeyframe(track[track.length - 1])
    }

    // Use setInterval instead of requestAnimationFrame.
    // In Studio Render mode, Playwright runs a virtual clock via context.clock.install().
    // requestAnimationFrame only fires on real screen repaints — which never happen in
    // headless mode — so the motion timeline would be completely frozen.
    // setInterval IS driven by the virtual clock (context.clock controls setTimeout/setInterval),
    // so setInterval(tick, 1) fires on every clock.runFor() call and correctly animates
    // frame-by-frame alongside the screenshot capture loop.
    if (window.__flowcapMotionInterval) {
      clearInterval(window.__flowcapMotionInterval)
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
    }

    window.__flowcapMotionInterval = setInterval(tick, 1)
  }, keyframes)
}

module.exports = {
  buildZoomFilterChain,
  applyContentZoom,
  installMotionTimeline,
}
