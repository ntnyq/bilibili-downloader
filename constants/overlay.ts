import type { InjectionKey, Ref } from 'vue'

/**
 * Identifies the owning surface container for portalled controls and dialogs.
 */
export const OVERLAY_TARGET_KEY: InjectionKey<
  Readonly<Ref<HTMLElement | null>>
> = Symbol('overlayTarget')
