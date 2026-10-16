/**
 * Wxt config
 * @see {@link https://wxt.dev/api/config.html}
 */

import { createRequire } from 'node:module'
import { dirname, join } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import vueComponents from 'unplugin-vue-components/vite'
import { defineConfig } from 'wxt'
import { resolve } from './scripts/utils'

const require = createRequire(import.meta.url)

export default defineConfig({
  manifestVersion: 3,
  outDir: 'dist',
  autoIcons: {
    baseIconPath: 'assets/images/icon.png',
    developmentIndicator: false,
  },

  hooks: {
    'build:publicAssets': function (_wxt, files) {
      const core = join(dirname(require.resolve('@ffmpeg/core')), '../esm')
      const wrapper = join(dirname(require.resolve('@ffmpeg/ffmpeg')), '../esm')
      for (const name of ['ffmpeg-core.js', 'ffmpeg-core.wasm']) {
        files.push({
          absoluteSrc: join(core, name),
          relativeDest: `ffmpeg/${name}`,
        })
      }
      for (const name of ['worker.js', 'const.js', 'errors.js']) {
        files.push({
          absoluteSrc: join(wrapper, name),
          relativeDest: `ffmpeg/${name}`,
        })
      }
    },
    'prepare:publicPaths': function (_wxt, paths) {
      paths.push(
        '/ffmpeg/worker.js',
        '/ffmpeg/ffmpeg-core.js',
        '/ffmpeg/ffmpeg-core.wasm',
      )
    },
  },

  imports: {
    addons: {
      vueTemplate: true,
    },
    presets: [
      'vue',
      'pinia',
      'vue-router',
      {
        package: '@vueuse/core',
        ignore: [
          // exported from `vue`
          'toRef',
          'toRefs',
          'toValue',
          // exported from `wxt/storage`
          'useStorage',
        ],
      },
    ],
  },

  manifest: {
    default_locale: 'en',
    description: '__MSG_extensionDescription__',
    homepage_url: 'https://github.com/ntnyq/bilibili-downloader',
    minimum_chrome_version: '120',
    name: '__MSG_extensionName__',
    optional_permissions: ['notifications', 'nativeMessaging'],
    browser_specific_settings: {
      gecko: {
        data_collection_permissions: { required: ['none'] },
        id: 'bilibili-downloader@ntnyq',
        strict_min_version: '142.0',
      },
    },
    content_security_policy: {
      extension_pages:
        "script-src 'self' 'wasm-unsafe-eval'; object-src 'self'",
    },
    host_permissions: [
      'https://www.bilibili.com/*',
      'https://api.bilibili.com/*',
      'https://comment.bilibili.com/*',
      'https://*.bilivideo.com/*',
      'https://*.bilivideo.cn/*',
      'https://*.bilivideo.net/*',
      'https://*.akamaized.net/*',
      'https://*.hdslb.com/*',
    ],
    permissions: [
      'storage',
      'activeTab',
      'tabs',
      'downloads',
      'declarativeNetRequestWithHostAccess',
    ],
    web_accessible_resources: [
      {
        matches: ['https://www.bilibili.com/*'],
        resources: ['icons/128.png'],
      },
    ],
  },

  modules: [
    '@wxt-dev/auto-icons',
    '@wxt-dev/i18n/module',
    '@wxt-dev/module-vue',
  ],

  vite() {
    return {
      css: {
        devSourcemap: true,
      },

      optimizeDeps: {
        // https://github.com/vitejs/vite/discussions/13306
        entries: ['**/entrypoints/**/*.html'],
      },

      plugins: [
        tailwindcss(),
        vueComponents({
          dirs: [resolve('components')],
          dts: 'types/components.d.ts',
          resolvers: [],
        }),
      ],
    }
  },
})
