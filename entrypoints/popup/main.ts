import '~/assets/tailwind.css'
import { initializePageI18n } from '~/utils/i18n'
import App from './App.vue'

await initializePageI18n('extensionName')

const app = createApp(App)

app.mount('#app')
