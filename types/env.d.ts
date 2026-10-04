/// <reference types="vite/client" />
/// <reference types="unplugin-vue-router/client" />

interface ImportMeta {
  env: ImportMetaEnv
}

interface ImportMetaEnv {
  readonly VITE_APP_TITLE: string
}
