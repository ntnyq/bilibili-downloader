import '~/assets/tailwind.css'
import { initializePageI18n } from '~/utils/i18n'
import App from './App.vue'
import { router } from './router'

await initializePageI18n('pages.optionsTitle')

const app = createApp(App)

app.use(router)

app.mount('#app')
