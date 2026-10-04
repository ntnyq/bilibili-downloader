import { storage } from '#imports'
import type { RemovableRef } from '@vueuse/core'
import type { MaybeRefOrGetter } from 'vue'
import type { StorageItemKey } from '#imports'

export type StorageValue = string | number | boolean | object | null

export interface UseStorageOptions<T> {
  defaultValue?: MaybeRefOrGetter<T>
  sync?: boolean
  shallow?: boolean
}

export function useStorage(
  key: string,
  defaults: MaybeRefOrGetter<string>,
  options?: UseStorageOptions<string>,
): RemovableRef<string>
export function useStorage(
  key: string,
  defaults: MaybeRefOrGetter<number>,
  options?: UseStorageOptions<number>,
): RemovableRef<number>
export function useStorage(
  key: string,
  defaults: MaybeRefOrGetter<boolean>,
  options?: UseStorageOptions<boolean>,
): RemovableRef<boolean>
export function useStorage<T>(
  key: string,
  defaults: MaybeRefOrGetter<T>,
  options?: UseStorageOptions<T>,
): RemovableRef<T>
export function useStorage<T = unknown>(
  key: string,
  defaults: MaybeRefOrGetter<null>,
  options?: UseStorageOptions<T>,
): RemovableRef<T>

export function useStorage<T extends StorageValue>(
  key: string,
  defaults: MaybeRefOrGetter<T>,
  options: UseStorageOptions<T> = {},
): RemovableRef<any> {
  const { shallow } = options
  const syncKey: StorageItemKey = `local:${key}`
  const value = (shallow ? shallowRef : ref)(
    typeof defaults === 'function' ? defaults() : defaults,
  ) as RemovableRef<T>

  async function syncStorage() {
    const storageValue = await storage.getItem<T>(syncKey)
    if (storageValue !== null) {
      value.value = storageValue
    }
  }

  syncStorage()

  watch(value, async () => {
    await storage.setItem(syncKey, value.value)
  })

  return value
}

// export function useStorage<V extends JsonValue>(key: string): Ref<V | null>
// export function useStorage<V extends JsonValue>(key: string, defaultValue: V): Ref<V>
// export function useStorage<V extends JsonValue>(key: string, defaultValue?: V): Ref<V | null> {
//   const syncKey: StorageItemKey = `local:${key}`
//   const value = ref(defaultValue === undefined ? null : defaultValue) as Ref<V | null>

//   async function syncStorage() {
//     const storageValue = await storage.getItem<V>(syncKey)
//     if (storageValue !== null) {
//       value.value = storageValue
//     }
//   }

//   syncStorage()

//   watch(value, async () => {
//     await storage.setItem(syncKey, value.value)
//   })

//   return value
// }
