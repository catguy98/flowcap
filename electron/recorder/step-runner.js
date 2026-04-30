const {
  getLocatorInteractionPoint,
  moveShowcaseCursorToLocator,
  pulseShowcaseCursor,
} = require('./cursor')
const { applyContentZoom } = require('./motion')

async function waitForStableLocator(locator, page, options = {}) {
  const timeoutMs = options.timeoutMs ?? 1400
  const stableMs = options.stableMs ?? 160
  const threshold = options.threshold ?? 0.75
  const startedAt = Date.now()
  let lastBox = null
  let stableSince = 0

  while (Date.now() - startedAt < timeoutMs) {
    const box = await locator.boundingBox().catch(() => null)
    if (!box) {
      stableSince = 0
      lastBox = null
      await page.waitForTimeout(50)
      continue
    }

    if (
      lastBox &&
      Math.abs(box.x - lastBox.x) <= threshold &&
      Math.abs(box.y - lastBox.y) <= threshold &&
      Math.abs(box.width - lastBox.width) <= threshold &&
      Math.abs(box.height - lastBox.height) <= threshold
    ) {
      if (!stableSince) stableSince = Date.now()
      if (Date.now() - stableSince >= stableMs) return box
    } else {
      stableSince = 0
    }

    lastBox = box
    await page.waitForTimeout(50)
  }

  return lastBox
}

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
        await waitForStableLocator(locator, page)
        if (!runtime.preview) {
          await moveShowcaseCursorToLocator(page, locator, runtime.cursor, {
            skipNativeMouseMove: false,
          })
        } else {
          const tp = await getLocatorInteractionPoint(locator)
          if (tp) await locator.hover({ position: { x: tp.offsetX, y: tp.offsetY } })
          else await locator.hover()
        }
        break
      }
      case 'click': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({ state: 'visible', timeout: 5000 })
        await waitForStableLocator(locator, page)
        if (!runtime.preview) {
          await moveShowcaseCursorToLocator(page, locator, runtime.cursor, {
            skipNativeMouseMove: Boolean(runtime.cursor?.enabled),
          })
          await pulseShowcaseCursor(page, runtime.cursor)
        }
        await waitForStableLocator(locator, page, { timeoutMs: 900, stableMs: 100 })
        if (
          typeof step.selector === 'string' &&
          /privacy-(shared|private)-control/.test(step.selector)
        ) {
          const inputLocator = page
            .locator(step.selector.replace(/-control$/, '-input'))
            .first()
          await inputLocator.waitFor({ state: 'attached', timeout: 5000 })
          await inputLocator.check({ force: true })
          break
        }
        const targetPoint = await getLocatorInteractionPoint(locator)
        if (targetPoint) {
          await locator.click({
            position: {
              x: targetPoint.offsetX,
              y: targetPoint.offsetY,
            },
          })
        } else {
          await locator.click()
        }
        await page.waitForTimeout(800) // settle time for post-click animations
        break
      }
      case 'type': {
        const locator = page.locator(step.selector).first()
        await locator.waitFor({ state: 'visible', timeout: 5000 })
        await waitForStableLocator(locator, page)
        const isAlreadyFocused = await locator.evaluate(
          (element) => element === document.activeElement,
        )
        if (!isAlreadyFocused) {
          if (!runtime.preview) {
            await moveShowcaseCursorToLocator(page, locator, runtime.cursor, {
              skipNativeMouseMove: Boolean(runtime.cursor?.enabled),
            })
            await pulseShowcaseCursor(page, runtime.cursor)
          }
          await waitForStableLocator(locator, page, { timeoutMs: 900, stableMs: 100 })
          const targetPoint = await getLocatorInteractionPoint(locator)
          if (targetPoint) {
            await locator.click({
              position: {
                x: targetPoint.offsetX,
                y: targetPoint.offsetY,
              },
            })
          } else {
            await locator.click()
          }
        }
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
