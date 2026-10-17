/**
 * Defers pointer clicks so a double click performs only the quick action.
 * Keyboard activation opens the panel immediately.
 */
export function createDownloadClickHandler(actions: {
  open: () => void
  download: () => void
}) {
  let timer: ReturnType<typeof setTimeout> | undefined

  function cancel() {
    clearTimeout(timer)
    timer = undefined
  }

  function click(detail: number) {
    cancel()
    if (detail === 0) {
      actions.open()
    } else if (detail === 1) {
      timer = setTimeout(actions.open, 500)
    } else if (detail === 2) {
      actions.download()
    }
  }

  return {
    click,
    cancel,
  }
}
