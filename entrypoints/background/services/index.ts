import { registerContextmenu } from '~/entrypoints/background/services/contextmenu'

export async function registerServices() {
  registerContextmenu()
  console.log('Services registered!')
}

export async function unregisterServices() {}
