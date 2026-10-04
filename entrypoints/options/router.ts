import { createRouter, createWebHashHistory } from 'vue-router'
import type { RouteRecordRaw } from 'vue-router'

export const routes: RouteRecordRaw[] = [
  {
    path: '/',
    name: 'Home',
    component: () => import('./pages/home.vue'),
  },
]

export const router = createRouter({
  history: createWebHashHistory(),
  routes,
})
