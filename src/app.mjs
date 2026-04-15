import { elements } from './ui/elements.mjs'
import { createPreviewRenderer } from './ui/preview.mjs'
import { createStepRenderer } from './ui/steps.mjs'
import { createMotionEditor } from './ui/motion-editor.mjs'

const state = {
  currentSteps: [],
  detectedTargets: [],
  selectedBgImagePath: null,
  motion: {
    keyframes: [],
    currentTimeMs: 0,
    selectedKeyframeId: null,
  },
  preview: {
    snapshotDataUrl: null,
    cache: new Map(),
    requestToken: 0,
    debounceId: null,
  },
}

const updatePreview = createPreviewRenderer(elements, state)

function appendLog(msg) {
  const div = document.createElement('div')
  div.innerText = `> ${msg}`
  elements.statusLog.appendChild(div)
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight
}

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
    default:
      return 140
  }
}

function deriveMotionFromSteps(steps) {
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

const { renderSelectorCatalog, renderSteps } = createStepRenderer({
  elements,
  state,
  appendLog,
})
const motionEditor = createMotionEditor({
  elements,
  state,
  updatePreview,
  onTimeChange: requestPreviewSnapshot,
})

function clearPreviewCache() {
  state.preview.cache = new Map()
  state.preview.snapshotDataUrl = null
}

function getPreviewCacheKey() {
  return JSON.stringify({
    url: elements.projectUrlInput.value.trim(),
    timeMs: state.motion.currentTimeMs,
    width: parseInt(elements.browserWInput.value, 10) || 1280,
    height: parseInt(elements.browserHInput.value, 10) || 800,
    steps: state.currentSteps,
  })
}

function requestPreviewSnapshot() {
  if (state.preview.debounceId) {
    window.clearTimeout(state.preview.debounceId)
  }

  state.preview.debounceId = window.setTimeout(async () => {
    const url = elements.projectUrlInput.value.trim()
    if (!url || elements.previewView.hidden) return

    const cacheKey = getPreviewCacheKey()
    const cached = state.preview.cache.get(cacheKey)
    if (cached) {
      state.preview.snapshotDataUrl = cached
      updatePreview()
      return
    }

    const token = ++state.preview.requestToken
    const result = await window.api.renderPreviewState({
      url,
      steps: state.currentSteps,
      timeMs: state.motion.currentTimeMs,
      browserConfig: {
        width: parseInt(elements.browserWInput.value, 10) || 1280,
        height: parseInt(elements.browserHInput.value, 10) || 800,
      },
    })

    if (token !== state.preview.requestToken || !result?.success) return
    state.preview.cache.set(cacheKey, result.dataUrl)
    state.preview.snapshotDataUrl = result.dataUrl
    updatePreview()
  }, 180)
}

async function analyzeAndPopulateSteps(url, options = {}) {
  const { preserveSteps = false } = options
  elements.stepsListEl.innerHTML =
    '<div style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">Analyzing page...</div>'
  elements.selectorCatalogEl.className = 'selector-catalog-empty'
  elements.selectorCatalogEl.innerHTML =
    'Scanning the page and building selector suggestions...'

  const result = await window.api.analyzeUrl(url)
  state.detectedTargets =
    result.success && Array.isArray(result.targets) ? result.targets : []
  if (!preserveSteps) {
    const nextSteps =
      result.success && Array.isArray(result.steps) && result.steps.length > 0
        ? result.steps
        : []
    const derivedMotion = deriveMotionFromSteps(nextSteps)
    state.currentSteps = derivedMotion.filteredSteps
    state.motion.keyframes = derivedMotion.keyframes
    state.motion.selectedKeyframeId = state.motion.keyframes[0]?.id || null
    state.motion.currentTimeMs = 0
    elements.motionTimelineInput.value = '0'
  }

  renderSelectorCatalog()
  renderSteps()
  motionEditor.rerender()
  clearPreviewCache()
  requestPreviewSnapshot()

  if (!result.success) {
    appendLog(`Analyze failed: ${result.error}`)
  }
}

function applyFlowDefinition(flowDefinition) {
  const flow =
    Array.isArray(flowDefinition) ? { steps: flowDefinition } : flowDefinition || {}

  if (flow.url) {
    elements.projectUrlInput.value = flow.url
  }

  if (flow.durationSec !== undefined) {
    elements.durationSecInput.value = String(flow.durationSec)
  }

  if (flow.bgColor) {
    elements.bgColorInput.value = flow.bgColor
  }

  if (flow.borderRadius !== undefined) {
    elements.borderRadiusInput.value = String(flow.borderRadius)
    elements.radiusVal.innerText = `${flow.borderRadius}px`
  }

  if (flow.cursor?.enabled !== undefined) {
    elements.showCursorInput.checked = Boolean(flow.cursor.enabled)
  }

  if (flow.cursor?.style) {
    elements.cursorStyleInput.value = flow.cursor.style
  }

  if (flow.cursor?.adaptiveTiming !== undefined) {
    elements.adaptiveCursorTimingInput.checked = Boolean(flow.cursor.adaptiveTiming)
  }

  if (flow.mockup?.type) {
    elements.mockupTypeInput.value = flow.mockup.type
  }

  if (flow.zoomPercent !== undefined) {
    elements.zoomPercentInput.value = String(flow.zoomPercent)
  }

  if (flow.quality) {
    elements.outputQualityInput.value = flow.quality
  }

  if (flow.browserConfig?.width !== undefined) {
    elements.browserWInput.value = String(flow.browserConfig.width)
  }

  if (flow.browserConfig?.height !== undefined) {
    elements.browserHInput.value = String(flow.browserConfig.height)
  }

  if (flow.placement?.align) {
    elements.videoAlignInput.value = flow.placement.align
  }

  if (flow.placement?.x !== undefined) {
    elements.offsetXInput.value = String(flow.placement.x)
  }

  if (flow.placement?.y !== undefined) {
    elements.offsetYInput.value = String(flow.placement.y)
  }

  const explicitSteps = Array.isArray(flow.steps) ? flow.steps : []
  const explicitMotion = Array.isArray(flow.motion?.keyframes) ? flow.motion.keyframes : null
  const derivedMotion = explicitMotion ? null : deriveMotionFromSteps(explicitSteps)

  state.currentSteps = derivedMotion ? derivedMotion.filteredSteps : explicitSteps
  state.motion.keyframes = (explicitMotion || derivedMotion?.keyframes || []).map((keyframe) => ({
    id: keyframe.id || `kf_${Math.random().toString(36).slice(2, 8)}`,
    timeMs: parseInt(keyframe.timeMs, 10) || 0,
    scope: keyframe.scope === 'device' ? 'device' : 'content',
    x: parseInt(keyframe.x, 10) || 0,
    y: parseInt(keyframe.y, 10) || 0,
    scale: Number.parseFloat(keyframe.scale) || 1,
  }))
  state.motion.selectedKeyframeId = state.motion.keyframes[0]?.id || null
  state.motion.currentTimeMs = 0
  elements.motionTimelineInput.value = '0'
  renderSteps()
  motionEditor.rerender()
  clearPreviewCache()
  updatePreview()
  requestPreviewSnapshot()

  if (flow.url) {
    analyzeAndPopulateSteps(flow.url, { preserveSteps: true })
  }
}

function slugify(url) {
  return url
    .replace(/[^a-zA-Z0-9]/g, '-')
    .replace(/-+/g, '-')
    .replace(/^-|-$/g, '')
}

async function start() {
  const url = elements.projectUrlInput.value
  const urlSlug = slugify(url)
  const durationSec = elements.durationSecInput.value
  const bgColor = elements.bgColorInput.value
  const borderRadius = elements.borderRadiusInput.value
  const zoomPercent = Number.parseFloat(elements.zoomPercentInput.value) || 0
  const quality = elements.outputQualityInput.value || 'standard'

  const browserConfig = {
    width: parseInt(elements.browserWInput.value, 10) || 1280,
    height: parseInt(elements.browserHInput.value, 10) || 800,
  }

  const placement = {
    align: elements.videoAlignInput.value,
    x: parseInt(elements.offsetXInput.value, 10) || 0,
    y: parseInt(elements.offsetYInput.value, 10) || 0,
  }

  const cursor = {
    enabled: elements.showCursorInput.checked,
    style: elements.cursorStyleInput.value || 'dot',
    adaptiveTiming: elements.adaptiveCursorTimingInput.checked,
  }

  const mockup = {
    type: elements.mockupTypeInput.value || 'none',
  }

  elements.recordBtn.disabled = true
  elements.recordBtn.innerText = 'Recording...'
  elements.statusLog.innerHTML = ''
  appendLog('Starting output engine...')

  window.api.onProgress((msg) => {
    appendLog(msg)
  })

  const result = await window.api.startRecording({
    url,
    urlSlug,
    steps: state.currentSteps,
    durationSec,
    bgColor,
    bgImagePath: state.selectedBgImagePath,
    borderRadius,
    zoomPercent,
    quality,
    browserConfig,
    placement,
    cursor,
    mockup,
    motion: {
      keyframes: state.motion.keyframes.map((keyframe) => ({
        id: keyframe.id,
        timeMs: keyframe.timeMs,
        scope: keyframe.scope,
        x: keyframe.x,
        y: keyframe.y,
        scale: keyframe.scale,
      })),
    },
  })

  window.api.removeProgressListener()

  if (result.success) {
    appendLog(`Success! Video saved at:\n${result.outputPath}`)
  } else {
    appendLog(`Error: ${result.error}`)
  }

  elements.recordBtn.disabled = false
  elements.recordBtn.innerHTML = '<span class="icon">●</span> Start Recording'
}

elements.selectHtmlBtn.addEventListener('click', async () => {
  const filePath = await window.api.selectHtmlFile()
  if (!filePath) return

  let uri = filePath.replace(/\\/g, '/')
  if (!uri.startsWith('/')) uri = '/' + uri
  elements.projectUrlInput.value = `file://${uri}`
  analyzeAndPopulateSteps(elements.projectUrlInput.value)
})

elements.selectFlowBtn.addEventListener('click', async () => {
  const result = await window.api.selectFlowFile()
  if (!result) return

  elements.flowPathDisplay.innerText = result.path
  elements.flowPathDisplay.title = result.path
  applyFlowDefinition(result.content)
})

elements.projectUrlInput.addEventListener('blur', () => {
  const url = elements.projectUrlInput.value.trim()
  if (url) analyzeAndPopulateSteps(url)
  clearPreviewCache()
  updatePreview()
  requestPreviewSnapshot()
})

elements.selectImageBtn.addEventListener('click', async () => {
  const imagePath = await window.api.selectImage()
  if (!imagePath) return

  state.selectedBgImagePath = imagePath
  elements.imagePathDisplay.innerText = imagePath
  elements.imagePathDisplay.title = imagePath
  elements.clearImageBtn.hidden = false
  updatePreview()
})

elements.clearImageBtn.addEventListener('click', () => {
  state.selectedBgImagePath = null
  elements.imagePathDisplay.innerText = ''
  elements.imagePathDisplay.title = ''
  elements.clearImageBtn.hidden = true
  updatePreview()
})

elements.closeBtn.addEventListener('click', () => {
  window.api.closeWindow()
})

elements.addStepBtn.addEventListener('click', () => {
  state.currentSteps.push({ action: 'wait', ms: 1000 })
  renderSteps()
  clearPreviewCache()
})

elements.addContentZoomBtn.addEventListener('click', () => {
  state.currentSteps.push({
    action: 'content_zoom',
    selector: '',
    percent: 12,
    duration: 420,
  })
  renderSteps()
  clearPreviewCache()
})

elements.addZoomOutBtn.addEventListener('click', () => {
  state.currentSteps.push({
    action: 'zoom_out',
    duration: 380,
  })
  renderSteps()
  clearPreviewCache()
})

elements.recordBtn.addEventListener('click', start)

elements.tabFlow.addEventListener('click', () => {
  elements.tabFlow.classList.add('active')
  elements.tabPreview.classList.remove('active')
  elements.flowView.hidden = false
  elements.previewView.hidden = true
})

elements.tabPreview.addEventListener('click', () => {
  elements.tabPreview.classList.add('active')
  elements.tabFlow.classList.remove('active')
  elements.previewView.hidden = false
  elements.flowView.hidden = true
  motionEditor.rerender()
  updatePreview()
  requestPreviewSnapshot()
})

;[
  elements.browserWInput,
  elements.browserHInput,
  elements.offsetXInput,
  elements.offsetYInput,
  elements.borderRadiusInput,
  elements.zoomPercentInput,
].forEach((input) => input.addEventListener('input', updatePreview))
elements.videoAlignInput.addEventListener('change', updatePreview)
elements.bgColorInput.addEventListener('input', updatePreview)
elements.showCursorInput.addEventListener('change', updatePreview)
elements.cursorStyleInput.addEventListener('change', updatePreview)
elements.adaptiveCursorTimingInput.addEventListener('change', updatePreview)
elements.mockupTypeInput.addEventListener('change', updatePreview)
elements.outputQualityInput.addEventListener('change', updatePreview)
elements.durationSecInput.addEventListener('input', motionEditor.rerender)

renderSelectorCatalog()
renderSteps()
motionEditor.rerender()
updatePreview()
