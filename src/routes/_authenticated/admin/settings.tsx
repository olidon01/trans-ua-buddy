import { createFileRoute, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ArrowLeft, AlertTriangle } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/settings")({
  component: AdminSettingsPage,
});

function AdminSettingsPage() {
  const { user, roles, loading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const [prefs, setPrefs] = useState({
    email_notifications: true,
    telegram_notifications: true,
    telegram_username: "",
  });
  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [loaded, setLoaded] = useState(false);
  const [fieldError, setFieldError] = useState("");
  const tgBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "vanlink_notify_bot";

  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_notifications, telegram_notifications, telegram_username, telegram_chat_id")
        .eq("id", user.id)
        .maybeSingle();
      const next = {
        email_notifications: data?.email_notifications ?? true,
        telegram_notifications: data?.telegram_notifications ?? true,
        telegram_username: data?.telegram_username ?? "",
      };
      setPrefs(next);
      setTelegramConnected(!!data?.telegram_chat_id);
      setLoaded(true);
      // Ensure defaults are persisted for new admin profiles
      if (data && (data.email_notifications === null || data.telegram_notifications === null)) {
        await supabase
          .from("profiles")
          .update({
            email_notifications: next.email_notifications,
            telegram_notifications: next.telegram_notifications,
          })
          .eq("id", user.id);
      }
    })();
  }, [user?.id]);

  async function savePrefs(updated: typeof prefs) {
    if (!user) return;
    const cleanUsername = updated.telegram_username.trim().replace(/^@/, "").slice(0, 64);
    await supabase
      .from("profiles")
      .update({
        email_notifications: updated.email_notifications,
        telegram_notifications: updated.telegram_notifications,
        telegram_username: cleanUsername || null,
      })
      .eq("id", user.id);
  }

  function validateTelegram(value: string): string {
    if (!prefs.telegram_notifications) return "";
    if (!value.trim()) return "";
    if (!/^@?[a-zA-Z0-9_]{4,31}$/.test(value.trim())) return t.validTelegram;
    return "";
  }

  if (loading || !loaded) return <div className="p-6 text-muted-foreground">{t.loading}</div>;
  if (!isStaff(roles)) return <Navigate to="/driver" />;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6">
      <button
        type="button"
        onClick={() => navigate({ to: "/admin" })}
        className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> {t.back}
      </button>
      <h1 className="text-2xl font-bold tracking-tight mb-6">Налаштування адміністратора</h1>

      <div className="space-y-3 rounded-lg border border-border p-4 bg-secondary/30">
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-normal">{t.notifyEmail}</Label>
          <Switch
            checked={prefs.email_notifications}
            onCheckedChange={(v) => {
              const updated = { ...prefs, email_notifications: v };
              setPrefs(updated);
              void savePrefs(updated);
            }}
          />
        </div>
        <div className="flex items-center justify-between gap-3">
          <Label className="text-sm font-normal">{t.notifyTelegram}</Label>
          <Switch
            checked={prefs.telegram_notifications}
            onCheckedChange={(v) => {
              const updated = { ...prefs, telegram_notifications: v };
              setPrefs(updated);
              void savePrefs(updated);
            }}
          />
        </div>
        {prefs.telegram_notifications && (
          <div className="space-y-1.5">
            <Label className="text-sm">{t.telegramUsername}</Label>
            <Input
              placeholder={t.telegramUsername}
              value={prefs.telegram_username}
              onChange={(e) => {
                setPrefs((p) => ({ ...p, telegram_username: e.target.value }));
                if (fieldError) setFieldError("");
              }}
              onBlur={(e) => {
                const val = e.target.value;
                setFieldError(validateTelegram(val));
                void savePrefs({ ...prefs, telegram_username: val });
              }}
              className={fieldError ? "border-destructive" : ""}
            />
            {fieldError && <p className="text-xs text-destructive">{fieldError}</p>}
            <p className="text-xs text-muted-foreground">
              {tgBotUsername ? (
                <>
                  {t.tgHintOpen}{" "}
                  <a
                    href={`https://t.me/${tgBotUsername}`}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary underline font-medium"
                  >
                    {t.tgHintOpenBot}
                  </a>{" "}
                  {t.tgHintStart}
                </>
              ) : (
                t.telegramHint
              )}
            </p>
            {prefs.telegram_notifications &&
              prefs.telegram_username.trim() !== "" &&
              telegramConnected === false && (
                <div className="flex items-start gap-2 rounded-lg border border-orange-400/40 bg-orange-400/10 p-2.5 text-xs">
                  <AlertTriangle className="size-3.5 mt-0.5 shrink-0 text-orange-500" />
                  <span className="text-orange-700 dark:text-orange-400">
                    {tgBotUsername ? (
                      <>
                        {t.tgWarnNotConnected}{" "}
                        <a
                          href={`https://t.me/${tgBotUsername}`}
                          target="_blank"
                          rel="noreferrer"
                          className="underline font-medium text-orange-700 dark:text-orange-400"
                        >
                          {t.tgWarnBot}
                        </a>{" "}
                        {t.tgWarnStart}
                      </>
                    ) : (
                      <>{t.tgWarnNoUsername}</>
                    )}
                  </span>
                </div>
              )}
          </div>
        )}
      </div>
    </div>
  );
}