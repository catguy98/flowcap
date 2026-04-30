function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function resolvePlacement(width, height, placement, canvasWidth = 1920, canvasHeight = 1080) {
  if (placement.align === 'center') {
    return {
      x: Math.round((canvasWidth - width) / 2 + placement.x),
      y: Math.round((canvasHeight - height) / 2 + placement.y),
    }
  }

  if (placement.align === 'bottom-right') {
    return {
      x: Math.round(canvasWidth - width + placement.x),
      y: Math.round((canvasHeight - height) + placement.y),
    }
  }

  return {
    x: Math.round(placement.x),
    y: Math.round(placement.y),
  }
}

function getQualityProfile(quality) {
  switch (quality) {
    case 'ultra':
      return { preset: 'veryslow', crf: '10' }
    case 'high':
      return { preset: 'slow', crf: '15' }
    default:
      return { preset: 'medium', crf: '15' }
  }
}

module.exports = {
  clamp,
  resolvePlacement,
  getQualityProfile,
}
