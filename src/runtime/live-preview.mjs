import { getFlowDurationMs } from '../core/flow-timing.mjs'

const HANDSHAKE_MESSAGE = {
  source: 'flowcap',
  type: 'flowcap:handshake',
}

function clamp(value, min, max) {
  return Math.min(Math.max(value, min), max)
}

export function createLivePreviewController({
  elements,
  state,
  updatePreview,
  rerenderMotion,
  onTimeCommitted,
  appendLog,
  onBridgeReady,
  onTargetsChange,
  getMotionState,
}) {
  const runtime = {
    bridgeReady: false,
    bridgeName: '',
    isPlaying: false,
    rafId: 0,
    handshakeTimerId: 0,
    handshakeAttemptCount: 0,
    playbackAnchorTimeMs: 0,
    playbackAnchorTs: 0,
    lastSeekKey: '',
    lastLoggedSeekTimeMs: -1,
  }

  function renderStatus() {
    elements.previewStageEl.dataset.liveBridgeReady = runtime.bridgeReady ? 'true' : 'false'

    if (elements.motionBridgeStatusEl) {
      elements.motionBridgeStatusEl.textContent = runtime.bridgeReady
        ? `Bridge: ${runtime.bridgeName || 'connected'}`
        : 'Bridge: waiting'
    }

    if (elements.motionPlayPauseBtn) {
      elements.motionPlayPauseBtn.textContent = runtime.isPlaying ? 'Pause' : 'Play'
    }
  }

  function getFrameWindow() {
    return elements.previewFrameEl?.contentWindow ?? null
  }

  function getUrl() {
    return elements.projectUrlInput.value.trim()
  }

  function getDurationMs() {
    return getFlowDurationMs(state.currentSteps, elements.durationSecInput.value)
  }

  function postToFrame(message) {
    const frameWindow = getFrameWindow()
    if (!frameWindow) {
      appendLog?.(`Preview post skipped -> no frame window for ${message.type}`)
      return false
    }
    frameWindow.postMessage(message, '*')
    return true
  }

  function sendHandshake() {
    if (!getUrl()) return false
    runtime.bridgeReady = false
    runtime.bridgeName = ''
    runtime.lastSeekKey = ''
    renderStatus()
    appendLog?.(`Preview handshake -> ${getUrl()}`)
    const posted = postToFrame(HANDSHAKE_MESSAGE)
    if (!posted) {
      appendLog?.('Preview handshake skipped -> iframe not ready')
      return false
    }
    return true
  }

  function stopHandshakeRetries() {
    if (runtime.handshakeTimerId) {
      window.clearTimeout(runtime.handshakeTimerId)
      runtime.handshakeTimerId = 0
    }
  }

  function startHandshakeRetries() {
    stopHandshakeRetries()
    runtime.handshakeAttemptCount = 0

    function retry() {
      if (runtime.bridgeReady) {
        stopHandshakeRetries()
        return
      }

      runtime.handshakeAttemptCount += 1
      sendHandshake()

      if (runtime.handshakeAttemptCount >= 8) {
        appendLog?.('Preview bridge timeout -> using fallback preview until bridge is ready')
        stopHandshakeRetries()
        return
      }

      runtime.handshakeTimerId = window.setTimeout(retry, 250)
    }

    retry()
  }

  function seekCurrentTime({ force = false } = {}) {
    const url = getUrl()
    if (!url || elements.previewView.hidden) return false

    const seekKey = JSON.stringify({
      timeMs: state.motion.currentTimeMs,
      steps: state.currentSteps,
    })

    if (!force && runtime.bridgeReady && runtime.lastSeekKey === seekKey) {
      return true
    }

    const posted = postToFrame({
      source: 'flowcap',
      type: 'flowcap:seek',
      payload: {
        timeMs: state.motion.currentTimeMs,
        steps: state.currentSteps,
        motionState: null,
      },
    })

    if (posted && runtime.bridgeReady) {
      runtime.lastSeekKey = seekKey
      const roundedTime = Math.round(state.motion.currentTimeMs / 100) * 100
      if (force || Math.abs(roundedTime - runtime.lastLoggedSeekTimeMs) >= 400) {
        runtime.lastLoggedSeekTimeMs = roundedTime
        appendLog?.(`Preview seek -> ${(state.motion.currentTimeMs / 1000).toFixed(2)}s`)
      }
    }

    return posted
  }

  function pause() {
    if (runtime.rafId) {
      window.cancelAnimationFrame(runtime.rafId)
      runtime.rafId = 0
    }
    runtime.isPlaying = false
    renderStatus()
    appendLog?.('Preview playback paused')
  }

  function commitTime(timeMs, options = {}) {
    state.motion.currentTimeMs = clamp(timeMs, 0, getDurationMs())
    rerenderMotion({ skipTimeCallback: true })
    updatePreview()
    seekCurrentTime({ force: options.force === true })
    onTimeCommitted?.()
  }

  function tick(timestamp) {
    if (!runtime.isPlaying) return
    const elapsed = timestamp - runtime.playbackAnchorTs
    const nextTime = runtime.playbackAnchorTimeMs + elapsed
    const durationMs = getDurationMs()

    if (nextTime >= durationMs) {
      commitTime(durationMs, { force: true })
      pause()
      return
    }

    commitTime(nextTime)
    runtime.rafId = window.requestAnimationFrame(tick)
  }

  function play() {
    if (runtime.isPlaying) return
    runtime.isPlaying = true
    runtime.playbackAnchorTimeMs = state.motion.currentTimeMs
    runtime.playbackAnchorTs = performance.now()
    renderStatus()
    appendLog?.('Preview playback started')
    runtime.rafId = window.requestAnimationFrame(tick)
  }

  function togglePlayback() {
    if (runtime.isPlaying) {
      pause()
      return
    }
    play()
  }

  function resetPlayback() {
    pause()
    appendLog?.('Preview playback reset')
    commitTime(0, { force: true })
  }

  function handleMessage(event) {
    const message = event.data
    if (!message || typeof message !== 'object') return
    if (message.source !== 'flowcap-bridge') return

    if (message.type === 'flowcap:targets') {
      state.motion.bridgeTargets = Array.isArray(message.payload?.targets)
        ? message.payload.targets
        : []
      onTargetsChange?.(state.motion.bridgeTargets)
      updatePreview()
      return
    }

    if (message.type === 'flowcap:log') {
      const prefix = message.payload?.level === 'error' ? 'Bridge error' : 'Bridge'
      appendLog?.(`${prefix}: ${message.payload?.message || 'Unknown bridge log'}`)
      return
    }

    if (message.type !== 'flowcap:ready') return

    runtime.bridgeReady = true
    runtime.bridgeName = message.payload?.bridge || ''
    runtime.lastSeekKey = ''
    stopHandshakeRetries()
    renderStatus()
    appendLog?.(`Bridge ready -> ${runtime.bridgeName || 'connected'}`)
    onBridgeReady?.()
    seekCurrentTime({ force: true })
  }

  function bind() {
    window.addEventListener('message', handleMessage)
    elements.previewFrameEl.addEventListener('load', () => {
      appendLog?.(`Preview iframe loaded -> ${getUrl() || '(no url)'}`)
      startHandshakeRetries()
    })
    elements.previewFrameEl.addEventListener('error', () => {
      appendLog?.(`Preview iframe failed -> ${getUrl() || '(no url)'}`)
    })
    elements.motionPlayPauseBtn?.addEventListener('click', togglePlayback)
    elements.motionResetBtn?.addEventListener('click', resetPlayback)
    renderStatus()
  }

  return {
    bind,
    connect() {
      appendLog?.(`Preview connect -> ${getUrl() || '(no url)'}`)
      startHandshakeRetries()
    },
    pause,
    play,
    togglePlayback,
    resetPlayback,
    seekCurrentTime,
    sendHandshake,
    isReady() {
      return runtime.bridgeReady
    },
    dispose() {
      stopHandshakeRetries()
      pause()
    },
  }
}
