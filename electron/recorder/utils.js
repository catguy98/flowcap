function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function resolvePlacement(width, height, placement) {
  if (placement.align === 'center') {
    return {
      x: Math.round((1920 - width) / 2 + placement.x),
      y: Math.round((1080 - height) / 2 + placement.y),
    }
  }

  if (placement.align === 'bottom-right') {
    return {
      x: Math.round(1920 - width + placement.x),
      y: Math.round((1080 - height) + placement.y),
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
      return { preset: 'slower', crf: '12' }
    case 'high':
      return { preset: 'slow', crf: '15' }
    default:
      return { preset: 'fast', crf: '18' }
  }
}

module.exports = {
  clamp,
  resolvePlacement,
  getQualityProfile,
}
