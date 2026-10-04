import { inject, provide } from 'vue'
import { OVERLAY_TARGET_KEY } from '~/constants/overlay'
import type { Ref } from 'vue'

/**
 * Keeps portalled controls inside the extension's theme and Shadow DOM,
 * outside scrolling or transformed panel content.
 */
export function provideOverlayTarget(
  target: Readonly<Ref<HTMLElement | null>>,
) {
  provide(OVERLAY_TARGET_KEY, target)
}

/**
 * Resolves the owning surface's portal container, when one is provided.
 */
export function useOverlayTarget() {
  return inject(OVERLAY_TARGET_KEY, undefined)
}
