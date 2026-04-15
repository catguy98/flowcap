function mergeTargets(existingTargets, nextTargets) {
  const merged = [...existingTargets]
  const seen = new Set(existingTargets.map((target) => `${target.phase}:${target.selector}`))

  nextTargets.forEach((target) => {
    const key = `${target.phase}:${target.selector}`
    if (!seen.has(key)) {
      seen.add(key)
      merged.push(target)
    }
  })

  return merged
}

function suggestTextForTarget(target) {
  const label = (target.label || '').toLowerCase()
  if (/folder|project|name|title/.test(label)) return 'February Project'
  if (/email/.test(label)) return 'demo@example.com'
  if (/search/.test(label)) return 'Search term'
  return 'Demo text'
}

function pickBestTarget(targets, predicate, excludedSelectors = new Set()) {
  return targets
    .filter((target) => !excludedSelectors.has(target.selector))
    .filter(predicate)
    .sort((a, b) => b.score - a.score)[0]
}

function pushStep(steps, step) {
  steps.push(step)
}

async function safeClick(page, selector) {
  try {
    const locator = page.locator(selector).first()
    await locator.waitFor({ state: 'visible', timeout: 3000 })
    await locator.click()
    return true
  } catch {
    return false
  }
}

async function scanTargets(page, phase) {
  return page.evaluate((currentPhase) => {
    const interactiveSelector =
      'button, [role="button"], [role="tab"], input:not([type="hidden"]), textarea, select'

    function normalizeText(value) {
      return (value || '').replace(/\s+/g, ' ').trim()
    }

    function cssEscapeValue(value) {
      if (window.CSS && typeof window.CSS.escape === 'function') {
        return window.CSS.escape(value)
      }
      return String(value).replace(/["\\]/g, '\\$&')
    }

    function isVisible(el) {
      if (!el || !(el instanceof Element)) return false
      const style = window.getComputedStyle(el)
      if (
        style.display === 'none' ||
        style.visibility === 'hidden' ||
        style.opacity === '0'
      ) {
        return false
      }
      const rect = el.getBoundingClientRect()
      return rect.width > 0 && rect.height > 0
    }

    function unique(selector) {
      if (!selector) return false
      try {
        return document.querySelectorAll(selector).length === 1
      } catch {
        return false
      }
    }

    function stableClasses(el) {
      return Array.from(el.classList || []).filter(
        (className) =>
          /^[A-Za-z_-][\w-]*$/.test(className) &&
          !/\d{4,}/.test(className) &&
          !/__/.test(className) &&
          className.length < 40,
      )
    }

    function pushCandidate(candidates, selector, source) {
      if (!selector) return
      if (candidates.some((candidate) => candidate.selector === selector)) return
      candidates.push({ selector, source })
    }

    function simpleSelector(el) {
      const tag = el.tagName.toLowerCase()
      const classes = stableClasses(el)
      if (classes.length > 0) {
        return `${tag}.${classes.slice(0, 2).map(cssEscapeValue).join('.')}`
      }

      let position = 1
      let sibling = el
      while ((sibling = sibling.previousElementSibling)) {
        if (sibling.tagName === el.tagName) position += 1
      }
      return `${tag}:nth-of-type(${position})`
    }

    function fullPathSelector(el) {
      const parts = []
      let current = el

      while (
        current &&
        current.nodeType === Node.ELEMENT_NODE &&
        current !== document.body
      ) {
        parts.unshift(simpleSelector(current))
        const selector = parts.join(' > ')
        if (unique(selector)) return selector
        current = current.parentElement
      }

      parts.unshift('body')
      return parts.join(' > ')
    }

    function buildSelectorData(el) {
      const tag = el.tagName.toLowerCase()
      const candidates = []

      if (el.id) {
        pushCandidate(candidates, `#${cssEscapeValue(el.id)}`, 'id')
      }

      ;[
        'data-record-target',
        'data-flowcap',
        'data-testid',
        'data-test',
        'data-cy',
        'aria-label',
        'name',
        'placeholder',
      ].forEach((attribute) => {
        const value = el.getAttribute(attribute)
        if (value) {
          pushCandidate(
            candidates,
            `${tag}[${attribute}="${cssEscapeValue(value)}"]`,
            attribute,
          )
        }
      })

      const classes = stableClasses(el)
      if (classes.length > 0) {
        pushCandidate(candidates, `${tag}.${classes.map(cssEscapeValue).join('.')}`, 'class')
        pushCandidate(candidates, `${tag}.${cssEscapeValue(classes[0])}`, 'class')
      }

      let parent = el.parentElement
      while (parent && parent !== document.body) {
        const local = simpleSelector(el)
        const parentClasses = stableClasses(parent)
        if (parent.id) {
          pushCandidate(candidates, `#${cssEscapeValue(parent.id)} ${local}`, 'parent-id')
        }
        const parentRecord = parent.getAttribute('data-record-target')
        if (parentRecord) {
          pushCandidate(
            candidates,
            `[data-record-target="${cssEscapeValue(parentRecord)}"] ${local}`,
            'parent-record',
          )
        }
        const parentTestId = parent.getAttribute('data-testid')
        if (parentTestId) {
          pushCandidate(
            candidates,
            `[data-testid="${cssEscapeValue(parentTestId)}"] ${local}`,
            'parent-testid',
          )
        }
        if (parentClasses.length > 0) {
          pushCandidate(
            candidates,
            `${parent.tagName.toLowerCase()}.${cssEscapeValue(parentClasses[0])} > ${local}`,
            'parent-class',
          )
        }
        parent = parent.parentElement
      }

      pushCandidate(candidates, fullPathSelector(el), 'path')

      const uniqueCandidates = candidates.filter((candidate) => unique(candidate.selector))
      const preferred = uniqueCandidates[0] || candidates[candidates.length - 1]

      return {
        selector: preferred.selector,
        selectorSource: preferred.source,
        selectors: uniqueCandidates.slice(0, 5),
      }
    }

    function findActionNode(node) {
      const tag = node.tagName.toLowerCase()
      const inputType = (node.getAttribute('type') || '').toLowerCase()

      if (tag === 'input' && ['radio', 'checkbox'].includes(inputType)) {
        const byFor =
          node.id && document.querySelector(`label[for="${cssEscapeValue(node.id)}"]`)
        const wrappingLabel = node.closest('label')
        if (byFor && isVisible(byFor)) return byFor
        if (wrappingLabel && isVisible(wrappingLabel)) return wrappingLabel
      }

      return node
    }

    function inferAction(node) {
      const tag = node.tagName.toLowerCase()
      const inputType = (node.getAttribute('type') || '').toLowerCase()

      if (tag === 'textarea') return 'type'
      if (tag === 'select') return 'click'
      if (
        tag === 'input' &&
        ['text', 'email', 'search', 'password', 'url', 'tel', 'number'].includes(
          inputType || 'text',
        )
      ) {
        return 'type'
      }
      return 'click'
    }

    function describe(node) {
      const text = normalizeText(node.textContent)
      const aria = normalizeText(node.getAttribute('aria-label'))
      const placeholder = normalizeText(node.getAttribute('placeholder'))
      const name = normalizeText(node.getAttribute('name'))
      const id = normalizeText(node.id)
      const fieldLabel = normalizeText(node.closest('label')?.textContent)

      return (
        aria ||
        placeholder ||
        fieldLabel ||
        text ||
        name ||
        id ||
        node.tagName.toLowerCase()
      )
    }

    function isNavigationLike(node) {
      return Boolean(
        node.closest('[role="tablist"], nav, .tabs, .tab, .segmented-tabs, .segmented-tab'),
      )
    }

    function scoreTarget(target) {
      let score = 0

      if (target.action === 'type') score += 25
      if (target.action === 'click') score += 10
      if (/create a folder|create folder|new|add|open|start/i.test(target.label)) score += 90
      if (/folder name|project name|name|title/i.test(target.label)) score += 60
      if (/shared with team/i.test(target.label)) score += 55
      if (/select a team|choose team/i.test(target.label)) score += 50
      if (
        /team|members/i.test(target.label) &&
        !/shared with team|select a team/i.test(target.label)
      ) {
        score += 45
      }
      if (/save|submit|change|done/i.test(target.label)) score += 40
      if (/private/i.test(target.label)) score -= 10
      if (/cancel|close|back|remove/i.test(target.label)) score -= 30
      if (target.isNavigation) score -= 60

      return score
    }

    const targets = []
    const seenSelectors = new Set()

    document.querySelectorAll(interactiveSelector).forEach((node) => {
      if (!(node instanceof Element)) return

      const action = inferAction(node)
      const actionNode = findActionNode(node)
      if (!actionNode || !isVisible(actionNode)) return

      const selectorData = buildSelectorData(actionNode)
      if (!selectorData.selector || seenSelectors.has(selectorData.selector)) return
      seenSelectors.add(selectorData.selector)

      const target = {
        action,
        selector: selectorData.selector,
        selectorSource: selectorData.selectorSource,
        selectors: selectorData.selectors,
        label: describe(actionNode),
        tag: actionNode.tagName.toLowerCase(),
        isNavigation: isNavigationLike(actionNode),
        phase: currentPhase,
      }

      target.score = scoreTarget(target)
      targets.push(target)
    })

    return targets
  }, phase)
}

async function analyzeUrl(url, chromium) {
  const browser = await chromium.launch({ headless: true })

  try {
    const context = await browser.newContext({
      viewport: { width: 1280, height: 800 },
    })
    const page = await context.newPage()
    await page.goto(url, { waitUntil: 'load', timeout: 15000 })
    await page.waitForTimeout(700)

    const steps = []
    const usedSelectors = new Set()
    let allTargets = await scanTargets(page, 'initial')
    let currentTargets = allTargets

    const initialPrimary = pickBestTarget(
      allTargets,
      (target) =>
        target.action === 'click' &&
        !target.isNavigation &&
        /create|new|add|open|start/i.test(target.label) &&
        !/cancel|close|back|remove/i.test(target.label),
      usedSelectors,
    )

    if (initialPrimary) {
      pushStep(steps, {
        action: 'click',
        selector: initialPrimary.selector,
        targetLabel: initialPrimary.label,
      })
      usedSelectors.add(initialPrimary.selector)

      const didClick = await safeClick(page, initialPrimary.selector)
      if (didClick) {
        await page.waitForTimeout(500)
        currentTargets = await scanTargets(page, 'after-primary')
        allTargets = mergeTargets(allTargets, currentTargets)
      }
    }

    const firstField = pickBestTarget(
      currentTargets,
      (target) => target.action === 'type',
      usedSelectors,
    )

    if (firstField) {
      pushStep(steps, {
        action: 'wait_for',
        selector: firstField.selector,
        state: 'visible',
        timeout: 5000,
        targetLabel: firstField.label,
      })
      pushStep(steps, {
        action: 'type',
        selector: firstField.selector,
        text: suggestTextForTarget(firstField),
        delay: 0,
        targetLabel: firstField.label,
      })
      pushStep(steps, { action: 'wait', ms: 350 })
      usedSelectors.add(firstField.selector)
    }

    const sharedToggle = pickBestTarget(
      currentTargets,
      (target) => target.action === 'click' && /shared with team/i.test(target.label),
      usedSelectors,
    )

    if (sharedToggle) {
      pushStep(steps, {
        action: 'click',
        selector: sharedToggle.selector,
        targetLabel: sharedToggle.label,
      })
      usedSelectors.add(sharedToggle.selector)

      const didClick = await safeClick(page, sharedToggle.selector)
      if (didClick) {
        await page.waitForTimeout(500)
        currentTargets = await scanTargets(page, 'after-shared')
        allTargets = mergeTargets(allTargets, currentTargets)
      }
    }

    const teamPicker = pickBestTarget(
      currentTargets,
      (target) =>
        target.action === 'click' && /select a team|choose team/i.test(target.label),
      usedSelectors,
    )

    if (teamPicker) {
      pushStep(steps, {
        action: 'wait_for',
        selector: teamPicker.selector,
        state: 'visible',
        timeout: 5000,
        targetLabel: teamPicker.label,
      })
      pushStep(steps, {
        action: 'click',
        selector: teamPicker.selector,
        targetLabel: teamPicker.label,
      })
      usedSelectors.add(teamPicker.selector)

      const didClick = await safeClick(page, teamPicker.selector)
      if (didClick) {
        await page.waitForTimeout(500)
        currentTargets = await scanTargets(page, 'after-team-picker')
        allTargets = mergeTargets(allTargets, currentTargets)
      }
    }

    const teamChoice = pickBestTarget(
      currentTargets,
      (target) =>
        target.action === 'click' &&
        /team|members/i.test(target.label) &&
        !/shared with team|select a team|private|cancel|close|remove/i.test(target.label),
      usedSelectors,
    )

    if (teamChoice) {
      pushStep(steps, {
        action: 'wait_for',
        selector: teamChoice.selector,
        state: 'visible',
        timeout: 5000,
        targetLabel: teamChoice.label,
      })
      pushStep(steps, {
        action: 'hover',
        selector: teamChoice.selector,
        targetLabel: teamChoice.label,
      })
      pushStep(steps, { action: 'wait', ms: 250 })
      pushStep(steps, {
        action: 'click',
        selector: teamChoice.selector,
        targetLabel: teamChoice.label,
      })
      usedSelectors.add(teamChoice.selector)

      const didClick = await safeClick(page, teamChoice.selector)
      if (didClick) {
        await page.waitForTimeout(500)
        currentTargets = await scanTargets(page, 'after-team-choice')
        allTargets = mergeTargets(allTargets, currentTargets)
      }
    }

    const submitTarget = pickBestTarget(
      currentTargets,
      (target) =>
        target.action === 'click' &&
        /create folder|change|save|submit|done/i.test(target.label) &&
        !/cancel|close|back|remove/i.test(target.label),
      usedSelectors,
    )

    if (submitTarget) {
      pushStep(steps, {
        action: 'wait_for',
        selector: submitTarget.selector,
        state: 'visible',
        timeout: 5000,
        targetLabel: submitTarget.label,
      })
      pushStep(steps, {
        action: 'hover',
        selector: submitTarget.selector,
        targetLabel: submitTarget.label,
      })
      pushStep(steps, { action: 'wait', ms: 180 })
      pushStep(steps, {
        action: 'click',
        selector: submitTarget.selector,
        targetLabel: submitTarget.label,
      })
      usedSelectors.add(submitTarget.selector)

      const didClick = await safeClick(page, submitTarget.selector)
      if (didClick) {
        await page.waitForTimeout(500)
        currentTargets = await scanTargets(page, 'after-submit')
        allTargets = mergeTargets(allTargets, currentTargets)
      }
    }

    const resultTarget = pickBestTarget(
      currentTargets,
      (target) =>
        target.action === 'click' &&
        !target.isNavigation &&
        !/shared with team|select a team|private|cancel|close|remove|create folder|change|save|submit/i.test(
          target.label,
        ),
      usedSelectors,
    )

    if (resultTarget) {
      pushStep(steps, {
        action: 'wait_for',
        selector: resultTarget.selector,
        state: 'visible',
        timeout: 5000,
        targetLabel: resultTarget.label,
      })
    }

    if (steps.length === 0) {
      const fallbackTargets = [...allTargets]
        .filter((target) => target.score > -10)
        .sort((a, b) => b.score - a.score)
        .slice(0, 5)

      fallbackTargets.forEach((target, index) => {
        pushStep(
          steps,
          target.action === 'type'
            ? {
                action: 'type',
                selector: target.selector,
                text: suggestTextForTarget(target),
                delay: 0,
                targetLabel: target.label,
              }
            : {
                action: 'click',
                selector: target.selector,
                targetLabel: target.label,
              },
        )
        if (index < fallbackTargets.length - 1) {
          pushStep(steps, { action: 'wait', ms: 500 })
        }
      })
    } else {
      pushStep(steps, { action: 'wait', ms: 900 })
    }

    return { success: true, steps, targets: allTargets }
  } catch (err) {
    return { success: false, error: err.message, steps: [], targets: [] }
  } finally {
    await browser.close()
  }
}

module.exports = {
  analyzeUrl,
}
