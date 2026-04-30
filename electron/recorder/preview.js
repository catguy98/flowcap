const { chromium } = require('playwright')
const { executeStep } = require('./step-runner')
const { buildPreviewSteps } = require('./timing')

let previewBrowser = null
let previewContext = null
let previewPage = null
let previewSignature = null
let latestRequestId = 0
let previewQueue = Promise.resolve()
const previewCache = new Map()
const MAX_CACHE_ENTRIES = 48

function getViewport(browserConfig) {
  return {
    width: browserConfig?.width || 1280,
    height: browserConfig?.height || 800,
  }
}

function cacheResult(key, value) {
  if (previewCache.has(key)) {
    previewCache.delete(key)
  }
  previewCache.set(key, value)
  if (previewCache.size > MAX_CACHE_ENTRIES) {
    const oldestKey = previewCache.keys().next().value
    if (oldestKey) previewCache.delete(oldestKey)
  }
}

async function disposePreviewSession() {
  previewSignature = null

  if (previewPage) {
    try {
      await previewPage.close()
    } catch {}
    previewPage = null
  }

  if (previewContext) {
    try {
      await previewContext.close()
    } catch {}
    previewContext = null
  }

  if (previewBrowser) {
    try {
      await previewBrowser.close()
    } catch {}
    previewBrowser = null
  }
}

async function ensurePreviewSession(browserConfig) {
  const viewport = getViewport(browserConfig)
  const signature = JSON.stringify(viewport)

  if (!previewBrowser) {
    previewBrowser = await chromium.launch({ headless: true })
  }

  if (previewSignature !== signature || !previewContext || !previewPage) {
    if (previewPage) {
      try {
        await previewPage.close()
      } catch {}
    }
    if (previewContext) {
      try {
        await previewContext.close()
      } catch {}
    }

    previewContext = await previewBrowser.newContext({ viewport })
    previewPage = await previewContext.newPage()
    previewSignature = signature
  }

  return previewPage
}

function buildStateKey(url, previewSteps, browserConfig) {
  return JSON.stringify({
    url,
    browserConfig: getViewport(browserConfig),
    previewSteps,
  })
}

async function renderPreviewState(url, steps, timeMs, browserConfig) {
  const requestId = ++latestRequestId

  previewQueue = previewQueue.then(async () => {
    if (requestId !== latestRequestId) {
      return { success: false, skipped: true }
    }

    const previewSteps = buildPreviewSteps(Array.isArray(steps) ? steps : [], timeMs)
    const cacheKey = buildStateKey(url, previewSteps, browserConfig)
    const cached = previewCache.get(cacheKey)
    if (cached) {
      cacheResult(cacheKey, cached)
      return {
        success: true,
        dataUrl: cached,
        cached: true,
      }
    }

    try {
      const page = await ensurePreviewSession(browserConfig)
      await page.goto(url, { waitUntil: 'load', timeout: 15000 })
      await page.waitForTimeout(140)

      for (const step of previewSteps) {
        await executeStep(page, step, () => {}, { preview: true, cursor: { enabled: false } })
      }

      const buffer = await page.screenshot({ type: 'png' })
      const dataUrl = `data:image/png;base64,${buffer.toString('base64')}`
      cacheResult(cacheKey, dataUrl)

      return {
        success: true,
        dataUrl,
      }
    } catch (error) {
      return {
        success: false,
        error: error.message,
      }
    }
  })

  return previewQueue
}

module.exports = {
  renderPreviewState,
  disposePreviewSession,
}
