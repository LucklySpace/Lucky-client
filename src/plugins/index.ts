import { App } from "vue";

export default {
  install: (app: App) => {
    const files: any = import.meta.glob("./modules/*.ts", { eager: true });
    for (const key in files) {
      if (Object.prototype.hasOwnProperty.call(files, key)) {
        app.use(files[key].default);
      }
    }
  }
};
