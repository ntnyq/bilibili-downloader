/**
 * Defers pointer clicks so a double click performs only the quick action.
 * Keyboard activation opens the panel immediately.
 *
 * @param actions - Actions invoked after resolving single-click versus
 * double-click intent.
 * @param actions.open - Toggles the panel immediately for keyboard activation
 * or after a 500 ms pointer delay.
 * @param actions.download - Starts the quick action when a second pointer
 * click is received.
 * @returns click(detail) and cancel() methods sharing one pending timer;
 * callers must cancel on disposal or navigation.
 * @remarks Exceptions thrown by actions propagate from click(), or from the
 *   timer callback for a delayed open.
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
