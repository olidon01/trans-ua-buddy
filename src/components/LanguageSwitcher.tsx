import { useLanguage } from "@/contexts/LanguageContext";

export function LanguageSwitcher() {
  const { lang, setLang } = useLanguage();
  return (
    <div className="flex items-center gap-2">
      {(["uk", "pl"] as const).map((l) => (
        <button
          key={l}
          type="button"
          onClick={() => setLang(l)}
          className={`min-w-[44px] min-h-[44px] px-3 rounded-lg text-sm font-medium transition-colors ${
            lang === l
              ? "bg-primary text-primary-foreground"
              : "bg-secondary text-secondary-foreground hover:bg-secondary/80"
          }`}
        >
          {l === "uk" ? "🇺🇦 UA" : "🇵🇱 PL"}
        </button>
      ))}
    </div>
  );
}