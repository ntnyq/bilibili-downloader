import '~/assets/tailwind.css'
import { createApp } from 'vue'
import { initializePageI18n } from '~/utils/i18n'
import App from './App.vue'

await initializePageI18n('pages.downloadsTitle')

createApp(App).mount('#app')
