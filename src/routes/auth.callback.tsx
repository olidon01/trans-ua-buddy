import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

export const Route = createFileRoute("/auth/callback")({
  component: AuthCallback,
});

function AuthCallback() {
  const { session, roles, loading } = useAuth();
  const { t } = useLanguage();
  const [error, setError] = useState<string | null>(null);
  const [exchanging, setExchanging] = useState(true);
  const [isRecovery, setIsRecovery] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const code = url.searchParams.get("code");
    const errDesc = url.searchParams.get("error_description") || url.hash.match(/error_description=([^&]+)/)?.[1];

    if (errDesc) {
      setError(decodeURIComponent(errDesc));
      setExchanging(false);
      return;
    }

    const hashParams = new URLSearchParams(window.location.hash.slice(1));
    const recoveryDetected =
      hashParams.get("type") === "recovery" ||
      url.searchParams.get("type") === "recovery";
    if (recoveryDetected) {
      setIsRecovery(true);
    }

    if (code) {
      supabase.auth.exchangeCodeForSession(code).then(({ error }) => {
        if (error) setError(error.message);
        setExchanging(false);
      });
    } else {
      // Implicit flow stores session via detectSessionInUrl; just wait
      setExchanging(false);
    }
  }, []);

  if (exchanging || loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t.loading}
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex min-h-screen items-center justify-center p-6 text-center">
        <div className="space-y-3">
          <p className="text-destructive font-medium">{error}</p>
          <a href="/login" className="text-primary underline">{t.emailLabel}</a>
        </div>
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;
  if (isStaff(roles)) return <Navigate to="/admin" />;
  return <Navigate to="/driver" />;
}