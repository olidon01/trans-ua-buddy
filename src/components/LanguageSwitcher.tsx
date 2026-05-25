import { useTranslation } from "react-i18next";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
    localStorage.setItem("vanlink_lang", lng);
  };

  const isActive = (lng: string) => i18n.language === lng;

  return (
    <div className="flex items-center gap-2">
      <Button
        variant="ghost"
        size="sm"
        onClick={() => changeLanguage("uk")}
        aria-label="Українська"
        className={cn(
          "min-h-11 min-w-11 px-3 py-2 text-sm font-medium transition-colors",
          isActive("uk")
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        🇺🇦 UA
      </Button>
      <Button
        variant="ghost"
        size="sm"
        onClick={() => changeLanguage("pl")}
        aria-label="Polski"
        className={cn(
          "min-h-11 min-w-11 px-3 py-2 text-sm font-medium transition-colors",
          isActive("pl")
            ? "bg-primary text-primary-foreground hover:bg-primary/90"
            : "text-muted-foreground hover:bg-accent hover:text-accent-foreground"
        )}
      >
        🇵🇱 PL
      </Button>
    </div>
  );
}
