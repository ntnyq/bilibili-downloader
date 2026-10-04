/**
 * @file Counter store
 */

import pinia from '~/stores'

export const useCounterStore = defineStore('counter', () => {
  const count = ref(0)

  function increase() {
    count.value++
  }

  function decrease() {
    count.value--
  }

  return {
    count,

    increase,
    decrease,
  }
})

export const useCounterStoreWithout = () => useCounterStore(pinia)
