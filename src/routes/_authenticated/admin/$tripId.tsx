import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { getPhotoCategories, getCategoryLabel } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, X, Loader2, Pencil } from "lucide-react";
import { toast } from "sonner";
import { StatusBadge } from "@/routes/_authenticated/admin";
import { useServerFn } from "@tanstack/react-start";
import { notifyTrip } from "@/lib/notifications.functions";

export const Route = createFileRoute("/_authenticated/admin/$tripId")({
  component: TripDetailPage,
});

type Trip = {
  id: string;
  driver_id: string;
  status: "pending" | "approved" | "resubmit";
  company_name: string;
  car_number: string;
  trailer_number: string;
  full_name: string;
  passport_number: string;
  phone: string;
  border_crossing: string;
  vin_last4: string[];
  admin_comment: string | null;
  created_at: string;
  reviewed_at: string | null;
  previous_data: Record<string, string | string[]> | null;
};

type Photo = {
  id: string;
  category: string;
  storage_path: string;
  status: "pending" | "approved" | "rejected";
  comment: string | null;
  vin_index: number;
  url?: string;
};

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const { roles, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const PHOTO_CATEGORIES = getPhotoCategories(t);
  const navigate = useNavigate();
  const notify = useServerFn(notifyTrip);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [adminComment, setAdminComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [editDraft, setEditDraft] = useState<Partial<Trip>>({});
  const [rejectedVins, setRejectedVins] = useState<Set<number>>(new Set());

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tripId]);

  async function load() {
    const { data: t1 } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
    if (!t1) return;
    setTrip(t1 as Trip);
    setAdminComment(t1.admin_comment ?? "");

    const { data: ph } = await supabase
      .from("trip_photos")
      .select("id,category,storage_path,status,comment,vin_index")
      .eq("trip_id", tripId)
      .order("created_at", { ascending: true });

    const enriched = await Promise.all(
      (ph ?? []).map(async (p) => {
        const { data } = await supabase.storage
          .from("trip-photos")
          .createSignedUrl(p.storage_path, 60 * 60);
        return { ...p, url: data?.signedUrl } as Photo;
      }),
    );
    setPhotos(enriched);
    const initialComments: Record<string, string> = {};
    for (const p of enriched) initialComments[p.id] = p.comment ?? "";
    setComments(initialComments);
  }

  if (authLoading) return <div className="p-6 text-muted-foreground">{t.loading}</div>;
  if (!isStaff(roles)) return <Navigate to="/driver" />;
  if (!trip) return <div className="p-6 text-muted-foreground">{t.loading}</div>;

  function setPhotoStatus(id: string, status: "approved" | "rejected") {
    setPhotos((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  }

  async function approveAll() {
    setBusy(true);
    try {
      // mark all photos approved
      const ids = photos.map((p) => p.id);
      if (ids.length) {
        await supabase
          .from("trip_photos")
          .update({ status: "approved", comment: null })
          .in("id", ids);
      }
      await supabase
        .from("trips")
        .update({
          status: "approved",
          admin_comment: null,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", trip!.id);
      try {
        await notify({ data: { tripId: trip!.id, kind: "approved" } });
      } catch (e) {
        console.error("notify approved failed", e);
      }
      toast.success(t.tripApproved);
      navigate({ to: "/admin" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  async function sendBack() {
    const rejectedIds = photos.filter((p) => p.status === "rejected").map((p) => p.id);
    setBusy(true);
    try {
      // Update each rejected photo with its comment
      for (const p of photos.filter((x) => x.status === "rejected")) {
        await supabase
          .from("trip_photos")
          .update({ status: "rejected", comment: comments[p.id] || null })
          .eq("id", p.id);
      }
      // Auto-approve all non-rejected photos
      const approvedIds = photos.filter((p) => p.status !== "rejected").map((p) => p.id);
      if (approvedIds.length) {
        await supabase
          .from("trip_photos")
          .update({ status: "approved", comment: null })
          .in("id", approvedIds);
      }
      await supabase
        .from("trips")
        .update({
          status: "resubmit",
          admin_comment: adminComment.trim(),
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", trip!.id);
      if (rejectedVins.size > 0) {
        await supabase
          .from("trips")
          .update({ rejected_vins: Array.from(rejectedVins) })
          .eq("id", trip!.id);
      }
      try {
        await notify({ data: { tripId: trip!.id, kind: "rejected" } });
      } catch (e) {
        console.error("notify rejected failed", e);
      }
      toast.success(t.tripReturnedToDriver);
      navigate({ to: "/admin" });
    } catch (e) {
      toast.error(e instanceof Error ? e.message : t.error);
    } finally {
      setBusy(false);
    }
  }

  const editable = trip.status !== "approved";
  const isResubmitTrip = trip.previous_data !== null && trip.status === "pending";

  const prev = trip.previous_data;
  const showDiff = trip.status === "pending" && prev !== null;
  function isChanged(field: string, current: string) {
    if (!showDiff || !prev) return false;
    return String(prev[field] ?? "") !== current;
  }
  const vinChanged =
    showDiff && JSON.stringify(prev?.vin_last4) !== JSON.stringify(trip.vin_last4);

  function startEdit() {
    if (!trip) return;
    setEditDraft({
      company_name: trip.company_name,
      car_number: trip.car_number,
      trailer_number: trip.trailer_number,
      passport_number: trip.passport_number,
      phone: trip.phone,
      border_crossing: trip.border_crossing,
    });
    setIsEditing(true);
  }

  async function saveEdit() {
    if (!trip) return;
    const stamp = new Date().toLocaleTimeString("uk-UA", { hour: "2-digit", minute: "2-digit" });
    const newComment = `${trip.admin_comment ?? ""}${trip.admin_comment ? "\n" : ""}[Відредаговано о ${stamp}]`;
    const { error } = await supabase
      .from("trips")
      .update({ ...editDraft, admin_comment: newComment })
      .eq("id", trip.id);
    if (error) {
      toast.error(error.message);
      return;
    }
    setTrip({ ...trip, ...editDraft, admin_comment: newComment } as Trip);
    setIsEditing(false);
    toast.success("OK");
  }

  return (
    <div className="max-w-3xl mx-auto px-4 py-6 pb-32">
      <Link
        to="/admin"
        className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-4"
      >
        <ArrowLeft className="size-4" /> {t.back}
      </Link>

      <div className="flex items-start justify-between gap-3 mb-6 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold tracking-tight">{trip.full_name}</h1>
          <div className="text-sm text-muted-foreground">
            {new Date(trip.created_at).toLocaleString("uk-UA")}
          </div>
        </div>
        <StatusBadge status={trip.status} />
      </div>

      <StatusTimeline trip={trip} />
      <div className="flex justify-end gap-2 mb-2">
        {!isEditing ? (
          <Button type="button" variant="ghost" size="sm" onClick={startEdit}>
            <Pencil className="size-3.5 mr-1" /> Редагувати
          </Button>
        ) : (
          <>
            <Button type="button" variant="outline" size="sm" onClick={() => setIsEditing(false)}>
              Скасувати
            </Button>
            <Button type="button" size="sm" onClick={saveEdit}>
              Зберегти
            </Button>
          </>
        )}
      </div>
      <div className="bg-card border border-border rounded-2xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        {!isEditing ? (
          <>
            <Info label={t.companyName} value={trip.company_name} changed={isChanged("company_name", trip.company_name)} />
            <Info label={t.carNumber} value={trip.car_number} changed={isChanged("car_number", trip.car_number)} />
            <Info label={t.trailerNumber} value={trip.trailer_number} changed={isChanged("trailer_number", trip.trailer_number)} />
            <Info label={t.passportNumber} value={trip.passport_number} changed={isChanged("passport_number", trip.passport_number)} />
            <Info label={t.phone} value={trip.phone} changed={isChanged("phone", trip.phone)} />
            <Info label={t.borderCrossing} value={trip.border_crossing} changed={isChanged("border_crossing", trip.border_crossing)} />
          </>
        ) : (
          <>
            <EditField label={t.companyName} value={editDraft.company_name ?? ""} onChange={(v) => setEditDraft((d) => ({ ...d, company_name: v }))} />
            <EditField label={t.carNumber} value={editDraft.car_number ?? ""} onChange={(v) => setEditDraft((d) => ({ ...d, car_number: v }))} />
            <EditField label={t.trailerNumber} value={editDraft.trailer_number ?? ""} onChange={(v) => setEditDraft((d) => ({ ...d, trailer_number: v }))} />
            <EditField label={t.passportNumber} value={editDraft.passport_number ?? ""} onChange={(v) => setEditDraft((d) => ({ ...d, passport_number: v }))} />
            <EditField label={t.phone} value={editDraft.phone ?? ""} onChange={(v) => setEditDraft((d) => ({ ...d, phone: v }))} />
            <div>
              <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">{t.borderCrossing}</div>
              <select
                className="border border-border rounded px-2 py-1 text-sm w-full bg-background"
                value={editDraft.border_crossing ?? ""}
                onChange={(e) => setEditDraft((d) => ({ ...d, border_crossing: e.target.value }))}
              >
                {t.borders.map((b) => (
                  <option key={b} value={b}>{b}</option>
                ))}
              </select>
            </div>
          </>
        )}
        <div
          className="col-span-2 sm:col-span-3"
          style={vinChanged ? { outline: "2px solid orange", borderRadius: "6px", padding: "4px" } : undefined}
        >
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">
            {t.vinList}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {trip.vin_last4.map((v, i) => (
              <span key={i} className="inline-flex items-center gap-1.5">
                <span className="inline-flex items-center font-mono text-sm px-2 py-0.5 rounded bg-secondary">
                  {v}
                </span>
                {editable && (
                  <button
                    type="button"
                    onClick={() =>
                      setRejectedVins((prev) => {
                        const next = new Set(prev);
                        if (next.has(i)) next.delete(i);
                        else next.add(i);
                        return next;
                      })
                    }
                    className={`text-xs px-2 py-0.5 rounded border ${
                      rejectedVins.has(i)
                        ? "border-destructive text-destructive bg-destructive/10"
                        : "border-border text-muted-foreground"
                    }`}
                  >
                    {rejectedVins.has(i) ? "VIN відхилено" : "Відхилити VIN"}
                  </button>
                )}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {trip.vin_last4.map((vin, vi) => {
          const vinPhotos = photos.filter((p) => p.vin_index === vi);
          if (!vinPhotos.length) return null;
          return (
            <section key={vi} className="space-y-4">
              <div className="flex items-center gap-2 border-b border-border pb-2">
                <span className="font-mono px-2 py-0.5 rounded bg-secondary text-sm">{vin}</span>
                <span className="text-sm text-muted-foreground font-medium">Авто {vi + 1}</span>
              </div>
              {PHOTO_CATEGORIES.map((c) => {
                const cps = vinPhotos.filter((p) => p.category === c.key);
                if (!cps.length) return null;
                return (
                  <div key={c.key}>
                    <h4 className="text-sm font-medium mb-2">{getCategoryLabel(t, c.key)}</h4>
                    <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                      {cps.map((p) => (
                        <PhotoCard
                          key={p.id}
                          photo={p}
                          comment={comments[p.id] ?? ""}
                          onComment={(v) => setComments((m) => ({ ...m, [p.id]: v }))}
                          onReject={() => setPhotoStatus(p.id, p.status === "rejected" ? "approved" : "rejected")}
                          editable={editable}
                          isResubmitted={isResubmitTrip}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </section>
          );
        })}
      </div>

      {editable && (
        <div className="fixed bottom-0 left-0 right-0 bg-card/95 backdrop-blur border-t border-border p-3 z-20">
          <div className="max-w-3xl mx-auto space-y-2">
            <Textarea
              placeholder={t.rejectionCommentOptional}
              value={adminComment}
              onChange={(e) => setAdminComment(e.target.value)}
              rows={2}
              className="resize-none"
            />
            <div className="flex gap-2">
              <Button
                type="button"
                variant="outline"
                className="flex-1"
                onClick={sendBack}
                disabled={busy}
              >
                {busy ? <Loader2 className="size-4 animate-spin" /> : t.rejectAndSendBack}
              </Button>
              <Button type="button" className="flex-1" onClick={approveAll} disabled={busy}>
                {busy ? <Loader2 className="size-4 animate-spin" /> : t.approveAll}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function Info({ label, value, changed }: { label: string; value: string; changed?: boolean }) {
  return (
    <div style={changed ? { outline: "2px solid orange", borderRadius: "6px", padding: "4px" } : undefined}>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function EditField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">{label}</div>
      <input
        className="border rounded px-2 py-1 text-sm w-full"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}

function StatusTimeline({ trip }: { trip: Trip }) {
  const { t } = useLanguage();
  const steps = [
    {
      label: t.submittedAt,
      time: trip.created_at,
      done: true,
    },
    {
      label: !trip.reviewed_at
        ? t.timelinePending
        : trip.status === "approved"
        ? t.timelineApproved
        : t.timelineReturned,
      time: trip.reviewed_at,
      done: !!trip.reviewed_at,
    },
  ];
  return (
    <div className="bg-card border border-border rounded-2xl p-4 mb-6">
      <h3 className="text-xs uppercase font-semibold text-muted-foreground tracking-wide mb-4">
        {t.timelineTitle}
      </h3>
      <div className="space-y-0">
        {steps.map((step, i) => (
          <div key={i} className="flex gap-3">
            <div className="flex flex-col items-center">
              <div
                className={`size-2.5 rounded-full mt-1 flex-shrink-0 ${
                  step.done ? "bg-primary" : "bg-border"
                }`}
              />
              {i < steps.length - 1 && (
                <div className="w-px flex-1 bg-border my-1" />
              )}
            </div>
            <div className="pb-4 min-w-0">
              <div className={`text-sm font-medium ${step.done ? "text-foreground" : "text-muted-foreground"}`}>
                {step.label}
              </div>
              {step.time && (
                <div className="text-xs text-muted-foreground mt-0.5">
                  {new Date(step.time).toLocaleString("uk-UA")}
                </div>
              )}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

function PhotoCard({
  photo,
  comment,
  onComment,
  onReject,
  editable,
  isResubmitted,
}: {
  photo: Photo;
  comment: string;
  onComment: (v: string) => void;
  onReject: () => void;
  editable: boolean;
  isResubmitted: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={`bg-card rounded-xl overflow-hidden ${
        photo.status === "rejected"
          ? "border-2 border-destructive"
          : isResubmitted && photo.status === "pending"
          ? "border-2 border-orange-400"
          : "border border-border"
      }`}
    >
      {photo.url && (
        <a href={photo.url} target="_blank" rel="noreferrer">
          <img src={photo.url} alt="" className="w-full aspect-square object-cover" />
        </a>
      )}
      {editable && (
        <div className="p-2 space-y-2">
          <Button
            type="button"
            size="sm"
            variant={photo.status === "rejected" ? "destructive" : "outline"}
            className="w-full"
            onClick={onReject}
          >
            <X className="size-3.5 mr-1" />
            {photo.status === "rejected" ? t.undoReject : t.rejectPhoto}
          </Button>
          {photo.status === "rejected" && (
            <Textarea
              placeholder={t.photoComment}
              value={comment}
              onChange={(e) => onComment(e.target.value)}
              rows={2}
              className="resize-none text-xs"
            />
          )}
        </div>
      )}
    </div>
  );
}