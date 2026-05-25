import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import LanguageDetector from "i18next-browser-languagedetector";

import ukCommon from "./locales/uk/common.json";
import ukDriver from "./locales/uk/driver.json";
import ukAdmin from "./locales/uk/admin.json";
import plCommon from "./locales/pl/common.json";
import plDriver from "./locales/pl/driver.json";
import plAdmin from "./locales/pl/admin.json";

export const languages = ["uk", "pl"] as const;
export type Language = (typeof languages)[number];

const resources = {
  uk: {
    common: ukCommon,
    driver: ukDriver,
    admin: ukAdmin,
  },
  pl: {
    common: plCommon,
    driver: plDriver,
    admin: plAdmin,
  },
};

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources,
    lng: "uk",
    fallbackLng: "uk",
    detection: {
      order: ["localStorage"],
      lookupLocalStorage: "vanlink_lang",
      caches: ["localStorage"],
    },
    defaultNS: "common",
    ns: ["common", "driver", "admin"],
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
