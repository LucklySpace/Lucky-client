import { createRouter, createWebHistory, type RouteRecordRaw } from "vue-router";
import { storage } from "@/utils/Storage";

/**
 * 扩展路由记录类型
 */
declare module "vue-router" {
  interface RouteMeta {
    requiresAuth?: boolean;
    title?: string;
    keepAlive?: boolean;
    icon?: string;
  }
}

/**
 * 路由配置
 */
const routes: RouteRecordRaw[] = [
  {
    path: "/",
    name: "Layout",
    component: () => import("@/layout/index.vue"),
    meta: {
      requiresAuth: true
    },
    children: [
      {
        path: "/message",
        name: "Message",
        meta: {
          requiresAuth: true,
          title: "消息",
          keepAlive: true,
          icon: "message"
        },
        component: () => import("@/views/message/index.vue")
      },
      {
        path: "/contact",
        name: "Contact",
        meta: {
          requiresAuth: true,
          title: "联系人",
          keepAlive: true,
          icon: "contact"
        },
        component: () => import("@/views/contact/index.vue")
      }
    ]
  },
  {
    path: "/login",
    name: "Login",
    meta: {
      requiresAuth: false,
      title: "登录",
      keepAlive: true
    },
    component: () => import("@/views/login/index.vue")
  },
  {
    path: "/notify",
    name: "Notify",
    meta: {
      requiresAuth: true,
      title: "通知",
      keepAlive: true
    },
    component: () => import("@/views/notify/index.vue")
  },
  {
    path: "/screen",
    name: "Screen",
    meta: {
      requiresAuth: true,
      title: "截图",
      keepAlive: true
    },
    component: () => import("@/views/screen/index.vue")
  },
  {
    path: "/record",
    name: "Record",
    meta: {
      requiresAuth: true,
      title: "录音",
      keepAlive: true
    },
    component: () => import("@/views/record/index.vue")
  },
  {
    path: "/preview/media",
    name: "PreviewMedia",
    meta: {
      requiresAuth: true,
      title: "媒体预览",
      keepAlive: true
    },
    component: () => import("@/views/preview/media.vue")
  },
  {
    path: "/preview/file",
    name: "PreviewFile",
    meta: {
      requiresAuth: true,
      title: "文件预览",
      keepAlive: true
    },
    component: () => import("@/views/preview/file.vue")
  },
  {
    path: "/singlecall",
    name: "SingleCall",
    meta: {
      requiresAuth: true,
      title: "单人通话",
      keepAlive: true
    },
    component: () => import("@/views/call/single.vue")
  },
  {
    path: "/groupcall",
    name: "GroupCall",
    meta: {
      requiresAuth: true,
      title: "群组通话",
      keepAlive: true
    },
    component: () => import("@/views/call/group.vue")
  },
  {
    path: "/accept",
    name: "Accept",
    meta: {
      requiresAuth: true,
      title: "接听通话",
      keepAlive: true
    },
    component: () => import("@/views/call/accept.vue")
  },
  {
    path: "/:pathMatch(.*)*",
    name: "NotFound",
    redirect: "/login"
  }
];

/**
 * 创建路由实例
 */
const router = createRouter({
  history: createWebHistory(),
  routes
});

export default router;
