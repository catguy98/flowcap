const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs/promises')
const { installShowcaseCursor } = require('./recorder/cursor')
const { getMockupSpec, createMockupFrame } = require('./recorder/mockups')
const { executeStep } = require('./recorder/step-runner')
const { installMotionTimeline } = require('./recorder/motion')
const {
  createRoundedMask,
  composeFinalVideo,
  cleanupRecordingArtifacts,
} = require('./recorder/compose')
const { analyzeUrl: analyzeUrlWithBrowser } = require('./recorder/analyzer')
const { renderPreviewState: renderPreviewStateWithBrowser } = require('./recorder/preview')

async function startRecording(
  url,
  steps,
  durationSec,
  bgColor,
  bgImagePath,
  borderRadius,
  zoomPercent,
  quality,
  browserConfig,
  placement,
  cursor,
  mockup,
  motion,
  outputPath,
  onProgress,
) {
  onProgress('Launching browser...')
  const videosDir = path.join(__dirname, '..', 'output', 'raw-videos')

  try {
    const oldFiles = await fs.readdir(videosDir)
    for (const file of oldFiles) {
      await fs.unlink(path.join(videosDir, file)).catch(() => {})
    }
  } catch {
    // Directory may not exist yet.
  }

  await fs.mkdir(videosDir, { recursive: true })

  const browser = await chromium.launch({ headless: true })
  const context = await browser.newContext({
    viewport: { width: browserConfig.width, height: browserConfig.height },
    recordVideo: {
      dir: videosDir,
      size: { width: browserConfig.width, height: browserConfig.height },
    },
  })

  const page = await context.newPage()

  onProgress(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  await installShowcaseCursor(page, cursor)
  await installMotionTimeline(page, motion)

  for (let i = 0; i < steps.length; i += 1) {
    await executeStep(page, steps[i], onProgress, {
      cursor: {
        ...cursor,
        durationSec: Number.parseFloat(durationSec) || 0,
      },
    })
  }

  onProgress('Waiting for duration end...')
  await page.waitForTimeout(1000)

  const video = page.video()
  const rawVideoPath = path.join(__dirname, '..', 'output', `temp_raw_${Date.now()}.webm`)
  const mockupSpec = getMockupSpec(mockup, browserConfig, borderRadius)

  onProgress('Finalizing raw video recording...')
  await page.close()
  await video.saveAs(rawVideoPath)

  let mockupFramePath = null
  if (mockupSpec) {
    onProgress('Generating mockup frame...')
    mockupFramePath = await createMockupFrame(browser, mockupSpec, url)
  }

  onProgress('Generating rounded corner mask...')
  const maskPath = await createRoundedMask(context, browserConfig, borderRadius, mockupSpec)

  await context.close()
  await browser.close()

  await composeFinalVideo({
    rawVideoPath,
    maskPath,
    mockupFramePath,
    mockupSpec,
    bgImagePath,
    bgColor,
    durationSec,
    zoomPercent,
    quality,
    browserConfig,
    placement,
    outputPath,
    onProgress,
  })

  onProgress('Cleaning up raw files...')
  await cleanupRecordingArtifacts([rawVideoPath, maskPath, mockupFramePath])

  onProgress(`Done! Saved to ${outputPath}`)
}

async function analyzeUrl(url) {
  return analyzeUrlWithBrowser(url, chromium)
}

async function renderPreviewState(url, steps, timeMs, browserConfig) {
  return renderPreviewStateWithBrowser(url, steps, timeMs, browserConfig)
}

module.exports = {
  startRecording,
  analyzeUrl,
  renderPreviewState,
}
