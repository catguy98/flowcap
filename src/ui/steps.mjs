export function createStepRenderer({ elements, state, appendLog }) {
  function renderSelectorCatalog() {
    const { selectorCatalogEl } = elements
    selectorCatalogEl.innerHTML = ''

    if (state.detectedTargets.length === 0) {
      selectorCatalogEl.className = 'selector-catalog-empty'
      selectorCatalogEl.textContent =
        'No detectable interactive targets found on the current page.'
      return
    }

    selectorCatalogEl.className = ''

    state.detectedTargets.forEach((target) => {
      let selectedSelector = target.selector

      const card = document.createElement('div')
      card.className = 'selector-card'

      const main = document.createElement('div')
      main.className = 'selector-card-main'

      const title = document.createElement('div')
      title.className = 'selector-card-title'

      const label = document.createElement('div')
      label.className = 'selector-card-label'
      label.textContent = target.label || 'Unnamed target'

      const kind = document.createElement('span')
      kind.className = 'selector-card-kind'
      kind.textContent = target.action

      title.appendChild(label)
      title.appendChild(kind)

      const meta = document.createElement('div')
      meta.className = 'selector-card-meta'
      meta.textContent = [
        target.tag,
        target.phase ? `state: ${target.phase}` : '',
        target.selectorSource ? `selector: ${target.selectorSource}` : '',
        target.isNavigation ? 'navigation' : '',
      ]
        .filter(Boolean)
        .join(' • ')

      const code = document.createElement('code')
      code.className = 'selector-card-code'
      code.textContent = selectedSelector

      main.appendChild(title)
      main.appendChild(meta)

      if (Array.isArray(target.selectors) && target.selectors.length > 1) {
        const selectorSelect = document.createElement('select')
        selectorSelect.className = 'selector-picker'

        target.selectors.forEach((candidate) => {
          const option = document.createElement('option')
          option.value = candidate.selector
          option.textContent = `${candidate.source}: ${candidate.selector}`
          if (candidate.selector === selectedSelector) option.selected = true
          selectorSelect.appendChild(option)
        })

        selectorSelect.onchange = (event) => {
          selectedSelector = event.target.value
          code.textContent = selectedSelector
        }

        main.appendChild(selectorSelect)
      }

      main.appendChild(code)

      const actions = document.createElement('div')
      actions.className = 'selector-card-actions'

      const addBtn = document.createElement('button')
      addBtn.className = 'selector-chip-btn'
      addBtn.textContent = target.action === 'type' ? '+ Type' : '+ Click'
      addBtn.onclick = () => {
        state.currentSteps.push(
          target.action === 'type'
            ? {
                action: 'type',
                selector: selectedSelector,
                text: '',
                delay: 0,
                targetLabel: target.label,
              }
            : {
                action: 'click',
                selector: selectedSelector,
                targetLabel: target.label,
              },
        )
        renderSteps()
      }

      const copyBtn = document.createElement('button')
      copyBtn.className = 'selector-chip-btn'
      copyBtn.textContent = 'Copy'
      copyBtn.onclick = async () => {
        await navigator.clipboard.writeText(selectedSelector)
        appendLog(`Copied selector: ${selectedSelector}`)
      }

      if (target.action === 'click') {
        const hoverBtn = document.createElement('button')
        hoverBtn.className = 'selector-chip-btn'
        hoverBtn.textContent = '+ Hover'
        hoverBtn.onclick = () => {
          state.currentSteps.push({
            action: 'hover',
            selector: selectedSelector,
            targetLabel: target.label,
          })
          renderSteps()
        }
        actions.appendChild(hoverBtn)
      }

      actions.appendChild(addBtn)
      actions.appendChild(copyBtn)

      card.appendChild(main)
      card.appendChild(actions)
      selectorCatalogEl.appendChild(card)
    })
  }

  function createSelectorControls({ step, index, placeholder }) {
    const wrapper = document.createElement('div')
    wrapper.className = 'step-params'

    const row = document.createElement('div')
    row.className = 'step-param-row'

    const input = document.createElement('input')
    input.type = 'text'
    input.placeholder = placeholder
    input.value = step.selector || ''
    input.onchange = (event) => {
      state.currentSteps[index].selector = event.target.value
      renderSteps()
    }

    row.appendChild(input)

    const relevantTargets = state.detectedTargets.filter((target) => {
      if (
        step.action === 'hover' ||
        step.action === 'wait_for' ||
        step.action === 'content_zoom' ||
        step.action === 'zoom'
      ) {
        return target.action === 'click' || target.action === 'type'
      }
      return target.action === step.action
    })

    if (relevantTargets.length > 0) {
      const picker = document.createElement('select')
      picker.className = 'selector-picker'

      const defaultOption = document.createElement('option')
      defaultOption.value = ''
      defaultOption.textContent = 'Choose detected target'
      picker.appendChild(defaultOption)

      relevantTargets.forEach((target) => {
        const option = document.createElement('option')
        option.value = target.selector
        option.textContent = `${target.label} — ${target.selector}`
        if (target.selector === step.selector) option.selected = true
        picker.appendChild(option)
      })

      picker.onchange = (event) => {
        const selectedTarget = relevantTargets.find(
          (target) => target.selector === event.target.value,
        )
        state.currentSteps[index].selector = event.target.value
        state.currentSteps[index].targetLabel = selectedTarget?.label || ''
        renderSteps()
      }

      row.appendChild(picker)
    }

    wrapper.appendChild(row)

    if (step.targetLabel) {
      const hint = document.createElement('div')
      hint.className = 'step-selector-hint'
      hint.textContent = `Detected target: ${step.targetLabel}`
      wrapper.appendChild(hint)
    }

    return wrapper
  }

  function renderSteps() {
    const { stepsListEl } = elements
    stepsListEl.innerHTML = ''

    if (state.currentSteps.length === 0) {
      stepsListEl.innerHTML =
        '<div style="color: var(--text-muted); font-size: 13px; padding: 12px 0;">Enter a URL or browse a file to auto-generate steps, or add them manually.</div>'
      return
    }

    state.currentSteps.forEach((step, index) => {
      const el = document.createElement('div')
      el.className = 'step-item'

      const typeSelect = document.createElement('select')
      typeSelect.className = 'step-type'

      ;['wait', 'wait_for', 'click', 'hover', 'content_zoom', 'zoom_out', 'scroll', 'type', 'zoom'].forEach((opt) => {
        const option = document.createElement('option')
        option.value = opt
        option.text = opt
        if (opt === step.action || (opt === 'content_zoom' && step.action === 'zoom')) {
          option.selected = true
        }
        typeSelect.appendChild(option)
      })

      typeSelect.onchange = (event) => {
        state.currentSteps[index].action = event.target.value
        renderSteps()
      }

      const paramsDiv = document.createElement('div')
      paramsDiv.className = 'step-params'

      if (step.action === 'wait') {
        const row = document.createElement('div')
        row.className = 'step-param-row'
        const input = document.createElement('input')
        input.type = 'number'
        input.placeholder = 'Milliseconds (e.g. 1000)'
        input.value = step.ms || 1000
        input.onchange = (event) => {
          state.currentSteps[index].ms = event.target.value
        }
        row.appendChild(input)
        paramsDiv.appendChild(row)
      } else if (step.action === 'wait_for') {
        paramsDiv.appendChild(
          createSelectorControls({
            step,
            index,
            placeholder: 'Selector to wait for (e.g. [data-record-target="folder-name"])',
          }),
        )

        const row = document.createElement('div')
        row.className = 'step-param-row'
        const stateInput = document.createElement('select')
        ;['visible', 'hidden', 'attached', 'detached'].forEach((value) => {
          const option = document.createElement('option')
          option.value = value
          option.text = value
          if ((step.state || 'visible') === value) option.selected = true
          stateInput.appendChild(option)
        })
        stateInput.onchange = (event) => {
          state.currentSteps[index].state = event.target.value
        }

        const timeout = document.createElement('input')
        timeout.type = 'number'
        timeout.min = '0'
        timeout.placeholder = 'Timeout (ms)'
        timeout.value = step.timeout || 5000
        timeout.style.width = '120px'
        timeout.style.flexShrink = '0'
        timeout.onchange = (event) => {
          state.currentSteps[index].timeout = parseInt(event.target.value, 10) || 5000
        }

        row.appendChild(stateInput)
        row.appendChild(timeout)
        paramsDiv.appendChild(row)
      } else if (step.action === 'click' || step.action === 'hover') {
        paramsDiv.appendChild(
          createSelectorControls({
            step,
            index,
            placeholder:
              step.action === 'hover'
                ? 'CSS Selector to hover'
                : 'CSS Selector (e.g. button.primary-button)',
          }),
        )
      } else if (step.action === 'type') {
        paramsDiv.appendChild(
          createSelectorControls({
            step,
            index,
            placeholder: 'Selector (e.g. input[name="email"])',
          }),
        )

        const row = document.createElement('div')
        row.className = 'step-param-row'
        const text = document.createElement('input')
        text.type = 'text'
        text.placeholder = 'Text to type'
        text.value = step.text || ''
        text.onchange = (event) => {
          state.currentSteps[index].text = event.target.value
        }

        const delay = document.createElement('input')
        delay.type = 'number'
        delay.min = '0'
        delay.placeholder = 'ms/key'
        delay.title = 'Delay between keystrokes (ms). 0 = instant.'
        delay.value = step.delay || 0
        delay.style.width = '90px'
        delay.style.flexShrink = '0'
        delay.onchange = (event) => {
          state.currentSteps[index].delay = parseInt(event.target.value, 10) || 0
        }

        row.appendChild(text)
        row.appendChild(delay)
        paramsDiv.appendChild(row)
      } else if (step.action === 'content_zoom' || step.action === 'zoom') {
        paramsDiv.appendChild(
          createSelectorControls({
            step,
            index,
            placeholder: 'Optional selector to focus (e.g. [data-record-target="team-select"])',
          }),
        )

        const row = document.createElement('div')
        row.className = 'step-param-row'
        const percent = document.createElement('input')
        percent.type = 'number'
        percent.min = '0'
        percent.step = '1'
        percent.placeholder = 'Zoom % (e.g. 12)'
        percent.value =
          step.action === 'zoom'
            ? Math.max((Number.parseFloat(step.level) - 1) * 100, 0) || 12
            : step.percent || 12
        percent.onchange = (event) => {
          state.currentSteps[index].percent = parseInt(event.target.value, 10) || 0
          state.currentSteps[index].action = 'content_zoom'
          delete state.currentSteps[index].level
        }

        const duration = document.createElement('input')
        duration.type = 'number'
        duration.min = '0'
        duration.placeholder = 'Duration (ms)'
        duration.value = step.duration || 420
        duration.style.width = '120px'
        duration.style.flexShrink = '0'
        duration.onchange = (event) => {
          state.currentSteps[index].duration = parseInt(event.target.value, 10) || 420
          if (state.currentSteps[index].action === 'zoom') {
            state.currentSteps[index].action = 'content_zoom'
            delete state.currentSteps[index].level
          }
        }

        row.appendChild(percent)
        row.appendChild(duration)
        paramsDiv.appendChild(row)
      } else if (step.action === 'zoom_out') {
        const row = document.createElement('div')
        row.className = 'step-param-row'
        const duration = document.createElement('input')
        duration.type = 'number'
        duration.min = '0'
        duration.placeholder = 'Duration (ms)'
        duration.value = step.duration || 380
        duration.onchange = (event) => {
          state.currentSteps[index].duration = parseInt(event.target.value, 10) || 380
        }
        row.appendChild(duration)
        paramsDiv.appendChild(row)
      } else if (step.action === 'scroll') {
        const row = document.createElement('div')
        row.className = 'step-param-row'
        const input = document.createElement('input')
        input.type = 'number'
        input.placeholder = 'Y pixels (e.g. 400)'
        input.value = step.y || 400
        input.onchange = (event) => {
          state.currentSteps[index].y = event.target.value
        }
        row.appendChild(input)
        paramsDiv.appendChild(row)
      }

      const removeBtn = document.createElement('button')
      removeBtn.innerText = 'X'
      removeBtn.onclick = () => {
        state.currentSteps.splice(index, 1)
        renderSteps()
      }

      el.appendChild(typeSelect)
      el.appendChild(paramsDiv)
      el.appendChild(removeBtn)
      stepsListEl.appendChild(el)
    })
  }

  return { renderSelectorCatalog, renderSteps }
}
