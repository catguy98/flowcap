export function estimateStepDuration(step) {
  switch (step.action) {
    case 'wait':
      return parseInt(step.ms, 10) || 0
    case 'wait_for':
      return 180
    case 'hover':
      return 260
    case 'click':
      return 220
    case 'scroll':
      return 240
    case 'type': {
      const textLength = (step.text || '').length
      const delay = parseInt(step.delay, 10) || 0
      return textLength * Math.max(delay, 14) + 160
    }
    case 'content_zoom':
    case 'zoom':
      return parseInt(step.duration, 10) || 420
    case 'zoom_out':
      return parseInt(step.duration, 10) || 380
    default:
      return 140
  }
}

export function deriveMotionFromSteps(steps) {
  let currentTimeMs = 0
  let currentScale = 1
  const keyframes = []
  const filteredSteps = []

  for (const step of steps) {
    if (step.action === 'content_zoom' || step.action === 'zoom') {
      const duration = parseInt(step.duration, 10) || 420
      const percent =
        step.action === 'zoom'
          ? Math.max((Number.parseFloat(step.level) - 1) * 100, 0)
          : Number.parseFloat(step.percent) || 0
      const nextScale = 1 + percent / 100
      keyframes.push({
        id: `kf_${Math.random().toString(36).slice(2, 8)}`,
        timeMs: currentTimeMs,
        scope: 'content',
        x: 0,
        y: 0,
        scale: Number(currentScale.toFixed(3)),
      })
      currentTimeMs += duration
      currentScale = nextScale
      keyframes.push({
        id: `kf_${Math.random().toString(36).slice(2, 8)}`,
        timeMs: currentTimeMs,
        scope: 'content',
        x: 0,
        y: 0,
        scale: Number(currentScale.toFixed(3)),
      })
      continue
    }

    if (step.action === 'zoom_out') {
      const duration = parseInt(step.duration, 10) || 380
      keyframes.push({
        id: `kf_${Math.random().toString(36).slice(2, 8)}`,
        timeMs: currentTimeMs,
        scope: 'content',
        x: 0,
        y: 0,
        scale: Number(currentScale.toFixed(3)),
      })
      currentTimeMs += duration
      currentScale = 1
      keyframes.push({
        id: `kf_${Math.random().toString(36).slice(2, 8)}`,
        timeMs: currentTimeMs,
        scope: 'content',
        x: 0,
        y: 0,
        scale: 1,
      })
      continue
    }

    filteredSteps.push(step)
    currentTimeMs += estimateStepDuration(step)
  }

  return {
    keyframes,
    filteredSteps,
  }
}

export function getFlowDurationMs(steps, fallbackDurationSec = 15) {
  const stepDurationMs = (Array.isArray(steps) ? steps : []).reduce(
    (total, step) => total + estimateStepDuration(step),
    0,
  )
  return Math.max(stepDurationMs, (parseInt(fallbackDurationSec, 10) || 15) * 1000, 1000)
}
