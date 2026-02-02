import { createApp } from 'vue'
import AppLayout from './components/AppLayout.vue'
import router from './router'

import './assets/main.css'

const app = createApp(AppLayout)

app.use(router)

app.mount('#app')
