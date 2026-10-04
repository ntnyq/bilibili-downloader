import { defineAppConfig } from '#imports'

declare module '#imports' {
  export interface WxtAppConfig {
    readonly theme?: 'light' | 'dark'
    readonly appTitle: string
  }
}

export default defineAppConfig({
  appTitle: 'B 站下载器',
  theme: 'light',
})
