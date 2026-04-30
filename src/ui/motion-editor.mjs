function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createId() {
  return `kf_${Math.random().toString(36).slice(2, 8)}`
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
}

function formatTime(ms) {
  return `${(ms / 1000).toFixed(2)}s`
}

function scaleToZoomPercent(scale) {
  return Math.max(Math.round((scale - 1) * 100), 0)
}

function zoomPercentToScale(percent) {
  return 1 + clamp(percent, 0, 60) / 100
}

function getAvailableTargets(state) {
  return Array.isArray(state.motion.bridgeTargets) ? state.motion.bridgeTargets : []
}

function getTargetById(state, targetId) {
  return getAvailableTargets(state).find((target) => target.id === targetId) || null
}

function ensureDurationMs(state, elements) {
  return Math.max((parseInt(elements.durationSecInput.value, 10) || 15) * 1000, 1000)
}

function sortKeyframes(keyframes) {
  return [...keyframes].sort((a, b) => a.timeMs - b.timeMs)
}

function interpolateTrack(keyframes, scope, currentTimeMs) {
  const track = sortKeyframes(
    keyframes.filter((keyframe) => keyframe.scope === scope),
  )

  const base = { x: 0, y: 0, scale: 1 }
  if (track.length === 0) return base

  if (currentTimeMs <= track[0].timeMs) {
    if (track[0].timeMs <= 0) return { ...base, ...track[0] }
    const ratio = clamp(currentTimeMs / track[0].timeMs, 0, 1)
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
      const span = Math.max(right.timeMs - left.timeMs, 1)
      const ratio = clamp((currentTimeMs - left.timeMs) / span, 0, 1)
      return {
        x: left.x + (right.x - left.x) * ratio,
        y: left.y + (right.y - left.y) * ratio,
        scale: left.scale + (right.scale - left.scale) * ratio,
      }
    }
  }

  return { ...base, ...track[track.length - 1] }
}

function findNearestTrackKeyframe(keyframes, scope, currentTimeMs) {
  const track = sortKeyframes(
    keyframes.filter((keyframe) => keyframe.scope === scope),
  )

  let nearest = null
  for (const keyframe of track) {
    if (keyframe.timeMs <= currentTimeMs) {
      nearest = keyframe
      continue
    }
    break
  }

  return nearest
}

function findKeyframe(state) {
  return state.motion.keyframes.find((keyframe) => keyframe.id === state.motion.selectedKeyframeId)
}

function renderInspector(elements, state, handlers) {
  const inspector = elements.motionInspectorEl
  const selected = findKeyframe(state)

  if (!selected) {
    inspector.innerHTML =
      '<div class="motion-empty">Add a keyframe to start visual motion editing.</div>'
    return
  }

  inspector.innerHTML = `
    <div class="motion-grid">
      <label class="motion-field">
        <span>Time</span>
        <input type="number" id="motionFieldTime" min="0" step="10" />
      </label>
      <label class="motion-field">
        <span>Scope</span>
        <select id="motionFieldScope">
          <option value="content">Content</option>
          <option value="device">Device</option>
        </select>
      </label>
      <label class="motion-field">
        <span>Zoom (%)</span>
        <input type="range" id="motionFieldScale" min="0" max="60" step="1" />
      </label>
      <label class="motion-field">
        <span>Target</span>
        <select id="motionFieldTarget"></select>
      </label>
      <label class="motion-field">
        <span>X (px)</span>
        <input type="number" id="motionFieldX" step="1" />
      </label>
      <label class="motion-field">
        <span>Y (px)</span>
        <input type="number" id="motionFieldY" step="1" />
      </label>
      <div class="motion-field motion-readout" id="motionFieldScaleReadout"></div>
    </div>
  `

  const timeInput = inspector.querySelector('#motionFieldTime')
  const scopeInput = inspector.querySelector('#motionFieldScope')
  const scaleInput = inspector.querySelector('#motionFieldScale')
  const targetInput = inspector.querySelector('#motionFieldTarget')
  const xInput = inspector.querySelector('#motionFieldX')
  const yInput = inspector.querySelector('#motionFieldY')
  const scaleReadout = inspector.querySelector('#motionFieldScaleReadout')
  const durationMs = ensureDurationMs(state, elements)
  const zoomPercent = scaleToZoomPercent(selected.scale)
  const targets = getAvailableTargets(state)

  timeInput.max = String(durationMs)
  timeInput.value = String(selected.timeMs)
  scopeInput.value = selected.scope
  scaleInput.value = String(zoomPercent)
  targetInput.innerHTML = [
    '<option value="">Manual framing</option>',
    ...targets.map(
      (target) =>
        `<option value="${escapeHtml(target.id)}">${escapeHtml(target.label)}</option>`,
    ),
  ].join('')
  targetInput.value = selected.targetId || ''
  xInput.value = String(selected.x)
  yInput.value = String(selected.y)
  scaleReadout.textContent = `${zoomPercent}%`

  timeInput.oninput = (event) => {
    selected.timeMs = clamp(parseInt(event.target.value, 10) || 0, 0, durationMs)
    state.motion.currentTimeMs = selected.timeMs
    elements.motionTimelineInput.value = String(selected.timeMs)
    handlers.rerender()
  }

  scopeInput.onchange = (event) => {
    selected.scope = event.target.value
    handlers.rerender()
  }

  scaleInput.oninput = (event) => {
    const nextZoomPercent = parseInt(event.target.value, 10) || 0
    selected.scale = zoomPercentToScale(nextZoomPercent)
    scaleReadout.textContent = `${nextZoomPercent}%`
    handlers.syncPreviewOnly()
  }

  scaleInput.onchange = () => {
    handlers.commitPreviewChange()
  }

  targetInput.onchange = (event) => {
    selected.targetId = event.target.value || ''
    selected.targetLabel = getTargetById(state, selected.targetId)?.label || ''
    if (selected.targetId) {
      selected.x = 0
      selected.y = 0
    }
    xInput.value = String(selected.x)
    yInput.value = String(selected.y)
    handlers.commitPreviewChange()
  }

  timeInput.onchange = () => {
    handlers.commitPreviewChange()
  }

  xInput.oninput = (event) => {
    selected.x = parseInt(event.target.value, 10) || 0
    handlers.syncPreviewOnly()
  }

  xInput.onchange = () => {
    handlers.commitPreviewChange()
  }

  yInput.oninput = (event) => {
    selected.y = parseInt(event.target.value, 10) || 0
    handlers.syncPreviewOnly()
  }

  yInput.onchange = () => {
    handlers.commitPreviewChange()
  }
}

function renderMarkers(elements, state, onChange, onTimeChange, onScrub, onInteractionStart) {
  const markersEl = elements.motionMarkersEl
  markersEl.innerHTML = ''
  const durationMs = ensureDurationMs(state, elements)

  sortKeyframes(state.motion.keyframes).forEach((keyframe) => {
    const marker = document.createElement('button')
    marker.type = 'button'
    marker.className = `motion-marker${keyframe.id === state.motion.selectedKeyframeId ? ' is-selected' : ''}`
    marker.style.left = `${(keyframe.timeMs / durationMs) * 100}%`
    marker.textContent = keyframe.scope === 'device' ? 'D' : 'C'
    marker.title = `${keyframe.scope} · ${formatTime(keyframe.timeMs)}`

    marker.onclick = () => {
      if (marker.dataset.dragged === 'true') {
        marker.dataset.dragged = 'false'
        return
      }
      state.motion.selectedKeyframeId = keyframe.id
      state.motion.currentTimeMs = keyframe.timeMs
      elements.motionTimelineInput.value = String(keyframe.timeMs)
      onChange()
      onTimeChange?.()
    }

    marker.onpointerdown = (event) => {
      event.preventDefault()
      event.stopPropagation()
      onInteractionStart?.()

      state.motion.selectedKeyframeId = keyframe.id
      const markerId = keyframe.id
      const trackRect = elements.motionTimelineInput.getBoundingClientRect()
      let didDrag = false

      marker.dataset.dragged = 'false'
      marker.setPointerCapture?.(event.pointerId)

      function updateFromClientX(clientX) {
        const ratio = clamp((clientX - trackRect.left) / Math.max(trackRect.width, 1), 0, 1)
        const nextTimeMs = Math.round((ratio * durationMs) / 10) * 10

        keyframe.timeMs = nextTimeMs
        state.motion.currentTimeMs = nextTimeMs
        elements.motionTimelineInput.value = String(nextTimeMs)
        elements.motionTimeLabelEl.textContent = formatTime(nextTimeMs)
        marker.style.left = `${(nextTimeMs / durationMs) * 100}%`
        marker.title = `${keyframe.scope} · ${formatTime(nextTimeMs)}`
        onScrub?.()
      }

      updateFromClientX(event.clientX)

      function handleMove(moveEvent) {
        didDrag = true
        marker.dataset.dragged = 'true'
        updateFromClientX(moveEvent.clientX)
      }

      function handleUp(pointerEvent) {
        window.removeEventListener('pointermove', handleMove)
        window.removeEventListener('pointerup', handleUp)
        marker.releasePointerCapture?.(pointerEvent.pointerId)
        state.motion.selectedKeyframeId = markerId
        if (didDrag) {
          onChange()
          return
        }
        marker.dataset.dragged = 'false'
      }

      window.addEventListener('pointermove', handleMove)
      window.addEventListener('pointerup', handleUp)
    }

    markersEl.appendChild(marker)
  })
}

function bindPreviewDragging(elements, state, onChange) {
  const dragTarget = elements.previewWindowEl
  let activeDrag = null

  dragTarget.addEventListener('pointerdown', (event) => {
    if (elements.previewView.hidden) return

    const selected = findKeyframe(state)
    if (!selected) return

    const stageRect = elements.previewStageEl.getBoundingClientRect()
    const contentRect = elements.previewWindowEl.getBoundingClientRect()
    const stageScale = 1920 / Math.max(stageRect.width, 1)
    const contentScale =
      (parseInt(elements.browserWInput.value, 10) || 1280) / Math.max(contentRect.width, 1)

    activeDrag = {
      startX: event.clientX,
      startY: event.clientY,
      startOffsetX: selected.x,
      startOffsetY: selected.y,
      scale: selected.scope === 'device' ? stageScale : contentScale,
    }

    dragTarget.setPointerCapture(event.pointerId)
  })

  dragTarget.addEventListener('pointermove', (event) => {
    if (!activeDrag) return
    const selected = findKeyframe(state)
    if (!selected) return

    const deltaX = Math.round((event.clientX - activeDrag.startX) * activeDrag.scale)
    const deltaY = Math.round((event.clientY - activeDrag.startY) * activeDrag.scale)
    selected.x = activeDrag.startOffsetX + deltaX
    selected.y = activeDrag.startOffsetY + deltaY
    onChange()
  })

  function endDrag(event) {
    if (!activeDrag) return
    activeDrag = null
    if (dragTarget.hasPointerCapture(event.pointerId)) {
      dragTarget.releasePointerCapture(event.pointerId)
    }
  }

  dragTarget.addEventListener('pointerup', endDrag)
  dragTarget.addEventListener('pointercancel', endDrag)
}

export function createMotionEditor({ elements, state, updatePreview, onTimeChange }) {
  const interactionHooks = {
    onTimelineInteraction: null,
  }

  function syncPreviewOnly() {
    updatePreview()
  }

  function commitPreviewChange() {
    updatePreview()
    onTimeChange?.()
  }

  function rerender(options = {}) {
    const durationMs = ensureDurationMs(state, elements)
    elements.motionTimelineInput.max = String(durationMs)
    elements.motionTimelineInput.value = String(
      clamp(state.motion.currentTimeMs, 0, durationMs),
    )
    elements.motionTimeLabelEl.textContent = formatTime(state.motion.currentTimeMs)
    renderMarkers(
      elements,
      state,
      rerender,
      onTimeChange,
      syncPreviewOnly,
      () => interactionHooks.onTimelineInteraction?.(),
    )
    renderInspector(elements, state, {
      rerender,
      syncPreviewOnly,
      commitPreviewChange,
    })
    updatePreview()
    if (!options.skipTimeCallback) {
      onTimeChange?.()
    }
  }

  elements.motionTimelineInput.addEventListener('input', (event) => {
    interactionHooks.onTimelineInteraction?.()
    state.motion.currentTimeMs = clamp(
      parseInt(event.target.value, 10) || 0,
      0,
      ensureDurationMs(state, elements),
    )
    rerender()
  })

  elements.motionTimelineInput.addEventListener('pointerdown', () => {
    interactionHooks.onTimelineInteraction?.()
  })

  elements.motionTimelineInput.addEventListener('mousedown', () => {
    interactionHooks.onTimelineInteraction?.()
  })

  elements.motionTimelineInput.addEventListener(
    'touchstart',
    () => {
      interactionHooks.onTimelineInteraction?.()
    },
    { passive: true },
  )

  elements.addMotionKeyframeBtn.addEventListener('click', () => {
    const scope = elements.motionNewScopeInput.value || 'content'
    const current = interpolateTrack(state.motion.keyframes, scope, state.motion.currentTimeMs)
    const sourceTargetKeyframe = findNearestTrackKeyframe(
      state.motion.keyframes,
      scope,
      state.motion.currentTimeMs,
    )
    const keyframe = {
      id: createId(),
      timeMs: state.motion.currentTimeMs,
      scope,
      x: Math.round(current.x),
      y: Math.round(current.y),
      scale: Number(current.scale.toFixed(3)),
      targetId: sourceTargetKeyframe?.targetId || '',
      targetLabel: sourceTargetKeyframe?.targetLabel || '',
    }
    state.motion.keyframes.push(keyframe)
    state.motion.selectedKeyframeId = keyframe.id
    rerender()
  })

  elements.deleteMotionKeyframeBtn.addEventListener('click', () => {
    if (!state.motion.selectedKeyframeId) return
    state.motion.keyframes = state.motion.keyframes.filter(
      (keyframe) => keyframe.id !== state.motion.selectedKeyframeId,
    )
    state.motion.selectedKeyframeId = state.motion.keyframes[0]?.id || null
    rerender()
  })

  bindPreviewDragging(elements, state, rerender)

  return {
    rerender,
    setInteractionHooks(hooks = {}) {
      interactionHooks.onTimelineInteraction = hooks.onTimelineInteraction || null
    },
    getMotionStateAtCurrentTime() {
      return {
        content: interpolateTrack(state.motion.keyframes, 'content', state.motion.currentTimeMs),
        device: interpolateTrack(state.motion.keyframes, 'device', state.motion.currentTimeMs),
      }
    },
  }
}
