function estimateStepDuration(step) {
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

function buildPreviewSteps(steps, timeMs) {
  let elapsed = 0
  const previewSteps = []

  for (const step of steps) {
    const duration = estimateStepDuration(step)
    const stepStart = elapsed
    const stepEnd = elapsed + duration

    if (timeMs < stepStart) {
      break
    }

    if (step.action === 'type') {
      const fullText = step.text || ''
      let text = fullText
      if (timeMs < stepEnd && fullText.length > 0) {
        const delay = parseInt(step.delay, 10) || 14
        const activeMs = Math.max(timeMs - stepStart - 160, 0)
        const charCount = Math.max(Math.min(Math.floor(activeMs / delay), fullText.length), 0)
        text = fullText.slice(0, charCount)
      }

      previewSteps.push({
        ...step,
        text,
        delay: 0,
      })
    } else if (
      step.action !== 'wait' &&
      step.action !== 'wait_for' &&
      step.action !== 'content_zoom' &&
      step.action !== 'zoom' &&
      step.action !== 'zoom_out'
    ) {
      previewSteps.push(step)
    }

    elapsed = stepEnd
  }

  return previewSteps
}

module.exports = {
  estimateStepDuration,
  buildPreviewSteps,
}

