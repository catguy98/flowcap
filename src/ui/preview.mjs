function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function resolvePlacement(width, height, align, offsetX, offsetY) {
  if (align === 'center') {
    return {
      x: (1920 - width) / 2 + offsetX,
      y: (1080 - height) / 2 + offsetY,
    }
  }

  if (align === 'bottom-right') {
    return {
      x: 1920 - width + offsetX,
      y: 1080 - height + offsetY,
    }
  }

  return {
    x: offsetX,
    y: offsetY,
  }
}

function getZoomScale(zoomPercent) {
  const numeric = Number.parseFloat(zoomPercent)
  if (!Number.isFinite(numeric) || numeric <= 0) return 1
  return 1 + numeric / 100
}

function getMockupSpec(type, browserW, browserH, borderRadius) {
  if (type === 'browser') {
    return {
      type,
      outerWidth: browserW + 48,
      outerHeight: browserH + 72,
      screenX: 24,
      screenY: 52,
      screenRadius: Math.max(borderRadius, 18),
    }
  }

  if (type === 'phone') {
    return {
      type,
      outerWidth: browserW + 72,
      outerHeight: browserH + 116,
      screenX: 36,
      screenY: 58,
      screenRadius: Math.max(borderRadius, 28),
    }
  }

  return null
}

function formatMockupTitle(url) {
  if (!url) return 'Local Preview'
  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return 'Local Preview'
    const label = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
    return label.length > 42 ? `${label.slice(0, 39)}...` : label
  } catch {
    return 'Local Preview'
  }
}

function renderPreviewMockup(elements, spec, url) {
  const { previewMockupEl } = elements

  if (!spec) {
    previewMockupEl.hidden = true
    previewMockupEl.className = 'preview-mockup'
    previewMockupEl.innerHTML = ''
    return
  }

  previewMockupEl.hidden = false
  previewMockupEl.className = `preview-mockup is-${spec.type}`

  if (spec.type === 'browser') {
    previewMockupEl.innerHTML = `
      <div class="preview-mockup-shell">
        <div class="preview-mockup-browser-header"></div>
        <div class="preview-mockup-browser-dots">
          <span class="preview-mockup-browser-dot red"></span>
          <span class="preview-mockup-browser-dot yellow"></span>
          <span class="preview-mockup-browser-dot green"></span>
        </div>
        <div class="preview-mockup-browser-toolbar">
          <div class="preview-mockup-browser-pill">${formatMockupTitle(url)}</div>
        </div>
      </div>
    `
    return
  }

  if (spec.type === 'phone') {
    previewMockupEl.innerHTML = `
      <div class="preview-mockup-shell">
        <div class="preview-mockup-phone-notch"></div>
      </div>
    `
    return
  }

  previewMockupEl.innerHTML = ''
}

function getSelectedTargetRect(state) {
  const selectedKeyframeId = state.motion?.selectedKeyframeId
  if (!selectedKeyframeId) return null

  const selectedKeyframe = state.motion.keyframes.find(
    (keyframe) => keyframe.id === selectedKeyframeId,
  )
  if (!selectedKeyframe?.targetId) return null

  const target = (state.motion.bridgeTargets || []).find(
    (bridgeTarget) => bridgeTarget.id === selectedKeyframe.targetId,
  )

  if (!target?.rect) return null

  return {
    label: target.label,
    rect: target.rect,
  }
}

function easeInOutCubic(ratio) {
  if (ratio < 0.5) {
    return 4 * ratio * ratio * ratio
  }

  return 1 - Math.pow(-2 * ratio + 2, 3) / 2
}

function easeCinematic(ratio) {
  if (ratio < 0.5) {
    return 16 * ratio * ratio * ratio * ratio * ratio
  }

  return 1 - Math.pow(-2 * ratio + 2, 5) / 2
}

function getBridgeTarget(state, targetId) {
  if (!targetId) return null
  return (state.motion.bridgeTargets || []).find((target) => target.id === targetId) || null
}

function resolveKeyframeMotion({
  keyframe,
  state,
  scope,
  browserW,
  browserH,
  placement,
  mockupSpec,
}) {
  const zoomFactor = clamp(((Number.parseFloat(keyframe?.scale) || 1) - 1) / 0.6, 0, 1)
  const base = {
    x: parseInt(keyframe?.x, 10) || 0,
    y: parseInt(keyframe?.y, 10) || 0,
    scale: Number.parseFloat(keyframe?.scale) || 1,
  }

  if (!keyframe?.targetId) return base

  const target = getBridgeTarget(state, keyframe.targetId)
  if (!target?.rect) return base

  const viewportW = scope === 'device' ? 1920 : browserW
  const viewportH = scope === 'device' ? 1080 : browserH
  const targetWidth = target.rect.width * browserW
  const targetHeight = target.rect.height * browserH
  const targetCenterX = (target.rect.x + target.rect.width / 2) * browserW
  const targetCenterY = (target.rect.y + target.rect.height / 2) * browserH
  const paddedTargetWidth = targetWidth + viewportW * (0.22 - zoomFactor * 0.1)
  const paddedTargetHeight = targetHeight + viewportH * (0.22 - zoomFactor * 0.1)
  const fitScale = Math.min(
    viewportW / Math.max(paddedTargetWidth, 1),
    viewportH / Math.max(paddedTargetHeight, 1),
  )
  const resolvedScale = Math.max(
    1,
    1 + (Math.max(fitScale, 1) - 1) * easeCinematic(zoomFactor),
  )

  if (scope === 'device') {
    const screenOffsetX = mockupSpec?.screenX || 0
    const screenOffsetY = mockupSpec?.screenY || 0
    const targetShotX = placement.x + screenOffsetX + targetCenterX
    const targetShotY = placement.y + screenOffsetY + targetCenterY
    const centerX = 1920 / 2
    const centerY = 1080 / 2

    return {
      x: Math.round((centerX - targetShotX) * resolvedScale + base.x),
      y: Math.round((centerY - targetShotY) * resolvedScale + base.y),
      scale: resolvedScale,
    }
  }

  return {
    x: Math.round(((browserW / 2) - targetCenterX) * resolvedScale + base.x),
    y: Math.round(((browserH / 2) - targetCenterY) * resolvedScale + base.y),
    scale: resolvedScale,
  }
}

function interpolateResolvedTrack({
  keyframes,
  scope,
  currentTimeMs,
  state,
  browserW,
  browserH,
  placement,
  mockupSpec,
}) {
  const track = [...(keyframes || [])]
    .filter((keyframe) => keyframe.scope === scope)
    .sort((a, b) => a.timeMs - b.timeMs)

  const base = { x: 0, y: 0, scale: 1 }
  if (track.length === 0) return base

  const resolve = (keyframe) =>
    resolveKeyframeMotion({
      keyframe,
      state,
      scope,
      browserW,
      browserH,
      placement,
      mockupSpec,
    })

  if (currentTimeMs <= track[0].timeMs) {
    if (track[0].timeMs <= 0) return resolve(track[0])
    const ratio = easeCinematic(clamp(currentTimeMs / Math.max(track[0].timeMs, 1), 0, 1))
    const right = resolve(track[0])
    return {
      x: base.x + (right.x - base.x) * ratio,
      y: base.y + (right.y - base.y) * ratio,
      scale: base.scale + (right.scale - base.scale) * ratio,
    }
  }

  for (let index = 0; index < track.length - 1; index += 1) {
    const left = track[index]
    const right = track[index + 1]
    if (currentTimeMs >= left.timeMs && currentTimeMs <= right.timeMs) {
      const span = Math.max(right.timeMs - left.timeMs, 1)
      const ratio = easeCinematic(clamp((currentTimeMs - left.timeMs) / span, 0, 1))
      const leftResolved = resolve(left)
      const rightResolved = resolve(right)
      return {
        x: leftResolved.x + (rightResolved.x - leftResolved.x) * ratio,
        y: leftResolved.y + (rightResolved.y - leftResolved.y) * ratio,
        scale:
          leftResolved.scale + (rightResolved.scale - leftResolved.scale) * ratio,
      }
    }
  }

  return resolve(track[track.length - 1])
}

export function createPreviewRenderer(elements, state) {
  return function updatePreview() {
    const browserW = parseInt(elements.browserWInput.value, 10) || 1280
    const browserH = parseInt(elements.browserHInput.value, 10) || 800
    const offsetX = parseInt(elements.offsetXInput.value, 10) || 0
    const offsetY = parseInt(elements.offsetYInput.value, 10) || 0
    const align = elements.videoAlignInput.value
    const borderRadius = parseInt(elements.borderRadiusInput.value, 10) || 0
    const zoomPercent = Number.parseFloat(elements.zoomPercentInput.value) || 0
    const zoomScale = getZoomScale(zoomPercent)
    const bgColor = elements.bgColorInput.value
    const mockupSpec = getMockupSpec(
      elements.mockupTypeInput.value,
      browserW,
      browserH,
      borderRadius,
    )
    const frameWidth = mockupSpec?.outerWidth || browserW
    const frameHeight = mockupSpec?.outerHeight || browserH
    const placement = resolvePlacement(frameWidth, frameHeight, align, offsetX, offsetY)
    const durationMs = Math.max((parseInt(elements.durationSecInput.value, 10) || 15) * 1000, 1000)
    const scaleToContainer = (value) => `${((value / 1920) * 100).toFixed(4)}cqw`
    const isLiveBridgeReady = elements.previewStageEl.dataset.liveBridgeReady === 'true'
    const isViewportPreview =
      isLiveBridgeReady && (elements.mockupTypeInput.value || 'none') === 'none'

    const currentTimeMs = Math.min(state.motion?.currentTimeMs || 0, durationMs)
    const deviceMotion = interpolateResolvedTrack({
      keyframes: state.motion?.keyframes || [],
      scope: 'device',
      currentTimeMs,
      state,
      browserW,
      browserH,
      placement,
      mockupSpec,
    })
    const contentMotion = interpolateResolvedTrack({
      keyframes: state.motion?.keyframes || [],
      scope: 'content',
      currentTimeMs,
      state,
      browserW,
      browserH,
      placement,
      mockupSpec,
    })

    if (state.preview?.snapshotDataUrl) {
      elements.previewSnapshotEl.hidden = false
      if (elements.previewSnapshotEl.src !== state.preview.snapshotDataUrl) {
        elements.previewSnapshotEl.src = state.preview.snapshotDataUrl
      }
    } else {
      elements.previewSnapshotEl.hidden = true
      elements.previewSnapshotEl.removeAttribute('src')
    }

    elements.previewStageEl.dataset.previewMode = isViewportPreview ? 'viewport' : 'shot'
    elements.previewStageEl.style.aspectRatio = isViewportPreview
      ? `${browserW} / ${browserH}`
      : '1920 / 1080'

    elements.previewCompositeEl.style.width = isViewportPreview
      ? '100%'
      : scaleToContainer(frameWidth)
    elements.previewCompositeEl.style.height = isViewportPreview
      ? '100%'
      : scaleToContainer(frameHeight)
    elements.previewCompositeEl.style.left = isViewportPreview ? '0' : scaleToContainer(placement.x)
    elements.previewCompositeEl.style.top = isViewportPreview ? '0' : scaleToContainer(placement.y)
    elements.previewCompositeEl.style.transform = `translate(${scaleToContainer(deviceMotion.x)}, ${scaleToContainer(deviceMotion.y)}) scale(${zoomScale * deviceMotion.scale})`
    elements.previewCompositeEl.style.transformOrigin = 'center center'

    elements.previewWindowEl.classList.toggle('has-mockup', Boolean(mockupSpec))
    elements.previewWindowEl.style.width = isViewportPreview
      ? '100%'
      : scaleToContainer(browserW)
    elements.previewWindowEl.style.height = isViewportPreview
      ? '100%'
      : scaleToContainer(browserH)
    elements.previewWindowEl.style.left = isViewportPreview
      ? '0'
      : scaleToContainer(mockupSpec?.screenX || 0)
    elements.previewWindowEl.style.top = isViewportPreview
      ? '0'
      : scaleToContainer(mockupSpec?.screenY || 0)
    elements.previewWindowEl.style.borderRadius = scaleToContainer(
      mockupSpec?.screenRadius || borderRadius,
    )
    elements.previewContentEl.style.transform = `translate(${scaleToContainer(contentMotion.x)}, ${scaleToContainer(contentMotion.y)}) scale(${contentMotion.scale})`
    elements.previewContentEl.style.transformOrigin = 'center center'

    if (mockupSpec) {
      renderPreviewMockup(elements, mockupSpec, elements.projectUrlInput.value.trim())
      elements.previewMockupEl.style.width = scaleToContainer(mockupSpec.outerWidth)
      elements.previewMockupEl.style.height = scaleToContainer(mockupSpec.outerHeight)
      elements.previewMockupEl.style.left = '0'
      elements.previewMockupEl.style.top = '0'
    } else {
      renderPreviewMockup(elements, null, '')
    }

    if (elements.showCursorInput.checked) {
      elements.previewCursorEl.hidden = false
      elements.previewCursorEl.className = `preview-cursor is-${elements.cursorStyleInput.value || 'dot'}`
      elements.previewCursorEl.style.left = scaleToContainer(
        (mockupSpec?.screenX || 0) + browserW * 0.72,
      )
      elements.previewCursorEl.style.top = scaleToContainer(
        (mockupSpec?.screenY || 0) + browserH * 0.68,
      )
    } else {
      elements.previewCursorEl.hidden = true
    }

    const selectedTarget = getSelectedTargetRect(state)
    if (selectedTarget) {
      elements.previewTargetHighlightEl.hidden = false
      elements.previewTargetHighlightEl.style.left = `${selectedTarget.rect.x * 100}%`
      elements.previewTargetHighlightEl.style.top = `${selectedTarget.rect.y * 100}%`
      elements.previewTargetHighlightEl.style.width = `${selectedTarget.rect.width * 100}%`
      elements.previewTargetHighlightEl.style.height = `${selectedTarget.rect.height * 100}%`
      elements.previewTargetLabelEl.textContent = selectedTarget.label
    } else {
      elements.previewTargetHighlightEl.hidden = true
      elements.previewTargetLabelEl.textContent = ''
    }

    if (state.selectedBgImagePath) {
      const fileUri = `file:///${state.selectedBgImagePath.replace(/\\/g, '/')}`
      elements.previewBgEl.style.backgroundImage = `url('${fileUri}')`
      elements.previewBgEl.style.backgroundColor = ''
    } else {
      elements.previewBgEl.style.backgroundImage = ''
      elements.previewBgEl.style.backgroundColor = bgColor
    }

    if (elements.previewInfoEl) {
      elements.previewInfoEl.textContent =
        zoomPercent > 0
          ? `1920 × 1080 · H.264 · 60fps · ${elements.outputQualityInput.value || 'standard'} · ${zoomPercent}% zoom`
          : `1920 × 1080 · H.264 · 60fps · ${elements.outputQualityInput.value || 'standard'}`
    }
  }
}
