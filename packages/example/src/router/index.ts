import { createRouter, createWebHistory } from 'vue-router'
import MittDriverPage from '../pages/MittDriverPage.vue'
import PostMessageDriverPage from '../pages/PostMessageDriverPage.vue'

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
  ],
})

export default router
