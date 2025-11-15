import { createRouter, createWebHistory } from "vue-router";

const routes = [
  {
    path: "/",
    name: "Layout",
    component: () => import("@/layout/index.vue"),
    children: [
      {
        path: "/message",
        name: "Message",
        meta: {
          keepAlive: true
        },
        component: () => import("@/views/message/index.vue")
      },

      {
        path: "/contact",
        name: "Contact",
        meta: {
          keepAlive: true
        },
        component: () => import("@/views/contact/index.vue")
      }
    ]
  },
  {
    path: "/login",
    name: "Login",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/login/index.vue")
  },
  {
    path: "/notify",
    name: "Notify",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/notify/index.vue")
  },
  {
    path: "/screen",
    name: "Screen",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/screen/index.vue")
  },
  {
    path: "/record",
    name: "Record",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/record/index.vue")
  },
  {
    path: "/preview/media",
    name: "PreviewMedia",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/preview/media.vue")
  },
  {
    path: "/preview/file",
    name: "PreviewFile",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/preview/file.vue")
  },
  {
    path: "/singlecall",
    name: "SingleCall",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/call/single.vue")
  },
  {
    path: "/groupcall",
    name: "GroupCall",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/call/group.vue")
  },
  {
    path: "/accept",
    name: "Accept",
    meta: {
      keepAlive: true
    },
    component: () => import("@/views/call/accept.vue")
  }

  // {
  //     path: '/videoAccept',
  //     name: 'VideoAccept',
  //     meta: {
  //         keepAlive: true,
  //     },
  //     component: () => import('@/views/video/videoAccept.vue'),
  // },
];

const router = createRouter({
  history: createWebHistory(),
  routes
});

// router.beforeEach(async (to, from, next) => {
//   const mainWindow = Window.getByLabel('main')
//   const loginWindow = Window.getByLabel('login')

//   if (!storage.get('token')) {
//     mainWindow?.close();
//     loginWindow?.show();
//   } else {
//     if (!mainWindow) {
//       //createMain();
//     }
//   }
//   if (to.path == '/') {
//     next({ path: '/message' })
//   } else {
//     next()
//   }
// })

export default router;
