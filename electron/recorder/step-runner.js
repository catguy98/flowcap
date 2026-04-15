const { moveShowcaseCursorToLocator, pulseShowcaseCursor } = require('./cursor')
const { applyContentZoom } = require('./motion')

async function executeStep(page, step, onProgress, runtime = {}) {
  onProgress(`Executing: ${step.action}`)
  try {
    switch (step.action) {
      case 'wait':
        if (!runtime.preview) {
          await page.waitForTimeout(parseInt(step.ms, 10) || 1000)
        }
        break
      case 'wait_for': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({
          state: step.state || 'visible',
          timeout: runtime.preview ? 1500 : parseInt(step.timeout, 10) || 5000,
        })
        break
      }
      case 'hover': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({ state: 'visible', timeout: 5000 })
        if (!runtime.preview) {
          await moveShowcaseCursorToLocator(page, locator, runtime.cursor)
        }
        await locator.hover()
        break
      }
      case 'click': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({ state: 'visible', timeout: 5000 })
        if (!runtime.preview) {
          await moveShowcaseCursorToLocator(page, locator, runtime.cursor)
          await pulseShowcaseCursor(page, runtime.cursor)
        }
        await locator.click()
        break
      }
      case 'type': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({ state: 'visible', timeout: 5000 })
        if (!runtime.preview) {
          await moveShowcaseCursorToLocator(page, locator, runtime.cursor)
          await pulseShowcaseCursor(page, runtime.cursor)
        }
        await locator.click()
        if (parseInt(step.delay, 10) > 0) {
          await locator.fill('')
          await locator.type(step.text || '', {
            delay: parseInt(step.delay, 10),
          })
        } else {
          await locator.fill(step.text || '')
        }
        break
      }
      case 'scroll':
        await page.evaluate((y) => window.scrollBy(0, y), parseInt(step.y, 10) || 0)
        break
      case 'content_zoom':
      case 'zoom': {
        if (runtime.preview) break
        const targetPercent =
          step.action === 'zoom'
            ? Math.max((Number.parseFloat(step.level) - 1) * 100, 0)
            : Number.parseFloat(step.percent) || 0
        onProgress(
          step.selector
            ? `Content zoom to ${targetPercent}% around ${step.selector}`
            : `Content zoom to ${targetPercent}%`,
        )
        await applyContentZoom(page, {
          ...step,
          percent: targetPercent,
        })
        break
      }
      case 'zoom_out':
        if (runtime.preview) break
        onProgress('Resetting content zoom')
        await applyContentZoom(page, { percent: 0, duration: step.duration || 380 })
        break
    }
  } catch (err) {
    onProgress(`Error in step ${step.action}: ${err.message}`)
  }
}

module.exports = {
  executeStep,
}
