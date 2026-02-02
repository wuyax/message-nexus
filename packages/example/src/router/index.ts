import { createRouter, createWebHistory } from 'vue-router'
import BroadcastDriverPage from '../pages/BroadcastDriverPage.vue'
import MittDriverPage from '../pages/MittDriverPage.vue'
import PostMessageDriverPage from '../pages/PostMessageDriverPage.vue'
import WebSocketDriverPage from '../pages/WebSocketDriverPage.vue'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      name: 'mitt-driver',
      component: MittDriverPage,
    },
    {
      path: '/postmessage',
      name: 'postmessage-driver',
      component: PostMessageDriverPage,
    },
    {
      path: '/broadcast',
      name: 'broadcast-driver',
      component: BroadcastDriverPage,
    },
    {
      path: '/websocket',
      name: 'websocket-driver',
      component: WebSocketDriverPage,
    },
  ],
})

export default router
