const path = require('path')

function getMockupSpec(mockup, browserConfig, borderRadius) {
  const type = mockup?.type || 'none'

  if (type === 'browser') {
    return {
      type,
      outerWidth: browserConfig.width + 48,
      outerHeight: browserConfig.height + 72,
      screenX: 24,
      screenY: 52,
      screenWidth: browserConfig.width,
      screenHeight: browserConfig.height,
      screenRadius: Math.max(parseInt(borderRadius, 10) || 0, 18),
    }
  }

  if (type === 'phone') {
    return {
      type,
      outerWidth: browserConfig.width + 72,
      outerHeight: browserConfig.height + 116,
      screenX: 36,
      screenY: 58,
      screenWidth: browserConfig.width,
      screenHeight: browserConfig.height,
      screenRadius: Math.max(parseInt(borderRadius, 10) || 0, 28),
    }
  }

  return null
}

function formatMockupTitle(url) {
  if (!url) return 'Local Preview'

  try {
    const parsed = new URL(url)
    if (parsed.protocol === 'file:') return 'Local Preview'
    const label = `${parsed.host}${parsed.pathname === '/' ? '' : parsed.pathname}`
    return label.length > 42 ? `${label.slice(0, 39)}...` : label
  } catch {
    return 'Local Preview'
  }
}

function buildMockupMarkup(spec, url) {
  if (spec.type === 'phone') {
    return `
      <style>
        html, body {
          margin: 0;
          width: 100%;
          height: 100%;
          background: transparent;
          overflow: hidden;
        }
        .shell {
          position: relative;
          width: ${spec.outerWidth}px;
          height: ${spec.outerHeight}px;
          border: 12px solid #0f172a;
          border-radius: 42px;
          background: transparent;
          box-sizing: border-box;
        }
        .screen {
          position: absolute;
          left: ${spec.screenX}px;
          top: ${spec.screenY}px;
          width: ${spec.screenWidth}px;
          height: ${spec.screenHeight}px;
          border-radius: ${spec.screenRadius}px;
          box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.08);
        }
        .notch {
          position: absolute;
          top: 10px;
          left: 50%;
          width: 34%;
          height: 16px;
          transform: translateX(-50%);
          border-radius: 999px;
          background: #0b1220;
        }
      </style>
      <div class="shell">
        <div class="notch"></div>
        <div class="screen"></div>
      </div>
    `
  }

  return `
    <style>
      html, body {
        margin: 0;
        width: 100%;
        height: 100%;
        background: transparent;
        overflow: hidden;
      }
      .shell {
        position: relative;
        width: ${spec.outerWidth}px;
        height: ${spec.outerHeight}px;
        border: 1px solid rgba(15, 23, 42, 0.08);
        border-radius: 24px;
        background: linear-gradient(180deg, #f8fafc 0%, #f1f5f9 100%);
        box-sizing: border-box;
        box-shadow: 0 12px 28px rgba(15, 23, 42, 0.08);
      }
      .chrome {
        position: absolute;
        inset: 0 0 auto 0;
        height: 46px;
        border-radius: 24px 24px 0 0;
        background: rgba(248, 250, 252, 0.96);
        border-bottom: 1px solid rgba(15, 23, 42, 0.08);
      }
      .dot {
        position: absolute;
        top: 18px;
        width: 8px;
        height: 8px;
        border-radius: 999px;
      }
      .dot.red { left: 16px; background: #ff5f57; }
      .dot.yellow { left: 32px; background: #febc2e; }
      .dot.green { left: 48px; background: #28c840; }
      .toolbar {
        position: absolute;
        top: 10px;
        left: 50%;
        transform: translateX(-50%);
        display: flex;
        justify-content: center;
        align-items: center;
        width: 40%;
        min-width: 220px;
        height: 26px;
      }
      .pill {
        display: inline-flex;
        align-items: center;
        justify-content: center;
        height: 24px;
        padding: 0 14px;
        border: 1px solid rgba(15, 23, 42, 0.06);
        border-radius: 999px;
        background: rgba(255, 255, 255, 0.88);
        color: rgba(15, 23, 42, 0.55);
        font-size: 11px;
        font-family: Inter, -apple-system, BlinkMacSystemFont, sans-serif;
        line-height: 1;
        letter-spacing: 0.01em;
      }
      .screen {
        position: absolute;
        left: ${spec.screenX}px;
        top: ${spec.screenY}px;
        width: ${spec.screenWidth}px;
        height: ${spec.screenHeight}px;
        border-radius: ${spec.screenRadius}px;
        box-shadow: inset 0 0 0 1px rgba(15, 23, 42, 0.06);
      }
    </style>
    <div class="shell">
      <div class="chrome"></div>
      <div class="dot red"></div>
      <div class="dot yellow"></div>
      <div class="dot green"></div>
      <div class="toolbar"><div class="pill">${formatMockupTitle(url)}</div></div>
      <div class="screen"></div>
    </div>
  `
}

async function createMockupFrame(browser, spec, url) {
  const frameContext = await browser.newContext({
    viewport: { width: spec.outerWidth, height: spec.outerHeight },
  })
  const framePage = await frameContext.newPage()
  const framePath = path.join(__dirname, '..', '..', 'output', `mockup_${Date.now()}.png`)

  await framePage.setContent(buildMockupMarkup(spec, url))
  await framePage.screenshot({
    path: framePath,
    omitBackground: true,
  })

  await frameContext.close()
  return framePath
}

module.exports = {
  getMockupSpec,
  createMockupFrame,
}
