const { chromium } = require('playwright')
const { executeStep } = require('./step-runner')
const { buildPreviewSteps } = require('./timing')

async function renderPreviewState(url, steps, timeMs, browserConfig) {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext({
      viewport: {
        width: browserConfig?.width || 1280,
        height: browserConfig?.height || 800,
      },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    await page.waitForTimeout(500)

    const previewSteps = buildPreviewSteps(Array.isArray(steps) ? steps : [], timeMs)
    for (const step of previewSteps) {
      await executeStep(page, step, () => {}, { preview: true, cursor: { enabled: false } })
    }

    const buffer = await page.screenshot({ type: 'png' })
    await context.close()
    await browser.close()

    return {
      success: true,
      dataUrl: `data:image/png;base64,${buffer.toString('base64')}`,
    }
  } catch (error) {
    await browser.close()
    return {
      success: false,
      error: error.message,
    }
  }
}

module.exports = {
  renderPreviewState,
}
