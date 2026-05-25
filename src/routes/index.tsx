import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";

export const Route = createFileRoute("/")({
  component: Index,
});

function Index() {
  const { session, roles, loading } = useAuth();
  const { t } = useLanguage();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t.loading}
      </div>
    );
  }

  if (!session) return <Navigate to="/login" />;
  if (isStaff(roles)) return <Navigate to="/admin" />;
  return <Navigate to="/driver" />;
}
