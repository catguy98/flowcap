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

    function interpolateTrack(scope) {
      const track = [...(state.motion?.keyframes || [])]
        .filter((keyframe) => keyframe.scope === scope)
        .sort((a, b) => a.timeMs - b.timeMs)

      const base = { x: 0, y: 0, scale: 1 }
      const currentTimeMs = Math.min(state.motion?.currentTimeMs || 0, durationMs)
      if (track.length === 0) return base

      if (currentTimeMs <= track[0].timeMs) {
        if (track[0].timeMs <= 0) return { ...base, ...track[0] }
        const ratio = currentTimeMs / Math.max(track[0].timeMs, 1)
        return {
          x: base.x + (track[0].x - base.x) * ratio,
          y: base.y + (track[0].y - base.y) * ratio,
          scale: base.scale + (track[0].scale - base.scale) * ratio,
        }
      }

      for (let index = 0; index < track.length - 1; index += 1) {
        const left = track[index]
        const right = track[index + 1]
        if (currentTimeMs >= left.timeMs && currentTimeMs <= right.timeMs) {
          const ratio = (currentTimeMs - left.timeMs) / Math.max(right.timeMs - left.timeMs, 1)
          return {
            x: left.x + (right.x - left.x) * ratio,
            y: left.y + (right.y - left.y) * ratio,
            scale: left.scale + (right.scale - left.scale) * ratio,
          }
        }
      }

      return { ...base, ...track[track.length - 1] }
    }

    const deviceMotion = interpolateTrack('device')
    const contentMotion = interpolateTrack('content')

    const targetUrl = elements.projectUrlInput.value.trim()
    if (targetUrl) {
      const loadedUrl = elements.previewFrameEl.dataset.loadedUrl || ''
      if (loadedUrl !== targetUrl) {
        elements.previewFrameEl.src = targetUrl
        elements.previewFrameEl.dataset.loadedUrl = targetUrl
      }
    }

    if (state.preview?.snapshotDataUrl) {
      elements.previewSnapshotEl.hidden = false
      if (elements.previewSnapshotEl.src !== state.preview.snapshotDataUrl) {
        elements.previewSnapshotEl.src = state.preview.snapshotDataUrl
      }
    } else {
      elements.previewSnapshotEl.hidden = true
      elements.previewSnapshotEl.removeAttribute('src')
    }

    elements.previewCompositeEl.style.width = scaleToContainer(frameWidth)
    elements.previewCompositeEl.style.height = scaleToContainer(frameHeight)
    elements.previewCompositeEl.style.left = scaleToContainer(placement.x)
    elements.previewCompositeEl.style.top = scaleToContainer(placement.y)
    elements.previewCompositeEl.style.transform = `translate(${scaleToContainer(deviceMotion.x)}, ${scaleToContainer(deviceMotion.y)}) scale(${zoomScale * deviceMotion.scale})`
    elements.previewCompositeEl.style.transformOrigin = 'center center'

    elements.previewWindowEl.classList.toggle('has-mockup', Boolean(mockupSpec))
    elements.previewWindowEl.style.width = scaleToContainer(browserW)
    elements.previewWindowEl.style.height = scaleToContainer(browserH)
    elements.previewWindowEl.style.left = scaleToContainer(mockupSpec?.screenX || 0)
    elements.previewWindowEl.style.top = scaleToContainer(mockupSpec?.screenY || 0)
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
