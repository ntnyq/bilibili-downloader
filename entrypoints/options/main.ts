import '~/assets/tailwind.css'
import pinia from '~/stores'
import { initializePageI18n } from '~/utils/i18n'
import App from './App.vue'
import { router } from './router'

await initializePageI18n('pages.optionsTitle')

const app = createApp(App)

app.use(router)
app.use(pinia)

app.mount('#app')
