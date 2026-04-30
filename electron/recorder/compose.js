const path = require('path')
const fs = require('fs/promises')
const { spawn } = require('child_process')
const ffmpegStatic = require('ffmpeg-static')
const { resolvePlacement, getQualityProfile } = require('./utils')
const { buildZoomFilterChain } = require('./motion')

async function createRoundedMask(context, browserConfig, borderRadius, mockupSpec) {
  const maskPath = path.join(__dirname, '..', '..', 'output', `mask_${Date.now()}.png`)
  const maskPage = await context.newPage()
  await maskPage.setContent(`
    <style>
      body { margin: 0; background: black; overflow: hidden; }
      .mask { width: ${browserConfig.width}px; height: ${browserConfig.height}px; background: white; border-radius: ${(mockupSpec?.screenRadius ?? borderRadius) || 0}px; }
    </style>
    <div class="mask"></div>
  `)
  await maskPage.screenshot({ path: maskPath, scale: 'css' })
  await maskPage.close()
  return maskPath
}

async function runFfmpeg(ffmpegArgs) {
  await new Promise((resolve, reject) => {
    const ffmpegProc = spawn(ffmpegStatic, ffmpegArgs)
    let stderrLog = ''

    ffmpegProc.stderr.on('data', (data) => {
      stderrLog += data.toString()
    })

    ffmpegProc.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }

      const shortLog =
        stderrLog.length > 300 ? `...${stderrLog.slice(-300)}` : stderrLog
      reject(new Error(`ffmpeg failed (code ${code}): ${shortLog}`))
    })

    ffmpegProc.on('error', (err) => reject(err))
  })
}

function appendVideoOutputArgs(ffmpegArgs, qualityProfile, outputPath, fps = 60) {
  ffmpegArgs.push(
    '-map',
    '[out]',
    '-c:v',
    'libx264',
    '-preset',
    qualityProfile.preset,
    '-crf',
    qualityProfile.crf,
    '-r',
    String(fps),
    '-pix_fmt',
    'yuv420p',
    '-colorspace',
    'bt709',
    '-color_primaries',
    'bt709',
    '-color_trc',
    'bt709',
    '-movflags',
    '+faststart',
    outputPath,
  )
}

function buildRawVideoPrep(inputLabel, outputLabel) {
  return `${inputLabel}setsar=1,format=yuva420p${outputLabel}`
}

async function composeFinalVideo({
  rawVideoPath,
  maskPath,
  mockupFramePath,
  mockupSpec,
  bgImagePath,
  bgColor,
  durationSec,
  zoomPercent,
  camera,
  quality,
  browserConfig,
  placement,
  fps = 60,
  trimStartSec = 0,
  outputPath,
  onProgress,
}) {
  const outputWidth = bgImagePath ? 1920 : browserConfig.width
  const outputHeight = bgImagePath ? 1080 : browserConfig.height
  const frameSize = mockupSpec
    ? { width: mockupSpec.outerWidth, height: mockupSpec.outerHeight }
    : { width: browserConfig.width, height: browserConfig.height }
  const framePlacement = resolvePlacement(frameSize.width, frameSize.height, placement, outputWidth, outputHeight)
  const contentPlacement = {
    x: framePlacement.x + (mockupSpec?.screenX || 0),
    y: framePlacement.y + (mockupSpec?.screenY || 0),
  }
  const anchorSpace = camera?.anchorSpace === 'content' ? 'content' : 'canvas'
  const rawAnchor = {
    x: Number.isFinite(Number.parseFloat(camera?.anchorX))
      ? Math.round(Number.parseFloat(camera.anchorX))
      : Math.round(outputWidth / 2),
    y: Number.isFinite(Number.parseFloat(camera?.anchorY))
      ? Math.round(Number.parseFloat(camera.anchorY))
      : Math.round(outputHeight / 2),
  }
  const zoomAnchor = {
    x:
      anchorSpace === 'content'
        ? rawAnchor.x + contentPlacement.x
        : rawAnchor.x,
    y:
      anchorSpace === 'content'
        ? rawAnchor.y + contentPlacement.y
        : rawAnchor.y,
  }
  onProgress(
    `Compose placement -> frame=(${framePlacement.x},${framePlacement.y}) content=(${contentPlacement.x},${contentPlacement.y}) frameSize=${frameSize.width}x${frameSize.height} canvas=${outputWidth}x${outputHeight}`,
  )
  onProgress(
    `Camera zoom -> percent=${Number.parseFloat(zoomPercent) || 0} startMs=${parseInt(camera?.zoomStartMs, 10) || 0} durationMs=${parseInt(camera?.zoomDurationMs, 10) || 0} anchorSpace=${anchorSpace} rawAnchor=(${rawAnchor.x},${rawAnchor.y}) canvasAnchor=(${zoomAnchor.x},${zoomAnchor.y})`,
  )
  onProgress(
    `Camera zoom mode -> ${zoomAnchor.x === outputWidth / 2 && zoomAnchor.y === outputHeight / 2 ? 'strict-center-crop' : 'anchored-crop'}`,
  )
  const zoomTail = buildZoomFilterChain(
    '[base]',
    '[out]',
    zoomPercent,
    durationSec,
    {
      ...camera,
      anchorX: zoomAnchor.x,
      anchorY: zoomAnchor.y,
    },
    outputWidth,
    outputHeight,
  )
  const qualityProfile = getQualityProfile(quality)
  const rawVideoPrepFromInput0 = buildRawVideoPrep('[0:v]', '[vid_fmt]')
  const rawVideoPrepFromInput1 = buildRawVideoPrep('[1:v]', '[vid_fmt]')
  let ffmpegArgs = []

  if (bgImagePath) {
    onProgress('Compositing high quality final video with custom background image...')
    ffmpegArgs = ['-y', '-loop', '1', '-i', bgImagePath, '-ss', String(trimStartSec), '-i', rawVideoPath, '-i', maskPath]

    if (mockupFramePath) {
      ffmpegArgs.push('-loop', '1', '-i', mockupFramePath)
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p[bg];${rawVideoPrepFromInput1};[vid_fmt][2:v]alphamerge[rounded_vid];[bg][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}[bg_with_content];[bg_with_content][3:v]overlay=${framePlacement.x}:${framePlacement.y}:shortest=1[base];${zoomTail}`,
      )
    } else {
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p[bg];${rawVideoPrepFromInput1};[vid_fmt][2:v]alphamerge[rounded_vid];[bg][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}:shortest=1[base];${zoomTail}`,
      )
    }

    ffmpegArgs.push('-t', `${durationSec}`)
    appendVideoOutputArgs(ffmpegArgs, qualityProfile, outputPath, fps)
  } else {
    onProgress('Compositing high quality final video with solid background color...')
    const formattedColor = bgColor ? bgColor.replace('#', '0x') : '0x0a0a0f'
    ffmpegArgs = [
      '-y',
      '-ss', String(trimStartSec),
      '-i',
      rawVideoPath,
      '-i',
      maskPath,
      '-f',
      'lavfi',
      '-i',
      `color=c=${formattedColor}:s=${browserConfig.width}x${browserConfig.height}:r=${fps}:d=${durationSec}`,
    ]

    if (mockupFramePath) {
      ffmpegArgs.push('-loop', '1', '-i', mockupFramePath)
      ffmpegArgs.push(
        '-filter_complex',
        `${rawVideoPrepFromInput0};[vid_fmt][1:v]alphamerge[rounded_vid];[2:v][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}[bg_with_content];[bg_with_content][3:v]overlay=${framePlacement.x}:${framePlacement.y}:shortest=1[base];${zoomTail}`,
      )
    } else {
      ffmpegArgs.push(
        '-filter_complex',
        `${rawVideoPrepFromInput0};[vid_fmt][1:v]alphamerge[rounded_vid];[2:v][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}:shortest=1[base];${zoomTail}`,
      )
    }

    appendVideoOutputArgs(ffmpegArgs, qualityProfile, outputPath, fps)
  }

  await runFfmpeg(ffmpegArgs)
}

async function cleanupRecordingArtifacts(paths) {
  await Promise.all(
    paths.filter(Boolean).map((filePath) => fs.unlink(filePath).catch(() => {})),
  )
}

module.exports = {
  runFfmpeg,
  createRoundedMask,
  composeFinalVideo,
  cleanupRecordingArtifacts,
}
