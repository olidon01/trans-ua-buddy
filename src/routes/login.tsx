import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { LanguageSwitcher } from "@/components/LanguageSwitcher";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Truck, Mail, Eye, EyeOff } from "lucide-react";

export const Route = createFileRoute("/login")({
  component: LoginPage,
});

function LoginPage() {
  const { session, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<"magic" | "password">("magic");
  const [password, setPassword] = useState("");
  const [rememberMe, setRememberMe] = useState(true);
  const [resetSent, setResetSent] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  if (!authLoading && session) return <Navigate to="/" />;

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithOtp({
      email: email.trim(),
      options: {
        emailRedirectTo: `${window.location.origin}/auth/callback`,
      },
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setSent(true);
    }
  }

  async function handlePasswordSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else if (!rememberMe) {
      const key = Object.keys(localStorage).find((k) => k.includes("supabase"));
      if (key) {
        const val = localStorage.getItem(key);
        if (val) {
          sessionStorage.setItem(key, val);
          localStorage.removeItem(key);
        }
      }
    }
  }

  async function handleForgotPassword() {
    if (!email.trim()) {
      toast.error(t.loginEnterEmail);
      return;
    }
    setLoading(true);
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: `${window.location.origin}/auth/callback`,
    });
    setLoading(false);
    if (error) {
      toast.error(error.message);
    } else {
      setResetSent(true);
      toast.success(t.loginResetSuccess);
    }
  }

  return (
    <div className="min-h-screen flex flex-col bg-background relative">
      <div className="absolute top-4 right-4 z-10">
        <LanguageSwitcher />
      </div>
      <div className="flex-1 flex items-center justify-center px-4 py-12">
        <div className="w-full max-w-md">
          <div className="flex items-center gap-3 mb-8 justify-center">
            <div className="size-12 rounded-2xl bg-primary text-primary-foreground grid place-items-center shadow-lg shadow-primary/20">
              <Truck className="size-6" />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight">{t.appName}</h1>
              <p className="text-xs text-muted-foreground">{t.tagline}</p>
            </div>
          </div>

          <div className="bg-card border border-border rounded-2xl p-6 shadow-sm">
            {sent ? (
              <div className="text-center py-6 space-y-3">
                <div className="mx-auto size-14 rounded-full bg-success/10 grid place-items-center">
                  <Mail className="size-7 text-success" />
                </div>
                <h2 className="text-lg font-semibold">{t.checkInbox}</h2>
                <p className="text-sm text-muted-foreground break-all">{email}</p>
              </div>
            ) : (
              <>
                <div className="grid grid-cols-2 gap-2 mb-4 p-1 bg-muted rounded-lg">
                  <button
                    type="button"
                    onClick={() => setActiveTab("magic")}
                    className={`text-sm font-medium py-2 px-4 rounded-md transition ${
                      activeTab === "magic"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.loginTabMagic}
                  </button>
                  <button
                    type="button"
                    onClick={() => setActiveTab("password")}
                    className={`text-sm font-medium py-2 px-4 rounded-md transition ${
                      activeTab === "password"
                        ? "bg-primary text-primary-foreground shadow"
                        : "text-muted-foreground hover:text-foreground"
                    }`}
                  >
                    {t.loginTabPassword}
                  </button>
                </div>
                {activeTab === "magic" ? (
                  <form onSubmit={handleSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email">{t.emailLabel}</Label>
                      <Input
                        id="email"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder={t.emailPlaceholder}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <Button type="submit" className="w-full" size="lg" disabled={loading}>
                      {loading ? t.loading : t.sendMagicLink}
                    </Button>
                  </form>
                ) : (
                  <form onSubmit={handlePasswordSubmit} className="space-y-4">
                    <div className="space-y-2">
                      <Label htmlFor="email-pw">{t.emailLabel}</Label>
                      <Input
                        id="email-pw"
                        type="email"
                        required
                        autoComplete="email"
                        placeholder={t.emailPlaceholder}
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="password">{t.loginPassword}</Label>
                      <div className="relative">
                        <Input
                          id="password"
                          type={showPassword ? "text" : "password"}
                          required
                          autoComplete="current-password"
                          value={password}
                          onChange={(e) => setPassword(e.target.value)}
                          className="pr-10"
                        />
                        <button
                          type="button"
                          onClick={() => setShowPassword((v) => !v)}
                          className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                          tabIndex={-1}
                          aria-label={showPassword ? "Hide password" : "Show password"}
                        >
                          {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                        </button>
                      </div>
                    </div>
                    <label className="flex items-center gap-2 text-sm text-muted-foreground cursor-pointer">
                      <input
                        type="checkbox"
                        checked={rememberMe}
                        onChange={(e) => setRememberMe(e.target.checked)}
                        className="rounded border-border"
                      />
                      {t.loginRememberMe}
                    </label>
                    <Button type="submit" className="w-full" size="lg" disabled={loading}>
                      {loading ? t.loading : t.loginSignIn}
                    </Button>
                    <div className="text-center">
                      {resetSent ? (
                        <span className="text-sm text-success">{t.loginResetSent}</span>
                      ) : (
                        <button
                          type="button"
                          onClick={handleForgotPassword}
                          disabled={loading}
                          className="text-sm text-muted-foreground hover:text-foreground underline"
                        >
                          {t.loginForgotPassword}
                        </button>
                      )}
                    </div>
                  </form>
                )}
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}