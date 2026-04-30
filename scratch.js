/**
 * DIAGNOSTIC 3: Does locator.waitFor() miss animation frames?
 * Tests the key scenario: click → animation starts → waitFor resolves → frames missed?
 */
const { chromium } = require('playwright')
const path = require('path')
const fs = require('fs/promises')
const os = require('os')

;(async () => {
  const framesDir = path.join(os.tmpdir(), 'flowcap_diag3_' + Date.now())
  await fs.mkdir(framesDir, { recursive: true })

  const browser = await chromium.launch({ headless: true, args: ['--disable-gpu'] })
  const context = await browser.newContext({ viewport: { width: 400, height: 300 } })
  await context.clock.install({ time: Date.now() })
  const page = await context.newPage()

  await page.setContent(`
    <style>
      #panel {
        width: 300px;
        height: 0px;
        background: royalblue;
        overflow: hidden;
        transition: height 400ms linear;
        display: none;
      }
      #panel.open {
        display: block;
        height: 150px;
      }
      #btn { padding: 8px 16px; font-size: 16px; cursor: pointer; }
      #status { font-size: 14px; padding: 4px; }
    </style>
    <button id="btn">Open</button>
    <div id="status">closed</div>
    <div id="panel" data-testid="panel">Content here</div>
    <script>
      document.getElementById('btn').onclick = () => {
        document.getElementById('panel').classList.add('open')
        document.getElementById('status').textContent = 'open'
      }
    </script>
  `)

  await context.clock.runFor(500)

  const frameIntervalMs = 1000 / 60
  let frameIndex = 0

  async function syncWebAnimations(intervalMs) {
    await page.evaluate((interval) => {
      document.getAnimations().forEach((anim) => {
        if (anim.playState === 'running') anim.pause()
        if (anim.playState === 'paused') anim.currentTime = (anim.currentTime || 0) + interval
      })
    }, intervalMs).catch(() => {})
  }

  async function captureFrame(label) {
    frameIndex++
    const panelH = await page.evaluate(() => {
      const el = document.getElementById('panel')
      return el.getBoundingClientRect().height
    })
    const anims = await page.evaluate(() =>
      document.getAnimations().map(a => ({
        state: a.playState,
        time: Math.round(a.currentTime || 0),
      }))
    )
    console.log(`Frame ${String(frameIndex).padStart(3)}: panel=${panelH.toFixed(0)}px | anims=${JSON.stringify(anims)} [${label}]`)
    await page.screenshot({ path: path.join(framesDir, `frame_${String(frameIndex).padStart(4,'0')}.png`), animations: 'allow' })
  }

  async function advanceFrame(label) {
    await context.clock.runFor(frameIntervalMs)
    await syncWebAnimations(frameIntervalMs)
    await captureFrame(label)
  }

  console.log('--- 3 frames before click ---')
  for (let i = 0; i < 3; i++) await advanceFrame('pre-click')

  console.log('\n--- CLICK ---')
  await page.click('#btn')

  console.log('\n--- check: does waitFor miss frames? ---')
  console.log('Starting locator.waitFor (this blocks without capturing frames)...')
  const waitStart = Date.now()
  await page.locator('[data-testid="panel"]').waitFor({ state: 'visible' })
  const waitMs = Date.now() - waitStart
  console.log(`waitFor resolved after ${waitMs}ms real time — animation frames MISSED during this!`)

  console.log('\n--- 20 frames after waitFor ---')
  for (let i = 0; i < 20; i++) await advanceFrame('post-waitFor')

  console.log('\nFrames dir:', framesDir)
  await browser.close()
})()
