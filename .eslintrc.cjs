module.exports = {
  root: true,
  env: {
    browser: true,
    es2021: true,
    node: true,
  },
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "plugin:vue/vue3-recommended",
    "prettier",
  ],
  parser: "vue-eslint-parser",
  parserOptions: {
    ecmaVersion: "latest",
    parser: "@typescript-eslint/parser",
    sourceType: "module",
  },
  plugins: ["@typescript-eslint", "vue"],
  rules: {
    // TypeScript 规则
    "@typescript-eslint/no-explicit-any": "warn",
    "@typescript-eslint/no-unused-vars": [
      "error",
      {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^_",
      },
    ],
    "@typescript-eslint/explicit-function-return-type": "off",
    "@typescript-eslint/explicit-module-boundary-types": "off",
    "@typescript-eslint/no-non-null-assertion": "warn",
    "@typescript-eslint/consistent-type-imports": [
      "error",
      {
        prefer: "type-imports",
        disallowTypeAnnotations: false,
      },
    ],

    // Vue 规则
    "vue/multi-word-component-names": "off",
    "vue/no-v-html": "warn",
    "vue/require-default-prop": "off",
    "vue/require-explicit-emits": "error",
    "vue/component-name-in-template-casing": [
      "error",
      "PascalCase",
      {
        registeredComponentsOnly: true,
        ignores: [],
      },
    ],
    "vue/component-definition-name-casing": ["error", "PascalCase"],
    "vue/prop-name-casing": ["error", "camelCase"],
    "vue/attribute-hyphenation": ["error", "never"],
    "vue/v-on-event-hyphenation": ["error", "never"],

    // 通用规则
    "no-console": ["warn", { allow: ["warn", "error"] }],
    "no-debugger": "warn",
    "no-unused-vars": "off", // 使用 TypeScript 版本
    "prefer-const": "error",
    "no-var": "error",
    "eqeqeq": ["error", "always"],
    "curly": ["error", "all"],
    "brace-style": ["error", "1tbs"],
    "semi": ["error", "always"],
    "quotes": ["error", "double", { avoidEscape: true }],
    "comma-dangle": ["error", {
      "arrays": "always-multiline",
      "objects": "always-multiline",
      "imports": "always-multiline",
      "exports": "always-multiline",
      "functions": "never",
    }],
  },
  globals: {
    // Node.js 和 Tauri 全局变量
    __TAURI__: "readonly",
    __TAURI_IPC__: "readonly",
    // 自动导入的函数（由 unplugin-auto-import）
    ref: "readonly",
    computed: "readonly",
    reactive: "readonly",
    watch: "readonly",
    watchEffect: "readonly",
    onMounted: "readonly",
    onUnmounted: "readonly",
    nextTick: "readonly",
    defineComponent: "readonly",
    defineStore: "readonly",
    useRouter: "readonly",
    useRoute: "readonly",
  },
};
