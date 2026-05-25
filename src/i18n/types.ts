import type { resources } from "./index";

type Resources = typeof resources;

declare module "react-i18next" {
  interface CustomTypeOptions {
    resources: Resources;
  }
}
