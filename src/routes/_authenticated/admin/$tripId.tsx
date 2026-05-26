import { createFileRoute, Link, Navigate, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { PHOTO_CATEGORIES, getCategoryLabel, type PhotoCategoryKey } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { ArrowLeft, X, Loader2 } from "lucide-react";
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
};

type Photo = {
  id: string;
  category: string;
  storage_path: string;
  status: "pending" | "approved" | "rejected";
  comment: string | null;
  url?: string;
};

function TripDetailPage() {
  const { tripId } = Route.useParams();
  const { roles, loading: authLoading } = useAuth();
  const { t } = useLanguage();
  const navigate = useNavigate();
  const notify = useServerFn(notifyTrip);
  const [trip, setTrip] = useState<Trip | null>(null);
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [comments, setComments] = useState<Record<string, string>>({});
  const [adminComment, setAdminComment] = useState("");
  const [busy, setBusy] = useState(false);

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
      .select("id,category,storage_path,status,comment")
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
    if (!rejectedIds.length) {
      toast.error(t.markRejectedFirst);
      return;
    }
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

  const photosByCat = (cat: PhotoCategoryKey) => photos.filter((p) => p.category === cat);
  const editable = trip.status !== "approved";

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

      <div className="bg-card border border-border rounded-2xl p-4 mb-6 grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm">
        <Info label={t.companyName} value={trip.company_name} />
        <Info label={t.carNumber} value={trip.car_number} />
        <Info label={t.trailerNumber} value={trip.trailer_number} />
        <Info label={t.passportNumber} value={trip.passport_number} />
        <Info label={t.phone} value={trip.phone} />
        <Info label={t.borderCrossing} value={trip.border_crossing} />
        <div className="col-span-2 sm:col-span-3">
          <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1">
            {t.vinList}
          </div>
          <div className="flex flex-wrap gap-1.5">
            {trip.vin_last4.map((v, i) => (
              <span
                key={i}
                className="inline-flex items-center font-mono text-sm px-2 py-0.5 rounded bg-secondary"
              >
                {v}
              </span>
            ))}
          </div>
        </div>
      </div>

      <div className="space-y-6">
        {PHOTO_CATEGORIES.map((c) => {
          const cps = photosByCat(c.key);
          if (!cps.length) return null;
          return (
            <section key={c.key}>
              <h3 className="font-semibold mb-2">{getCategoryLabel(t, c.key)}</h3>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {cps.map((p) => (
                <PhotoCard
                    key={p.id}
                    photo={p}
                    comment={comments[p.id] ?? ""}
                    onComment={(v) => setComments((m) => ({ ...m, [p.id]: v }))}
                    onReject={() => setPhotoStatus(p.id, "rejected")}
                    editable={editable}
                  />
                ))}
              </div>
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

function Info({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

function PhotoCard({
  photo,
  comment,
  onComment,
  onReject,
  editable,
}: {
  photo: Photo;
  comment: string;
  onComment: (v: string) => void;
  onReject: () => void;
  editable: boolean;
}) {
  const { t } = useLanguage();
  return (
    <div
      className={`bg-card border rounded-xl overflow-hidden ${
        photo.status === "rejected" ? "border-destructive" : "border-border"
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
            onClick={() =>
              photo.status === "rejected" ? setPhotoStatus(photo.id, "approved") : onReject()
            }
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