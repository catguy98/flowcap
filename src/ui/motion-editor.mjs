function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

function createId() {
  return `kf_${Math.random().toString(36).slice(2, 8)}`
}

function formatTime(ms) {
  return `${(ms / 1000).toFixed(2)}s`
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

function findKeyframe(state) {
  return state.motion.keyframes.find((keyframe) => keyframe.id === state.motion.selectedKeyframeId)
}

function renderInspector(elements, state, onChange) {
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
        <span>Scale (%)</span>
        <input type="range" id="motionFieldScale" min="80" max="160" step="1" />
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
  const xInput = inspector.querySelector('#motionFieldX')
  const yInput = inspector.querySelector('#motionFieldY')
  const scaleReadout = inspector.querySelector('#motionFieldScaleReadout')
  const durationMs = ensureDurationMs(state, elements)

  timeInput.max = String(durationMs)
  timeInput.value = String(selected.timeMs)
  scopeInput.value = selected.scope
  scaleInput.value = String(Math.round(selected.scale * 100))
  xInput.value = String(selected.x)
  yInput.value = String(selected.y)
  scaleReadout.textContent = `${Math.round(selected.scale * 100)}%`

  timeInput.oninput = (event) => {
    selected.timeMs = clamp(parseInt(event.target.value, 10) || 0, 0, durationMs)
    state.motion.currentTimeMs = selected.timeMs
    elements.motionTimelineInput.value = String(selected.timeMs)
    onChange()
  }

  scopeInput.onchange = (event) => {
    selected.scope = event.target.value
    onChange()
  }

  scaleInput.oninput = (event) => {
    selected.scale = clamp((parseInt(event.target.value, 10) || 100) / 100, 0.8, 1.6)
    scaleReadout.textContent = `${Math.round(selected.scale * 100)}%`
    onChange()
  }

  xInput.oninput = (event) => {
    selected.x = parseInt(event.target.value, 10) || 0
    onChange()
  }

  yInput.oninput = (event) => {
    selected.y = parseInt(event.target.value, 10) || 0
    onChange()
  }
}

function renderMarkers(elements, state, onChange) {
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
      state.motion.selectedKeyframeId = keyframe.id
      state.motion.currentTimeMs = keyframe.timeMs
      elements.motionTimelineInput.value = String(keyframe.timeMs)
      onChange()
      onTimeChange?.()
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
    const contentScale = (parseInt(elements.browserWInput.value, 10) || 1280) / Math.max(contentRect.width, 1)

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
  function rerender() {
    const durationMs = ensureDurationMs(state, elements)
    elements.motionTimelineInput.max = String(durationMs)
    elements.motionTimelineInput.value = String(
      clamp(state.motion.currentTimeMs, 0, durationMs),
    )
    elements.motionTimeLabelEl.textContent = formatTime(state.motion.currentTimeMs)
    renderMarkers(elements, state, rerender)
    renderInspector(elements, state, rerender)
    updatePreview()
  }

  elements.motionTimelineInput.addEventListener('input', (event) => {
    state.motion.currentTimeMs = clamp(parseInt(event.target.value, 10) || 0, 0, ensureDurationMs(state, elements))
    rerender()
    onTimeChange?.()
  })

  elements.addMotionKeyframeBtn.addEventListener('click', () => {
    const scope = elements.motionNewScopeInput.value || 'content'
    const current = interpolateTrack(state.motion.keyframes, scope, state.motion.currentTimeMs)
    const keyframe = {
      id: createId(),
      timeMs: state.motion.currentTimeMs,
      scope,
      x: Math.round(current.x),
      y: Math.round(current.y),
      scale: Number(current.scale.toFixed(3)),
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
    getMotionStateAtCurrentTime() {
      return {
        content: interpolateTrack(state.motion.keyframes, 'content', state.motion.currentTimeMs),
        device: interpolateTrack(state.motion.keyframes, 'device', state.motion.currentTimeMs),
      }
    },
  }
}
