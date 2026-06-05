import { createFileRoute, Navigate, useNavigate, Outlet, useRouterState } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { useLanguage } from "@/contexts/LanguageContext";
import { ChevronRight, Clock, Check, RotateCcw, Settings } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin")({
  component: AdminListPage,
});

type TripRow = {
  id: string;
  full_name: string;
  company_name: string;
  car_number: string;
  trailer_number: string;
  vin_last4: string[];
  status: "pending" | "approved" | "resubmit";
  created_at: string;
  reviewed_at: string | null;
  border_crossing: string;
};

function AdminListPage() {
  const { roles, loading } = useAuth();
  const { t } = useLanguage();
  const [trips, setTrips] = useState<TripRow[] | null>(null);
  const [query, setQuery] = useState("");
  const [showStats, setShowStats] = useState(false);
  const routerState = useRouterState();
  const isAdminIndex = routerState.location.pathname === "/admin";

  // Reload data whenever navigating back to the admin index
  useEffect(() => {
    if (isAdminIndex) void load();
  }, [isAdminIndex]);

  // Realtime subscription — set up once on mount
  useEffect(() => {
    const ch = supabase
      .channel("admin-trips")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips" },
        () => load(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
  }, []);

  async function load() {
    const { data } = await supabase
      .from("trips")
      .select("id,full_name,company_name,car_number,trailer_number,vin_last4,status,created_at,reviewed_at,border_crossing")
      .order("created_at", { ascending: false });
    setTrips((data as TripRow[]) ?? []);
  }

  const filtered = !trips ? [] : trips.filter((trip) => {
    if (!query.trim()) return true;
    const q = query.toLowerCase();
    return (
      trip.full_name.toLowerCase().includes(q) ||
      trip.car_number.toLowerCase().includes(q) ||
      trip.trailer_number?.toLowerCase().includes(q) ||
      trip.vin_last4?.some((v) => v.includes(q))
    );
  });

  const now = new Date();
  const thisMonthTrips = (trips ?? []).filter((t) => {
    const d = new Date(t.created_at);
    return d.getMonth() === now.getMonth() && d.getFullYear() === now.getFullYear();
  });
  const reviewed = (trips ?? []).filter((t) => t.reviewed_at);
  const avgHours = reviewed.length
    ? Math.round(
        reviewed.reduce(
          (sum, t) =>
            sum + (new Date(t.reviewed_at!).getTime() - new Date(t.created_at).getTime()),
          0,
        ) / reviewed.length / 1000 / 60 / 60,
      )
    : 0;
  const resubmitPct = (trips ?? []).length
    ? Math.round(((trips ?? []).filter((t) => t.status === "resubmit").length / (trips ?? []).length) * 100)
    : 0;

  if (loading) return <div className="p-6 text-muted-foreground">{t.loading}</div>;
  if (!isStaff(roles)) return <Navigate to="/driver" />;

  if (!isAdminIndex) return <Outlet />;

  return (
    <div className="max-w-5xl mx-auto px-4 py-6">
      <h1 className="text-2xl font-bold tracking-tight mb-6">{t.trips}</h1>

      <div className="flex gap-2 mb-4">
        <input
          type="search"
          placeholder="Пошук за ім'ям, VIN, номером авто..."
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="flex-1 border border-border rounded-lg px-3 py-2 text-sm bg-background"
        />
        <button
          type="button"
          onClick={() => setShowStats((v) => !v)}
          className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary"
        >
          📊
        </button>
        <button
          type="button"
          onClick={() => navigate({ to: "/admin/settings" })}
          className="px-3 py-2 rounded-lg border border-border text-sm hover:bg-secondary flex items-center"
          title="Налаштування"
        >
          <Settings className="size-4" />
        </button>
      </div>

      {showStats && (
        <div className="grid grid-cols-3 gap-3 mb-4">
          <StatCard label="Поїздок цього місяця" value={String(thisMonthTrips.length)} />
          <StatCard label="Сер. час верифікації" value={`${avgHours} год`} />
          <StatCard label="Відсоток відхилень" value={`${resubmitPct}%`} />
        </div>
      )}

      {trips === null ? (
        <div className="text-muted-foreground">{t.loading}</div>
      ) : filtered.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">{t.noTrips}</div>
      ) : (
        <div className="space-y-2">
          {filtered.map((trip) => (
            <TripCard key={trip.id} trip={trip} />
          ))}
        </div>
      )}
    </div>
  );
}

function TripCard({ trip }: { trip: TripRow }) {
  const navigate = useNavigate();
  return (
    <div
      onClick={() => navigate({ to: "/admin/$tripId", params: { tripId: trip.id } })}
      className="block cursor-pointer bg-card border border-border rounded-xl p-4 hover:border-primary/40 hover:shadow-sm transition-all"
    >
      <div className="flex items-center gap-3">
        <StatusBadge status={trip.status} />
        <div className="flex-1 min-w-0">
          <div className="font-medium truncate">{trip.full_name}</div>
          <div className="text-xs text-muted-foreground truncate">
            {trip.company_name} · {trip.car_number} · {trip.border_crossing}
          </div>
          <div className="text-xs text-muted-foreground mt-0.5">
            {new Date(trip.created_at).toLocaleString("uk-UA")}
          </div>
        </div>
        <ChevronRight className="size-4 text-muted-foreground shrink-0" />
      </div>
    </div>
  );
}

export function StatusBadge({ status }: { status: TripRow["status"] }) {
  const { t } = useLanguage();
  const map = {
    pending: { label: t.statusPending, Icon: Clock, cls: "bg-warning/15 text-warning" },
    approved: { label: t.statusApproved, Icon: Check, cls: "bg-success/15 text-success" },
    resubmit: { label: t.statusResubmit, Icon: RotateCcw, cls: "bg-destructive/15 text-destructive" },
  } as const;
  const { label, Icon, cls } = map[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-full ${cls}`}
    >
      <Icon className="size-3" /> {label}
    </span>
  );
}

function StatCard({ label, value }: { label: string; value: string }) {
  return (
    <div className="bg-card border border-border rounded-xl p-4 text-center">
      <div className="text-2xl font-bold">{value}</div>
      <div className="text-xs text-muted-foreground mt-1">{label}</div>
    </div>
  );
}