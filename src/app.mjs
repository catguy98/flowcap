import { deriveMotionFromSteps, getFlowDurationMs } from './core/flow-timing.mjs'
import { createLivePreviewController } from './runtime/live-preview.mjs'
import { elements } from './ui/elements.mjs'
import { createMotionEditor } from './ui/motion-editor.mjs'
import { createPreviewRenderer } from './ui/preview.mjs'
import { createStepRenderer } from './ui/steps.mjs'

const state = {
  currentSteps: [],
  detectedTargets: [],
  selectedBgImagePath: null,
  motion: {
    keyframes: [],
    currentTimeMs: 0,
    selectedKeyframeId: null,
    bridgeTargets: [],
  },
  preview: {
    snapshotDataUrl: null,
    cache: new Map(),
    requestToken: 0,
    debounceId: null,
  },
}

const updatePreview = createPreviewRenderer(elements, state)
let motionEditor = null
let livePreview = null

function buildPreviewFrameUrl(targetUrl, forceReload = false) {
  if (!forceReload) return targetUrl

  try {
    const url = new URL(targetUrl)
    url.searchParams.set('__flowcap_preview_ts', String(Date.now()))
    return url.toString()
  } catch {
    const separator = targetUrl.includes('?') ? '&' : '?'
    return `${targetUrl}${separator}__flowcap_preview_ts=${Date.now()}`
  }
}

function normalizeStepsForMotion(steps, hasExplicitMotion) {
  if (!Array.isArray(steps)) return []
  if (!hasExplicitMotion) return steps

  return steps.map((step) => {
    if (step.action === 'content_zoom' || step.action === 'zoom') {
      return {
        action: 'wait',
        ms: parseInt(step.duration, 10) || 420,
      }
    }

    if (step.action === 'zoom_out') {
      return {
        action: 'wait',
        ms: parseInt(step.duration, 10) || 380,
      }
    }

    return step
  })
}

function ensurePreviewFrame(forceReload = false, onReady = null) {
  const targetUrl = elements.projectUrlInput.value.trim()
  if (!targetUrl) {
    appendLog('Preview frame skipped -> no project URL')
    return
  }

  const loadedUrl = elements.previewFrameEl.dataset.loadedUrl || ''
  const currentSrc = elements.previewFrameEl.getAttribute('src') || ''
  const nextSrc = buildPreviewFrameUrl(targetUrl, forceReload)

  if (!forceReload && loadedUrl === targetUrl && currentSrc === nextSrc) {
    appendLog(`Preview frame reused -> ${targetUrl}`)
    onReady?.()
    return
  }

  if (!forceReload) {
    appendLog(`Preview frame src -> ${nextSrc}`)
    elements.previewFrameEl.src = nextSrc
    elements.previewFrameEl.dataset.loadedUrl = targetUrl
    livePreview?.connect()
    onReady?.()
    return
  }

  appendLog(`Preview frame reload -> ${nextSrc}`)
  elements.previewFrameEl.src = nextSrc
  elements.previewFrameEl.dataset.loadedUrl = targetUrl
  livePreview?.connect()
  onReady?.()
}

function appendLog(message) {
  const entry = document.createElement('div')
  entry.innerText = `> ${message}`
  elements.statusLog.appendChild(entry)
  elements.statusLog.scrollTop = elements.statusLog.scrollHeight
}

appendLog('Renderer booted -> FlowCap debug logging active')

window.addEventListener('error', (event) => {
  appendLog(`Renderer error: ${event.message}`)
})

window.addEventListener('unhandledrejection', (event) => {
  const reason =
    typeof event.reason === 'string'
      ? event.reason
      : event.reason?.message || 'Unknown rejection'
  appendLog(`Renderer rejection: ${reason}`)
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
  if (livePreview?.isReady()) return

  if (state.preview.debounceId) {
    window.clearTimeout(state.preview.debounceId)
  }

  state.preview.debounceId = window.setTimeout(async () => {
    const url = elements.projectUrlInput.value.trim()
    if (!url || elements.previewView.hidden) return

    const cacheKey = getPreviewCacheKey()
    const cached = state.preview.cache.get(cacheKey)
    if (cached) {
      appendLog(`Preview fallback cache -> ${(state.motion.currentTimeMs / 1000).toFixed(2)}s`)
      state.preview.snapshotDataUrl = cached
      updatePreview()
      return
    }

    appendLog(`Preview fallback render -> ${(state.motion.currentTimeMs / 1000).toFixed(2)}s`)
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

    if (livePreview?.isReady()) return
    if (token !== state.preview.requestToken) return
    if (!result?.success) {
      appendLog(`Preview fallback failed: ${result?.error || 'unknown error'}`)
      return
    }
    state.preview.cache.set(cacheKey, result.dataUrl)
    state.preview.snapshotDataUrl = result.dataUrl
    updatePreview()
    appendLog(`Preview fallback ready -> ${(state.motion.currentTimeMs / 1000).toFixed(2)}s`)
  }, 70)
}

function syncPreviewRuntime({ force = false } = {}) {
  ensurePreviewFrame(false)
  updatePreview()

  if (elements.previewView.hidden) return

  if (livePreview?.isReady()) {
    state.preview.snapshotDataUrl = null
    updatePreview()
    livePreview.seekCurrentTime({ force })
    return
  }

  requestPreviewSnapshot()
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

  stepRenderer.renderSelectorCatalog()
  stepRenderer.renderSteps()
  motionEditor.rerender({ skipTimeCallback: true })
  clearPreviewCache()
  syncPreviewRuntime({ force: true })

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

  if (flow.render?.mode || flow.renderMode) {
    elements.renderModeInput.value = flow.render?.mode || flow.renderMode
  }

  if (flow.render?.fps || flow.studioFps) {
    elements.studioFpsInput.value = String(flow.render?.fps || flow.studioFps)
  }

  if (flow.render?.motionBlur !== undefined) {
    elements.motionBlurInput.value = String(flow.render.motionBlur)
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

  if (flow.interaction?.disableHoverMotion !== undefined) {
    elements.disableHoverMotionInput.checked = Boolean(flow.interaction.disableHoverMotion)
  }

  if (flow.mockup?.type) {
    elements.mockupTypeInput.value = flow.mockup.type
  }

  if (flow.zoomPercent !== undefined) {
    elements.zoomPercentInput.value = String(flow.zoomPercent)
  }

  if (flow.cameraZoomDurationMs !== undefined) {
    elements.cameraZoomDurationInput.value = String(flow.cameraZoomDurationMs)
  } else if (flow.camera?.durationMs !== undefined) {
    elements.cameraZoomDurationInput.value = String(flow.camera.durationMs)
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

  if (flow.browserConfig?.captureScale !== undefined) {
    elements.captureScaleInput.value = String(flow.browserConfig.captureScale)
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

  state.currentSteps = derivedMotion
    ? derivedMotion.filteredSteps
    : normalizeStepsForMotion(explicitSteps, Boolean(explicitMotion))
  state.motion.keyframes = (explicitMotion || derivedMotion?.keyframes || []).map((keyframe) => ({
    id: keyframe.id || `kf_${Math.random().toString(36).slice(2, 8)}`,
    timeMs: parseInt(keyframe.timeMs, 10) || 0,
    scope: keyframe.scope === 'device' ? 'device' : 'content',
    x: parseInt(keyframe.x, 10) || 0,
    y: parseInt(keyframe.y, 10) || 0,
    scale: Number.parseFloat(keyframe.scale) || 1,
    targetId: keyframe.targetId || '',
    targetLabel: keyframe.targetLabel || '',
  }))
  state.motion.selectedKeyframeId = state.motion.keyframes[0]?.id || null
  state.motion.currentTimeMs = 0
  elements.motionTimelineInput.value = '0'
  stepRenderer.renderSteps()
  motionEditor.rerender({ skipTimeCallback: true })
  clearPreviewCache()
  syncPreviewRuntime({ force: true })

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
  const flowDurationMs = getFlowDurationMs(state.currentSteps, durationSec)
  const suggestedCameraZoomDurationMs = Math.min(
    Math.max(Math.round(flowDurationMs * 0.18), 650),
    1400,
  )
  const requestedCameraZoomDurationMs =
    parseInt(elements.cameraZoomDurationInput.value, 10) || 0
  const quality = elements.outputQualityInput.value || 'standard'
  const render = {
    mode: elements.renderModeInput.value || 'realtime',
    fps: parseInt(elements.studioFpsInput.value, 10) || 60,
    motionBlur: parseInt(elements.motionBlurInput.value, 10) || 0,
  }

  const browserConfig = {
    width: parseInt(elements.browserWInput.value, 10) || 1280,
    height: parseInt(elements.browserHInput.value, 10) || 800,
    captureScale: Number.parseFloat(elements.captureScaleInput.value) || 1,
  }

  const placement = {
    align: elements.videoAlignInput.value,
    x: parseInt(elements.offsetXInput.value, 10) || 0,
    y: parseInt(elements.offsetYInput.value, 10) || 0,
  }

  const camera = {
    zoomDurationMs:
      requestedCameraZoomDurationMs > 0
        ? requestedCameraZoomDurationMs
        : suggestedCameraZoomDurationMs,
  }

  const cursor = {
    enabled: elements.showCursorInput.checked,
    style: elements.cursorStyleInput.value || 'dot',
  }

  const interaction = {
    disableHoverMotion: elements.disableHoverMotionInput.checked,
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
    camera,
    quality,
    browserConfig,
    placement,
    cursor,
    interaction,
    mockup,
    render,
    motion: {
      keyframes: state.motion.keyframes.map((keyframe) => ({
        id: keyframe.id,
        timeMs: keyframe.timeMs,
        scope: keyframe.scope,
        x: keyframe.x,
        y: keyframe.y,
        scale: keyframe.scale,
        targetId: keyframe.targetId || '',
        targetLabel: keyframe.targetLabel || '',
      })),
    },
  })

  window.api.removeProgressListener()

  if (result.success) {
    const entry = document.createElement('div')
    const link = document.createElement('a')
    link.textContent = result.outputPath
    link.style.cssText = 'color:#7dd3fc;text-decoration:underline;cursor:pointer;word-break:break-all;'
    link.addEventListener('click', () => window.api.openFile(result.outputPath))
    entry.appendChild(document.createTextNode('> Success! Video saved at: '))
    entry.appendChild(link)
    elements.statusLog.appendChild(entry)
    elements.statusLog.scrollTop = elements.statusLog.scrollHeight
  } else {
    appendLog(`Error: ${result.error}`)
  }

  elements.recordBtn.disabled = false
  elements.recordBtn.innerHTML = '<span class="icon">●</span> Start Recording'
}

const stepRenderer = createStepRenderer({
  elements,
  state,
  appendLog,
  onChange: () => {
    clearPreviewCache()
    syncPreviewRuntime({ force: true })
  },
})

motionEditor = createMotionEditor({
  elements,
  state,
  updatePreview,
  onTimeChange: () => {
    syncPreviewRuntime({ force: true })
  },
})

livePreview = createLivePreviewController({
  elements,
  state,
  updatePreview,
  rerenderMotion: motionEditor.rerender,
  getMotionState: motionEditor.getMotionStateAtCurrentTime,
  onTimeCommitted: () => {},
  appendLog,
  onBridgeReady: () => {
    state.preview.snapshotDataUrl = null
    updatePreview()
  },
  onTargetsChange: () => {
    motionEditor.rerender({ skipTimeCallback: true })
  },
})

livePreview.bind()
motionEditor.setInteractionHooks({
  onTimelineInteraction: () => {
    livePreview.pause()
  },
})

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
  ensurePreviewFrame(true, () => {
    syncPreviewRuntime({ force: true })
  })
})

elements.selectImageBtn.addEventListener('click', async () => {
  const imagePath = await window.api.selectImage()
  if (!imagePath) return

  state.selectedBgImagePath = imagePath
  elements.imagePathDisplay.innerText = imagePath
  elements.imagePathDisplay.title = imagePath
  elements.clearImageBtn.hidden = false
  syncPreviewRuntime()
})

elements.clearImageBtn.addEventListener('click', () => {
  state.selectedBgImagePath = null
  elements.imagePathDisplay.innerText = ''
  elements.imagePathDisplay.title = ''
  elements.clearImageBtn.hidden = true
  syncPreviewRuntime()
})

elements.closeBtn.addEventListener('click', () => {
  window.api.closeWindow()
})
elements.minimizeBtn?.addEventListener('click', () => {
  window.api.minimizeWindow()
})
elements.toggleMaximizeBtn?.addEventListener('click', () => {
  window.api.toggleMaximizeWindow()
})

elements.addStepBtn.addEventListener('click', () => {
  state.currentSteps.push({ action: 'wait', ms: 1000 })
  stepRenderer.renderSteps()
  clearPreviewCache()
  syncPreviewRuntime({ force: true })
})

elements.addContentZoomBtn.addEventListener('click', () => {
  state.currentSteps.push({
    action: 'content_zoom',
    selector: '',
    percent: 12,
    duration: 420,
  })
  stepRenderer.renderSteps()
  clearPreviewCache()
  syncPreviewRuntime({ force: true })
})

elements.addZoomOutBtn.addEventListener('click', () => {
  state.currentSteps.push({
    action: 'zoom_out',
    duration: 380,
  })
  stepRenderer.renderSteps()
  clearPreviewCache()
  syncPreviewRuntime({ force: true })
})

elements.recordBtn.addEventListener('click', start)

elements.tabFlow.addEventListener('click', () => {
  livePreview.pause()
  elements.tabFlow.classList.add('active')
  elements.tabPreview.classList.remove('active')
  elements.flowView.hidden = false
  elements.previewView.hidden = true
})

elements.tabPreview.addEventListener('click', () => {
  appendLog('Motion tab opened')
  elements.tabPreview.classList.add('active')
  elements.tabFlow.classList.remove('active')
  elements.previewView.hidden = false
  elements.flowView.hidden = true
  motionEditor.rerender({ skipTimeCallback: true })
  updatePreview()
  ensurePreviewFrame(true, () => {
    syncPreviewRuntime({ force: true })
  })
})

;[
  elements.browserWInput,
  elements.browserHInput,
  elements.offsetXInput,
  elements.offsetYInput,
  elements.borderRadiusInput,
  elements.zoomPercentInput,
  elements.cameraZoomDurationInput,
  elements.captureScaleInput,
].forEach((input) =>
  input.addEventListener('input', () => {
    syncPreviewRuntime()
  }),
)
elements.videoAlignInput.addEventListener('change', () => syncPreviewRuntime())
elements.bgColorInput.addEventListener('input', () => syncPreviewRuntime())
elements.showCursorInput.addEventListener('change', () => syncPreviewRuntime())
elements.cursorStyleInput.addEventListener('change', () => syncPreviewRuntime())
// adaptiveCursorTimingInput — element not in DOM, skipped
elements.disableHoverMotionInput.addEventListener('change', () => syncPreviewRuntime())
elements.mockupTypeInput.addEventListener('change', () => syncPreviewRuntime())
elements.outputQualityInput.addEventListener('change', () => syncPreviewRuntime())
elements.renderModeInput.addEventListener('change', () => syncPreviewRuntime())
elements.studioFpsInput.addEventListener('change', () => syncPreviewRuntime())
elements.motionBlurInput.addEventListener('change', () => syncPreviewRuntime())
elements.durationSecInput.addEventListener('input', () => {
  motionEditor.rerender({ skipTimeCallback: true })
  syncPreviewRuntime({ force: true })
})

stepRenderer.renderSelectorCatalog()
stepRenderer.renderSteps()
motionEditor.rerender({ skipTimeCallback: true })
updatePreview()
