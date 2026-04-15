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
  await maskPage.screenshot({ path: maskPath })
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

async function composeFinalVideo({
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
}) {
  const frameSize = mockupSpec
    ? { width: mockupSpec.outerWidth, height: mockupSpec.outerHeight }
    : { width: browserConfig.width, height: browserConfig.height }
  const framePlacement = resolvePlacement(frameSize.width, frameSize.height, placement)
  const contentPlacement = {
    x: framePlacement.x + (mockupSpec?.screenX || 0),
    y: framePlacement.y + (mockupSpec?.screenY || 0),
  }
  const zoomTail = buildZoomFilterChain('[base]', '[out]', zoomPercent, durationSec)
  const qualityProfile = getQualityProfile(quality)
  let ffmpegArgs = []

  if (bgImagePath) {
    onProgress('Compositing high quality final video with custom background image...')
    ffmpegArgs = ['-y', '-loop', '1', '-i', bgImagePath, '-i', rawVideoPath, '-i', maskPath]

    if (mockupFramePath) {
      ffmpegArgs.push('-loop', '1', '-i', mockupFramePath)
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p[bg];[1:v]format=yuva420p[vid_fmt];[vid_fmt][2:v]alphamerge[rounded_vid];[bg][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}[bg_with_content];[bg_with_content][3:v]overlay=${framePlacement.x}:${framePlacement.y}:shortest=1[base];${zoomTail}`,
      )
    } else {
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]scale=1920:1080:force_original_aspect_ratio=increase,crop=1920:1080,format=yuv420p[bg];[1:v]format=yuva420p[vid_fmt];[vid_fmt][2:v]alphamerge[rounded_vid];[bg][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}:shortest=1[base];${zoomTail}`,
      )
    }

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
      '60',
      '-t',
      `${durationSec}`,
      '-pix_fmt',
      'yuv420p',
      outputPath,
    )
  } else {
    onProgress('Compositing high quality final video with solid background color...')
    const formattedColor = bgColor ? bgColor.replace('#', '0x') : '0x0a0a0f'
    ffmpegArgs = [
      '-y',
      '-i',
      rawVideoPath,
      '-i',
      maskPath,
      '-f',
      'lavfi',
      '-i',
      `color=c=${formattedColor}:s=1920x1080:r=60:d=${durationSec}`,
    ]

    if (mockupFramePath) {
      ffmpegArgs.push('-loop', '1', '-i', mockupFramePath)
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]format=yuva420p[vid_fmt];[vid_fmt][1:v]alphamerge[rounded_vid];[2:v][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}[bg_with_content];[bg_with_content][3:v]overlay=${framePlacement.x}:${framePlacement.y}:shortest=1[base];${zoomTail}`,
      )
    } else {
      ffmpegArgs.push(
        '-filter_complex',
        `[0:v]format=yuva420p[vid_fmt];[vid_fmt][1:v]alphamerge[rounded_vid];[2:v][rounded_vid]overlay=${contentPlacement.x}:${contentPlacement.y}:shortest=1[base];${zoomTail}`,
      )
    }

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
      '60',
      '-pix_fmt',
      'yuv420p',
      outputPath,
    )
  }

  await runFfmpeg(ffmpegArgs)
}

async function cleanupRecordingArtifacts(paths) {
  await Promise.all(
    paths.filter(Boolean).map((filePath) => fs.unlink(filePath).catch(() => {})),
  )
}

module.exports = {
  createRoundedMask,
  composeFinalVideo,
  cleanupRecordingArtifacts,
}
