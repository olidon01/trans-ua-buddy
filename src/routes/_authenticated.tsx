import { createFileRoute, Navigate, Outlet, Link, useNavigate } from "@tanstack/react-router";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { Truck, LogOut } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated")({
  component: AuthLayout,
});

function AuthLayout() {
  const { session, loading, signOut, roles, user } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center text-muted-foreground">
        {t.loading}
      </div>
    );
  }
  if (!session) return <Navigate to="/login" />;

  const roleLabel = roles.includes("admin")
    ? t.roleAdmin
    : roles.includes("broker")
    ? t.roleBroker
    : t.roleDriver;

  return (
    <div className="min-h-screen flex flex-col bg-background">
      <header className="sticky top-0 z-30 bg-card/80 backdrop-blur border-b border-border">
        <div className="max-w-5xl mx-auto px-4 h-14 flex items-center justify-between">
          <Link
            to={isStaff(roles) ? "/admin" : "/driver"}
            className="flex items-center gap-2 font-semibold"
          >
            <div className="size-8 rounded-lg bg-primary text-primary-foreground grid place-items-center">
              <Truck className="size-4" />
            </div>
            <span>{t.appName}</span>
            <span className="hidden sm:inline text-xs text-muted-foreground font-normal ml-1">
              · {roleLabel}
            </span>
          </Link>
          <div className="flex items-center gap-3">
            <span className="hidden sm:inline text-xs text-muted-foreground max-w-[180px] truncate">
              {user?.email}
            </span>
            <Button
              variant="ghost"
              size="sm"
              onClick={async () => {
                await signOut();
                navigate({ to: "/login" });
              }}
            >
              <LogOut className="size-4 sm:mr-1.5" />
              <span className="hidden sm:inline">{t.signOut}</span>
            </Button>
          </div>
        </div>
      </header>
      <main className="flex-1">
        <Outlet />
      </main>
    </div>
  );
}