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
const {
  renderPreviewState: renderPreviewStateWithBrowser,
  disposePreviewSession,
} = require('./recorder/preview')
const { startFrameRenderedRecording } = require('./recorder/frame-renderer')

async function startRecording(
  url,
  steps,
  durationSec,
  bgColor,
  bgImagePath,
  borderRadius,
  zoomPercent,
  camera,
  quality,
  browserConfig,
  placement,
  cursor,
  interaction,
  mockup,
  motion,
  render,
  outputPath,
  onProgress,
) {
  if (render?.mode === 'studio') {
    await startFrameRenderedRecording({
      chromium,
      url,
      steps,
      durationSec,
      bgColor,
      bgImagePath,
      borderRadius,
      zoomPercent,
      camera,
      quality,
      browserConfig,
      placement,
      cursor,
      interaction,
      mockup,
      motion,
      render,
      outputPath,
      onProgress,
    })
    return
  }

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

  const requestedCaptureScale = Math.min(
    Math.max(Number.parseFloat(browserConfig.captureScale) || 1, 1),
    2,
  )
  const captureScale = 1
  const recordVideoSize = {
    width: browserConfig.width,
    height: browserConfig.height,
  }

  const browser = await chromium.launch({
    headless: true,
    args: ['--use-gl=swiftshader', '--enable-gpu-rasterization'],
  })
  const context = await browser.newContext({
    viewport: { width: browserConfig.width, height: browserConfig.height },
    recordVideo: {
      dir: videosDir,
      size: recordVideoSize,
    },
  })

  const page = await context.newPage()

  onProgress(`Navigating to ${url}...`)
  await page.goto(url, { waitUntil: 'load' })
  await page.waitForTimeout(1000)
  const PAGE_LOAD_TRIM_SEC = 1.5  // skip the loading screen from the output
  onProgress(
    `Capture source -> viewport=${browserConfig.width}x${browserConfig.height} video=${recordVideoSize.width}x${recordVideoSize.height}${requestedCaptureScale > 1 ? ` (requested scale ${requestedCaptureScale} ignored for Playwright video stability)` : ''}`,
  )
  if (interaction?.disableHoverMotion) {
    onProgress('Disabling hover motion for stable recording...')
    await page.addStyleTag({
      content: `
        * {
          scroll-behavior: auto !important;
        }
        .privacy-option,
        .privacy-option:hover,
        .modal-select-field,
        .modal-select-field:hover,
        .selected-team-selector,
        .selected-team-selector:hover,
        .team-menu-item,
        .team-menu-item:hover,
        .modal-button,
        .modal-button:hover,
        .primary-button,
        .primary-button:hover {
          transition: none !important;
          transform: none !important;
          animation: none !important;
          box-shadow: none !important;
          opacity: 1 !important;
          visibility: visible !important;
        }
      `,
    })
  }
  await installShowcaseCursor(page, cursor)
  await installMotionTimeline(page, motion)

  for (let i = 0; i < steps.length; i += 1) {
    await executeStep(page, steps[i], onProgress, {
      cursor: {
        ...cursor,
        durationSec: Number.parseFloat(durationSec) || 0,
      },
      interaction,
    })
  }

  const subjectCenter = await page.evaluate(() => {
    const candidates = [
      '[data-flowcap-motion-target="create-folder-modal"]',
      '[data-flowcap-motion-target="folder-card"]',
      '[data-flowcap-motion-target="empty-state"]',
      '[data-flowcap-motion-target="workspace-card"]',
    ]

    for (const selector of candidates) {
      const element = document.querySelector(selector)
      if (!(element instanceof HTMLElement)) continue
      const rect = element.getBoundingClientRect()
      if (rect.width <= 0 || rect.height <= 0) continue
      return {
        selector,
        x: Math.round(rect.x + rect.width / 2),
        y: Math.round(rect.y + rect.height / 2),
        width: Math.round(rect.width),
        height: Math.round(rect.height),
      }
    }

    return null
  })

  if (subjectCenter) {
    onProgress(
      `Subject center -> ${subjectCenter.selector} center=(${subjectCenter.x},${subjectCenter.y}) size=${subjectCenter.width}x${subjectCenter.height}`,
    )
  }

  if (camera?.anchorMode === 'subject' && subjectCenter) {
    onProgress('Camera anchor source -> subject')
  } else {
    onProgress('Camera anchor source -> canvas-center')
  }

  onProgress('Waiting for duration end...')
  await page.waitForTimeout(Math.max((Number.parseFloat(durationSec) || 3) * 1000, 1000))

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
    trimStartSec: PAGE_LOAD_TRIM_SEC,
    camera:
      camera?.anchorMode === 'subject' && subjectCenter
        ? {
            ...camera,
            anchorX: subjectCenter.x,
            anchorY: subjectCenter.y,
            anchorSpace: 'content',
          }
        : {
            ...camera,
            anchorSpace: camera?.anchorSpace === 'content' ? 'content' : 'canvas',
          },
    quality,
    browserConfig,
    placement,
    fps: parseInt(render?.fps, 10) || 60,
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

async function disposePreviewState() {
  await disposePreviewSession()
}

module.exports = {
  startRecording,
  analyzeUrl,
  renderPreviewState,
  disposePreviewState,
}
