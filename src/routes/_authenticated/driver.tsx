import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { getPhotoCategories, getCategoryLabel, type PhotoCategoryKey } from "@/lib/i18n";
import { useLanguage } from "@/contexts/LanguageContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  Plus, X, Upload, Camera, Check, Clock, AlertTriangle, Loader2, ChevronDown,
} from "lucide-react";
import { z } from "zod";


export const Route = createFileRoute("/_authenticated/driver")({
  component: DriverPage,
});

type TripRow = {
  id: string;
  status: "pending" | "approved" | "resubmit";
  admin_comment: string | null;
  created_at: string;
};

function DriverPage() {
  const { user, roles } = useAuth();
  const { t } = useLanguage();
  const [activeTrip, setActiveTrip] = useState<TripRow | null | undefined>(undefined);

  useEffect(() => {
    if (!user) return;
    void loadActive();
    // Realtime: refresh when our trips change (admin review)
    const ch = supabase
      .channel(`driver-trips-${user.id}`)
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "trips", filter: `driver_id=eq.${user.id}` },
        () => loadActive(),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(ch);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  async function loadActive() {
    if (!user) return;
    const { data } = await supabase
      .from("trips")
      .select("id,status,admin_comment,created_at")
      .eq("driver_id", user.id)
      .in("status", ["pending", "resubmit"])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();
    setActiveTrip((data as TripRow | null) ?? null);
  }

  if (isStaff(roles)) return <Navigate to="/admin" />;
  if (activeTrip === undefined) {
    return <div className="p-6 text-muted-foreground">{t.loading}</div>;
  }

  if (activeTrip && activeTrip.status === "pending") {
    return <WaitingScreen tripId={activeTrip.id} />;
  }

  return (
    <DriverForm
      existingTrip={activeTrip && activeTrip.status === "resubmit" ? activeTrip : null}
      onDone={loadActive}
    />
  );
}

type FullTrip = {
  company_name: string;
  car_number: string;
  trailer_number: string;
  full_name: string;
  passport_number: string;
  phone: string;
  border_crossing: string;
  vin_last4: string[];
  created_at: string;
};

type SubmittedPhoto = {
  id: string;
  category: string;
  url: string | null;
  vin_index: number;
};

function WaitingScreen({ tripId }: { tripId: string }) {
  const { t } = useLanguage();
  const PHOTO_CATEGORIES = getPhotoCategories(t);
  const [trip, setTrip] = useState<FullTrip | null>(null);
  const [photos, setPhotos] = useState<SubmittedPhoto[]>([]);
  const [showData, setShowData] = useState(false);

  useEffect(() => {
    void (async () => {
      const { data } = await supabase
        .from("trips")
        .select(
          "company_name,car_number,trailer_number,full_name,passport_number,phone,border_crossing,vin_last4,created_at",
        )
        .eq("id", tripId)
        .maybeSingle();
      if (data) setTrip(data as FullTrip);
      const { data: ph } = await supabase
        .from("trip_photos")
        .select("id,category,storage_path,vin_index")
        .eq("trip_id", tripId)
        .order("created_at", { ascending: true });
      const enriched = await Promise.all(
        (ph ?? []).map(async (p) => {
          const { data: signed } = await supabase.storage
            .from("trip-photos")
            .createSignedUrl(p.storage_path, 60 * 60);
          return { id: p.id, category: p.category, url: signed?.signedUrl ?? null, vin_index: p.vin_index };
        }),
      );
      setPhotos(enriched);
    })();
  }, [tripId]);

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <div className="text-center mb-8">
        <div className="mx-auto size-16 rounded-full bg-warning/15 grid place-items-center mb-4">
          <Clock className="size-8 text-warning" />
        </div>
        <h1 className="text-2xl font-bold mb-1">{t.waitingTitle}</h1>
        <p className="text-muted-foreground text-sm">{t.waitingDesc}</p>
      </div>
      {trip && (
        <div className="space-y-3">
          <button
            type="button"
            onClick={() => setShowData((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 bg-card border border-border rounded-xl text-sm font-medium hover:border-primary/40 transition-colors"
          >
            <span>{t.viewSubmitted}</span>
            <ChevronDown className={`size-4 text-muted-foreground transition-transform ${showData ? "rotate-180" : ""}`} />
          </button>
          {showData && (
            <div className="bg-card border border-border rounded-2xl p-4 space-y-4 text-sm">
              <h2 className="font-semibold text-muted-foreground uppercase text-xs tracking-wide">
                {t.submittedData}
              </h2>
              <div className="grid grid-cols-2 gap-3">
                <ReadField label={t.companyName} value={trip.company_name} />
                <ReadField label={t.carNumber} value={trip.car_number} />
                <ReadField label={t.trailerNumber} value={trip.trailer_number} />
                <ReadField label={t.passportNumber} value={trip.passport_number} />
                <ReadField label={t.phone} value={trip.phone} />
                <ReadField label={t.borderCrossing} value={trip.border_crossing} />
              </div>
              <ReadField label={t.fullName} value={trip.full_name} />
              <div>
                <div className="text-xs uppercase text-muted-foreground tracking-wide mb-1.5">
                  {t.vinList}
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {trip.vin_last4.map((v, i) => (
                    <span
                      key={i}
                      className="font-mono text-sm px-2 py-0.5 rounded bg-secondary"
                    >
                      {v}
                    </span>
                  ))}
                </div>
              </div>
              {photos.length > 0 && (
                <div>
                  <div className="text-xs uppercase text-muted-foreground tracking-wide mb-2">
                    {t.photos}
                  </div>
                  <div className="space-y-4">
                    {trip.vin_last4.map((vin, vi) => {
                      const vinPhotos = photos.filter((p) => p.vin_index === vi);
                      if (!vinPhotos.length) return null;
                      return (
                        <div key={vi} className="space-y-3">
                          <div className="flex items-center gap-2">
                            <span className="font-mono text-sm px-2 py-0.5 rounded bg-secondary">{vin}</span>
                            <span className="text-xs text-muted-foreground">Авто {vi + 1}</span>
                          </div>
                          {PHOTO_CATEGORIES.map((c) => {
                            const catPhotos = vinPhotos.filter((p) => p.category === c.key);
                            if (!catPhotos.length) return null;
                            return (
                              <div key={c.key}>
                                <div className="text-xs text-muted-foreground mb-1.5">{getCategoryLabel(t, c.key)}</div>
                                <div className="grid grid-cols-4 gap-1.5">
                                  {catPhotos.map((p) =>
                                    p.url ? (
                                      <a key={p.id} href={p.url} target="_blank" rel="noreferrer">
                                        <img
                                          src={p.url}
                                          alt=""
                                          className="aspect-square w-full object-cover rounded-lg border border-border"
                                        />
                                      </a>
                                    ) : null,
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

function ReadField({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-xs uppercase text-muted-foreground tracking-wide mb-0.5">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}

const tripSchema = z.object({
  company_name: z.string().trim().min(1).max(120),
  car_number: z.string().trim().min(1).max(30),
  trailer_number: z.string().trim().min(1).max(30),
  full_name: z
    .string()
    .trim()
    .min(1)
    .max(120)
    .regex(/^[A-Za-z\s\-']+$/, "validFullName")
    .refine((v) => v.trim().split(/\s+/).length >= 2, "validFullName"),
  passport_number: z.string().trim().min(1).max(30),
  phone: z
    .string()
    .trim()
    .regex(/^\+[1-9]\d{7,14}$/, "validPhone"),
  border_crossing: z.string().trim().min(1).max(80),
  vin_last4: z.array(z.string().regex(/^\d{4}$/)).min(1).max(20),
});

type FormState = z.infer<typeof tripSchema>;

function emptyCarPhotos(): Record<PhotoCategoryKey, File[]> {
  return {
    van_overview: [],
    van_corners: [],
    vin_plate: [],
    vin_windshield: [],
    interior: [],
    cargo: [],
    documents: [],
  };
}

function DriverForm({
  existingTrip,
  onDone,
}: {
  existingTrip: TripRow | null;
  onDone: () => void;
}) {
  const { user } = useAuth();
  const { t } = useLanguage();
  const [form, setForm] = useState<FormState>({
    company_name: "",
    car_number: "",
    trailer_number: "",
    full_name: "",
    passport_number: "",
    phone: "",
    border_crossing: "",
    vin_last4: [""],
  });
  const [originalData, setOriginalData] = useState<Partial<FormState> | null>(null);
  const [rejectedVinIndices, setRejectedVinIndices] = useState<number[]>([]);
  const [prefs, setPrefs] = useState({
    email_notifications: true,
    telegram_notifications: true,
    telegram_username: "",
  });
  const tgBotUsername = import.meta.env.VITE_TELEGRAM_BOT_USERNAME ?? "vanlink_notify_bot";
  const [telegramConnected, setTelegramConnected] = useState<boolean | null>(null);
  const [photos, setPhotos] = useState<Record<number, Record<PhotoCategoryKey, File[]>>>({
    0: emptyCarPhotos(),
  });
  // For resubmit: existing rejected photos info
  const [rejected, setRejected] = useState<
    { id: string; category: string; storage_path: string; comment: string | null; signed_url: string | null; vin_index: number }[]
  >([]);
  const [approved, setApproved] = useState<
    { id: string; category: string; signed_url: string | null; vin_index: number }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [activeCarIndex, setActiveCarIndex] = useState(0);

  const TEMPLATE_PHOTOS: Partial<Record<PhotoCategoryKey, string>> = {
    van_overview: "/templates/van_overview.jpeg",
    vin_plate: "/templates/vin_plate.jpeg",
    vin_windshield: "/templates/vin_windshield.jpeg",
    interior: "/templates/interior.jpeg",
    cargo: "/templates/cargo.jpeg",
    documents: "/templates/doc_0.jpeg",
  };

  function validateField(name: string, value: string): string {
    if (name === "full_name") {
      if (!value.trim()) return t.required;
      if (!/^[A-Za-z\s\-']+$/.test(value)) return t.validFullName;
      if (value.trim().split(/\s+/).length < 2) return t.validFullName;
    }
    if (name === "phone") {
      if (!value.trim()) return t.required;
      if (!/^\+[1-9]\d{7,14}$/.test(value.trim())) return t.validPhone;
    }
    return "";
  }

  function validateTelegram(value: string): string {
    if (!prefs.telegram_notifications) return "";
    if (!value.trim()) return t.required;
    if (!/^@?[a-zA-Z0-9_]{4,31}$/.test(value.trim())) return t.validTelegram;
    return "";
  }

  async function savePrefsToDb(updated: typeof prefs) {
    if (!user) return;
    const cleanUsername = updated.telegram_username
      .trim()
      .replace(/^@/, "")
      .slice(0, 64);
    await supabase
      .from("profiles")
      .update({
        email_notifications: updated.email_notifications,
        telegram_notifications: updated.telegram_notifications,
        telegram_username: cleanUsername || null,
      })
      .eq("id", user.id);
  }

  // Load profile prefs once
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_notifications, telegram_notifications, telegram_username, telegram_chat_id")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          email_notifications: data.email_notifications ?? true,
          telegram_notifications: data.telegram_notifications ?? true,
          telegram_username: data.telegram_username ?? "",
        });
        setTelegramConnected(!!data.telegram_chat_id);
      }
    })();
  }, [user?.id]);

  useEffect(() => {
    if (!existingTrip) return;
    void (async () => {
      const { data: trip } = await supabase
        .from("trips")
        .select("*")
        .eq("id", existingTrip.id)
        .maybeSingle();
      if (trip) {
        setForm({
          company_name: trip.company_name,
          car_number: trip.car_number,
          trailer_number: trip.trailer_number,
          full_name: trip.full_name,
          passport_number: trip.passport_number,
          phone: trip.phone,
          border_crossing: trip.border_crossing,
          vin_last4: trip.vin_last4?.length ? trip.vin_last4 : [""],
        });
        setOriginalData({
          company_name: trip.company_name,
          car_number: trip.car_number,
          trailer_number: trip.trailer_number,
          full_name: trip.full_name,
          passport_number: trip.passport_number,
          phone: trip.phone,
          border_crossing: trip.border_crossing,
          vin_last4: trip.vin_last4?.length ? trip.vin_last4 : [""],
        });
        setRejectedVinIndices(trip.rejected_vins ?? []);
      }
      const { data: rj } = await supabase
        .from("trip_photos")
        .select("id,category,storage_path,comment,vin_index,status")
        .eq("trip_id", existingTrip.id)
        .in("status", ["rejected", "approved"]);
      const enriched = await Promise.all(
        (rj ?? []).map(async (p) => {
          const { data } = await supabase.storage
            .from("trip-photos")
            .createSignedUrl(p.storage_path, 60 * 60);
          return { ...p, signed_url: data?.signedUrl ?? null };
        }),
      );
      const rejectedRows = enriched.filter((p) => p.status === "rejected");
      const approvedRows = enriched.filter((p) => p.status === "approved");
      setRejected(rejectedRows);
      setApproved(
        approvedRows.map((p) => ({
          id: p.id,
          category: p.category,
          signed_url: p.signed_url,
          vin_index: p.vin_index,
        })),
      );
      const photoInit: Record<number, Record<PhotoCategoryKey, File[]>> = {};
      for (const r of rejectedRows) {
        if (!photoInit[r.vin_index]) photoInit[r.vin_index] = emptyCarPhotos();
      }
      setPhotos(photoInit);
    })();
  }, [existingTrip]);

  // Load draft from localStorage (new trip only)
  useEffect(() => {
    if (existingTrip) return;
    const raw = localStorage.getItem("vanlink_draft");
    if (!raw) return;
    try {
      const saved = JSON.parse(raw);
      if (saved.form) setForm(saved.form);
      if (saved.activeCarIndex !== undefined) setActiveCarIndex(saved.activeCarIndex);
    } catch {
      // ignore corrupted draft
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Persist draft on form changes (new trip only, debounced)
  useEffect(() => {
    if (existingTrip) return;
    const t = setTimeout(() => {
      localStorage.setItem("vanlink_draft", JSON.stringify({ form, activeCarIndex }));
    }, 1000);
    return () => clearTimeout(t);
  }, [form, activeCarIndex, existingTrip]);

  function setVin(i: number, v: string) {
    setForm((f) => {
      const copy = [...f.vin_last4];
      copy[i] = v.replace(/\D/g, "").slice(0, 4);
      return { ...f, vin_last4: copy };
    });
  }

  function addVin() {
    setForm((f) => ({ ...f, vin_last4: [...f.vin_last4, ""] }));
    setPhotos((p) => ({ ...p, [Object.keys(p).length]: emptyCarPhotos() }));
  }
  function removeVin(i: number) {
    setForm((f) => ({ ...f, vin_last4: f.vin_last4.filter((_, idx) => idx !== i) }));
    setPhotos((prev) => {
      const next: Record<number, Record<PhotoCategoryKey, File[]>> = {};
      for (const [key, val] of Object.entries(prev)) {
        const idx = parseInt(key);
        if (idx === i) continue;
        if (idx > i) next[idx - 1] = val;
        else next[idx] = val;
      }
      return next;
    });
  }

  function handlePhotos(vinIndex: number, cat: PhotoCategoryKey, files: File[]) {
    setPhotos((p) => ({
      ...p,
      [vinIndex]: { ...(p[vinIndex] ?? emptyCarPhotos()), [cat]: files },
    }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const errors: Record<string, string> = {};
    errors.full_name = validateField("full_name", form.full_name);
    errors.phone = validateField("phone", form.phone);
    errors.telegram = validateTelegram(prefs.telegram_username);
    errors.border_crossing = form.border_crossing.trim() ? "" : t.required;
    const hasErrors = Object.values(errors).some(Boolean);
    setFieldErrors(errors);
    if (hasErrors) {
      setTimeout(() => {
        const firstError = document.querySelector("[data-field-error]");
        firstError?.scrollIntoView({ behavior: "smooth", block: "center" });
      }, 50);
      return;
    }

    for (let i = 0; i < form.vin_last4.length; i++) {
      if (!form.vin_last4[i] || !/^\d{4}$/.test(form.vin_last4[i])) {
        toast.error(`Авто ${i + 1}: введіть останні 4 цифри VIN`);
        return;
      }
    }
    if (!form.company_name.trim()) {
      toast.error(`Заповніть поле: ${t.companyName}`);
      return;
    }
    if (!form.car_number.trim()) {
      toast.error(`Заповніть поле: ${t.carNumber}`);
      return;
    }
    if (!form.trailer_number.trim()) {
      toast.error(`Заповніть поле: ${t.trailerNumber}`);
      return;
    }
    if (!form.passport_number.trim()) {
      toast.error(`Заповніть поле: ${t.passportNumber}`);
      return;
    }

    const parsed = tripSchema.safeParse(form);
    if (!parsed.success) {
      console.error("Trip form validation errors:", parsed.error.issues);
      toast.error(t.formInvalid);
      return;
    }

    // For NEW trip, require all category counts; for resubmit only require categories with rejected photos
    if (!existingTrip) {
      for (let vi = 0; vi < form.vin_last4.length; vi++) {
        for (const c of PHOTO_CATEGORIES) {
          if ((photos[vi]?.[c.key]?.length ?? 0) !== c.count) {
            toast.error(`Авто ${vi + 1}: ${getCategoryLabel(t, c.key)}: ${c.count} ${t.photoCountError}`);
            return;
          }
        }
      }
    } else {
      const checked = new Set<string>();
      for (const r of rejected) {
        const key = `${r.vin_index}::${r.category}`;
        if (checked.has(key)) continue;
        checked.add(key);
        const needed = rejected.filter(x => x.vin_index === r.vin_index && x.category === r.category).length;
        const have = photos[r.vin_index]?.[r.category as PhotoCategoryKey]?.length ?? 0;
        if (have !== needed) {
          toast.error(`Авто ${r.vin_index + 1}: ${getCategoryLabel(t, r.category as PhotoCategoryKey)}: ${needed} ${t.photoCountError}`);
          return;
        }
      }
      // Validate new VINs have all photos
      const originalVinCount = originalData?.vin_last4?.length ?? 0;
      for (let vi = originalVinCount; vi < form.vin_last4.length; vi++) {
        for (const c of PHOTO_CATEGORIES) {
          if ((photos[vi]?.[c.key]?.length ?? 0) !== c.count) {
            toast.error(`Авто ${vi + 1}: ${getCategoryLabel(t, c.key)}: ${c.count} ${t.photoCountError}`);
            return;
          }
        }
      }
    }

    setSubmitting(true);
    let tripId = existingTrip?.id;
    let stage: "trip" | "photo" = "trip";
    try {
      if (existingTrip) {
        // update trip data, set status back to pending
        const { error } = await supabase
          .from("trips")
          .update({
            ...parsed.data,
            status: "pending",
            admin_comment: null,
            previous_data: originalData ?? null,
          })
          .eq("id", existingTrip.id);
        if (error) throw error;

        // Replace each rejected photo IN-PLACE: upload new file, UPDATE row, delete old storage object.
        const rejByKey: Record<string, typeof rejected> = {};
        for (const r of rejected) {
          const k = `${r.vin_index}::${r.category}`;
          (rejByKey[k] ||= []).push(r);
        }
        for (const [key, items] of Object.entries(rejByKey)) {
          const splitIdx = key.indexOf("::");
          const vi = parseInt(key.slice(0, splitIdx));
          const cat = key.slice(splitIdx + 2) as PhotoCategoryKey;
          const files = photos[vi]?.[cat] ?? [];
          stage = "photo";
          for (let i = 0; i < items.length; i++) {
            const target = items[i];
            const file = files[i];
            if (!file) continue;
            const ext = file.name.split(".").pop() || "jpg";
            const newPath = `${user.id}/${existingTrip.id}/${cat}/${vi}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("trip-photos")
              .upload(newPath, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;
            const { error: updErr } = await supabase
              .from("trip_photos")
              .update({ storage_path: newPath, status: "pending", comment: null })
              .eq("id", target.id);
            if (updErr) throw updErr;
            await supabase.storage.from("trip-photos").remove([target.storage_path]);
          }
        }
        // Upload photos for new VINs added during resubmit
        const originalVinCount = originalData?.vin_last4?.length ?? 0;
        for (let vi = originalVinCount; vi < form.vin_last4.length; vi++) {
          for (const c of PHOTO_CATEGORIES) {
            const files = photos[vi]?.[c.key] ?? [];
            if (!files.length) continue;
            stage = "photo";
            for (const file of files) {
              const ext = file.name.split(".").pop() || "jpg";
              const path = `${user.id}/${existingTrip.id}/${c.key}/${vi}/${crypto.randomUUID()}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("trip-photos")
                .upload(path, file, { contentType: file.type, upsert: false });
              if (upErr) throw upErr;
              const { error: insErr } = await supabase.from("trip_photos").insert({
                trip_id: existingTrip.id,
                category: c.key,
                storage_path: path,
                status: "pending",
                vin_index: vi,
              });
              if (insErr) throw insErr;
            }
          }
        }
      } else {
        const { data, error } = await supabase
          .from("trips")
          .insert({ ...parsed.data, driver_id: user.id })
          .select("id")
          .single();
        if (error) throw error;
        tripId = data.id;

        // Upload all photos for new trip, per car
        for (let vi = 0; vi < form.vin_last4.length; vi++) {
          for (const c of PHOTO_CATEGORIES) {
            const files = photos[vi]?.[c.key] ?? [];
            if (!files.length) continue;
            stage = "photo";
            for (const file of files) {
              const ext = file.name.split(".").pop() || "jpg";
              const path = `${user.id}/${tripId}/${c.key}/${vi}/${crypto.randomUUID()}.${ext}`;
              const { error: upErr } = await supabase.storage
                .from("trip-photos")
                .upload(path, file, { contentType: file.type, upsert: false });
              if (upErr) throw upErr;
              const { error: insErr } = await supabase.from("trip_photos").insert({
                trip_id: tripId!,
                category: c.key,
                storage_path: path,
                status: "pending",
                vin_index: vi,
              });
              if (insErr) throw insErr;
            }
          }
        }
      }

      toast.success(t.tripSubmitted);
      if (!existingTrip) {
        localStorage.removeItem("vanlink_draft");
      }
      onDone();
    } catch (err: unknown) {
      // If we just created a new trip this attempt and upload failed,
      // delete the partial trip so the driver can retry cleanly
      if (!existingTrip && tripId) {
        try {
          const { data: partial } = await supabase
            .from("trip_photos")
            .select("storage_path")
            .eq("trip_id", tripId);
          if (partial?.length) {
            await supabase.storage
              .from("trip-photos")
              .remove(partial.map((p) => p.storage_path));
            await supabase
              .from("trip_photos")
              .delete()
              .eq("trip_id", tripId);
          }
          await supabase.from("trips").delete().eq("id", tripId);
        } catch {
          // best-effort cleanup — ignore secondary errors
        }
        tripId = undefined;
      }
      console.error("submit failed", err);
      if (stage === "photo") {
        toast.error("Помилка завантаження фото. Перевірте інтернет-з'єднання.");
      } else if (existingTrip) {
        toast.error("Не вдалося зберегти зміни. Спробуйте ще раз.");
      } else {
        toast.error("Не вдалося створити поїздку. Спробуйте ще раз.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  const isResubmit = !!existingTrip;

  return (
    <div className="max-w-2xl mx-auto px-4 py-6 pb-24">
      <div className="mb-6">
        <h1 className="text-2xl font-bold tracking-tight">
          {isResubmit ? t.rejectedTitle : t.newTrip}
        </h1>
        {isResubmit && existingTrip?.admin_comment && (
          <div className="mt-3 p-3 rounded-lg border border-destructive/30 bg-destructive/5 text-sm">
            <div className="flex gap-2 items-start">
              <AlertTriangle className="size-4 text-destructive mt-0.5 shrink-0" />
              <div>
                <div className="font-medium mb-1">{t.adminCommentLabel}</div>
                <div className="text-muted-foreground">{existingTrip.admin_comment}</div>
              </div>
            </div>
          </div>
        )}
      </div>

      <form onSubmit={handleSubmit} className="space-y-6">
        <Section title={t.tripDataSection}>
          <Field label={t.companyName}>
            <Input
              required
              value={form.company_name}
              onChange={(e) => setForm({ ...form, company_name: e.target.value })}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.carNumber}>
              <Input
                required
                value={form.car_number}
                onChange={(e) => setForm({ ...form, car_number: e.target.value })}
              />
            </Field>
            <Field label={t.trailerNumber}>
              <Input
                required
                value={form.trailer_number}
                onChange={(e) => setForm({ ...form, trailer_number: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t.fullName} error={fieldErrors.full_name}>
            <Input
              required
              value={form.full_name}
              onChange={(e) => {
                setForm({ ...form, full_name: e.target.value });
                if (fieldErrors.full_name) {
                  setFieldErrors((prev) => ({ ...prev, full_name: "" }));
                }
              }}
              onBlur={(e) =>
                setFieldErrors((prev) => ({
                  ...prev,
                  full_name: validateField("full_name", e.target.value),
                }))
              }
              className={fieldErrors.full_name ? "border-destructive" : ""}
            />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label={t.passportNumber}>
              <Input
                required
                value={form.passport_number}
                onChange={(e) => setForm({ ...form, passport_number: e.target.value })}
              />
            </Field>
            <Field label={t.phone} error={fieldErrors.phone}>
              <Input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => {
                  setForm({ ...form, phone: e.target.value });
                  if (fieldErrors.phone) {
                    setFieldErrors((prev) => ({ ...prev, phone: "" }));
                  }
                }}
                onBlur={(e) =>
                  setFieldErrors((prev) => ({
                    ...prev,
                    phone: validateField("phone", e.target.value),
                  }))
                }
                className={fieldErrors.phone ? "border-destructive" : ""}
              />
            </Field>
          </div>
          <div className="space-y-3 rounded-lg border border-border p-3 bg-secondary/30">
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-normal">
                {t.notifyEmail}
              </Label>
              <Switch
                checked={prefs.email_notifications}
                onCheckedChange={(v) => {
                  const updated = { ...prefs, email_notifications: v };
                  setPrefs(updated);
                  void savePrefsToDb(updated);
                }}
              />
            </div>
            <div className="flex items-center justify-between gap-3">
              <Label className="text-sm font-normal">
                {t.notifyTelegram}
              </Label>
              <Switch
                checked={prefs.telegram_notifications}
                onCheckedChange={(v) => {
                  const updated = { ...prefs, telegram_notifications: v };
                  setPrefs(updated);
                  void savePrefsToDb(updated);
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
                    if (fieldErrors.telegram) {
                      setFieldErrors((prev) => ({ ...prev, telegram: "" }));
                    }
                  }}
                  onBlur={(e) => {
                    const val = e.target.value;
                    setFieldErrors((prev) => ({
                      ...prev,
                      telegram: validateTelegram(val),
                    }));
                    const updated = { ...prefs, telegram_username: val };
                    void savePrefsToDb(updated);
                  }}
                  className={fieldErrors.telegram ? "border-destructive" : ""}
                />
                {fieldErrors.telegram && (
                  <p className="text-xs text-destructive">{fieldErrors.telegram}</p>
                )}
                <p className="text-xs text-muted-foreground">
                  {tgBotUsername ? (
                    <>
                      Щоб отримувати повідомлення —{" "}
                      <a
                        href={`https://t.me/${tgBotUsername}`}
                        target="_blank"
                        rel="noreferrer"
                        className="text-primary underline font-medium"
                      >
                        відкрийте бота
                      </a>{" "}
                      та натисніть /start.
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
                            Telegram ще не підʼєднано. Перейдіть до{" "}
                            <a href={`https://t.me/${tgBotUsername}`} target="_blank" rel="noreferrer"
                               className="underline font-medium text-orange-700 dark:text-orange-400">
                              бота
                            </a>{" "}
                            та натисніть /start, щоб отримувати повідомлення.
                          </>
                        ) : (
                          <>Telegram ще не підʼєднано. Ви не отримаєте повідомлення, поки не натиснете /start у боті.</>
                        )}
                      </span>
                    </div>
                  )}
              </div>
            )}
          </div>
          <Field label={t.borderCrossing} error={fieldErrors.border_crossing}>
            <Select
              value={form.border_crossing}
              onValueChange={(v) => {
                setForm({ ...form, border_crossing: v });
                if (fieldErrors.border_crossing) {
                  setFieldErrors((prev) => ({ ...prev, border_crossing: "" }));
                }
              }}
            >
              <SelectTrigger
                className={fieldErrors.border_crossing ? "border-destructive" : ""}
              >
                <SelectValue placeholder={t.selectBorder} />
              </SelectTrigger>
              <SelectContent>
                {t.borders.map((b) => (
                  <SelectItem key={b} value={b}>
                    {b}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </Field>
        </Section>

        <Section title={t.vinList}>
          <div className="flex gap-2 items-center overflow-x-auto pb-1">
            {form.vin_last4.map((vin, i) => {
              const allPhotosReady = !isResubmit && PHOTO_CATEGORIES.every(c => (photos[i]?.[c.key]?.length ?? 0) === c.count);
              return (
                <button key={i} type="button"
                  onClick={() => setActiveCarIndex(i)}
                  className={`flex-shrink-0 flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm font-medium border transition-colors ${
                    activeCarIndex === i
                      ? "bg-primary text-primary-foreground border-primary"
                      : "bg-secondary border-transparent"
                  }`}>
                  {allPhotosReady && <Check className="size-3.5" />}
                  Авто {i + 1}{vin.length === 4 ? ` · ${vin}` : ""}
                </button>
              );
            })}
            <button type="button" onClick={() => { addVin(); setActiveCarIndex(form.vin_last4.length); }}
              className="flex-shrink-0 flex items-center gap-1 px-3 py-1.5 rounded-lg text-sm border border-dashed border-border hover:border-primary/50 transition-colors">
              <Plus className="size-3.5" /> {t.addVin}
            </button>
          </div>

          <div className="space-y-4 pt-2">
            <div className="flex gap-2 items-center">
              <div className="flex-1">
                {isResubmit && activeCarIndex < (originalData?.vin_last4?.length ?? 0) && !rejectedVinIndices.includes(activeCarIndex) ? (
                  <div>
                    <div className="text-xs text-muted-foreground mb-1">Останні 4 цифри VIN</div>
                    <div className="font-mono text-lg tracking-widest px-3 py-2 rounded-md bg-muted text-muted-foreground">
                      {form.vin_last4[activeCarIndex] || "—"}
                    </div>
                  </div>
                ) : (
                  <>
                    <Label className="text-xs text-muted-foreground mb-1 block">Останні 4 цифри VIN</Label>
                    <Input inputMode="numeric" pattern="\d{4}" maxLength={4} placeholder="0000"
                      value={form.vin_last4[activeCarIndex] ?? ""}
                      onChange={(e) => setVin(activeCarIndex, e.target.value)}
                      className={isResubmit && rejectedVinIndices.includes(activeCarIndex) ? "border-destructive" : undefined} />
                  </>
                )}
              </div>
              {form.vin_last4.length > 1 && (!isResubmit || activeCarIndex >= (originalData?.vin_last4?.length ?? 0)) && (
                <Button type="button" variant="ghost" size="icon" className="mt-5"
                  onClick={() => { removeVin(activeCarIndex); setActiveCarIndex((i) => Math.max(0, i - 1)); }}>
                  <X className="size-4" />
                </Button>
              )}
            </div>

            {isResubmit ? (
              PHOTO_CATEGORIES.map((c) => {
                const originalVinCount = originalData?.vin_last4?.length ?? 0;
                const isNewVin = activeCarIndex >= originalVinCount;
                const rejInCat = rejected.filter((r) => r.vin_index === activeCarIndex && r.category === c.key);
                if (!isNewVin && !rejInCat.length) {
                  const approvedInCat = approved.filter(
                    (p) => p.vin_index === activeCarIndex && p.category === c.key
                  );
                  if (!approvedInCat.length) return null;
                  return (
                    <div key={c.key} className="rounded-xl border-2 border-green-500/40 bg-green-500/5 p-3">
                      <div className="flex items-center gap-2 mb-2">
                        <Check className="size-4 text-green-600" />
                        <span className="text-sm font-medium text-green-700 dark:text-green-400">
                          {getCategoryLabel(t, c.key)}
                        </span>
                      </div>
                      <div className="grid grid-cols-4 gap-1.5">
                        {approvedInCat.map((p, i) => (
                          <img key={i} src={p.signed_url ?? ""} alt=""
                               className="aspect-square w-full object-cover rounded-lg border border-green-500/40" />
                        ))}
                      </div>
                    </div>
                  );
                }
                return (
                  <PhotoSlot key={c.key} vinIndex={activeCarIndex} category={c.key}
                    label={getCategoryLabel(t, c.key)}
                    count={isNewVin ? c.count : rejInCat.length}
                    files={photos[activeCarIndex]?.[c.key] ?? []}
                    required={true}
                    subSlots={c.subSlots}
                    templateSrc={TEMPLATE_PHOTOS[c.key]}
                    rejectedItems={isNewVin ? [] : rejInCat.map((r) => ({ id: r.id, signed_url: r.signed_url, comment: r.comment }))}
                    approvedItems={isNewVin ? [] : approved
                      .filter((p) => p.vin_index === activeCarIndex && p.category === c.key)
                      .map((p) => ({ signed_url: p.signed_url ?? "" }))}
                    onChange={(files) => handlePhotos(activeCarIndex, c.key, files)} />
                );
              })
            ) : (
              PHOTO_CATEGORIES.map((c) => (
                <PhotoSlot key={c.key} vinIndex={activeCarIndex} category={c.key}
                  label={getCategoryLabel(t, c.key)} count={c.count}
                  files={photos[activeCarIndex]?.[c.key] ?? []}
                  required={true} rejectedItems={[]}
                  subSlots={c.subSlots}
                  templateSrc={TEMPLATE_PHOTOS[c.key]}
                  onChange={(files) => handlePhotos(activeCarIndex, c.key, files)} />
              ))
            )}
          </div>
        </Section>

        <Button type="submit" size="lg" className="w-full" disabled={submitting}>
          {submitting ? (
            <>
              <Loader2 className="size-4 mr-2 animate-spin" /> {t.submitting}
            </>
          ) : isResubmit ? (
            t.resubmit
          ) : (
            t.submit
          )}
        </Button>
      </form>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="bg-card border border-border rounded-2xl p-4 space-y-3 shadow-sm">
      <h2 className="font-semibold text-sm uppercase tracking-wide text-muted-foreground">
        {title}
      </h2>
      <div className="space-y-3">{children}</div>
    </section>
  );
}

function Field({
  label,
  error,
  children,
}: {
  label: string;
  error?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-1.5" data-field-error={error ? "true" : undefined}>
      <Label className="text-sm">{label}</Label>
      {children}
      {error && <p className="text-xs text-destructive">{error}</p>}
    </div>
  );
}

function PhotoSlot({
  label,
  count,
  files,
  onChange,
  required,
  rejectedItems,
  approvedItems,
  vinIndex,
  category,
  subSlots,
  templateSrc,
}: {
  category: string;
  label: string;
  count: number;
  files: File[];
  required: boolean;
  rejectedItems?: { id: string; signed_url: string | null; comment: string | null }[];
  approvedItems?: { signed_url: string }[];
  onChange: (files: File[]) => void;
  vinIndex: number;
  subSlots?: readonly string[];
  templateSrc?: string;
}) {
  const { t } = useLanguage();
  const id = `photo-${vinIndex}-${category}`;
  return (
    <div
      className={`rounded-xl border-2 border-dashed p-3 transition-colors ${
        required ? "border-border" : "border-border/50 opacity-60"
      } ${files.length === count ? "border-success bg-success/5" : ""}`}
    >
      <div className="flex items-center justify-between mb-2">
        <Label htmlFor={id} className="text-sm font-medium">
          {label}
        </Label>
        {files.length === count && <Check className="size-4 text-success" />}
      </div>
      {templateSrc && !subSlots && (
        <details className="mb-2">
          <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary select-none">
            📷 Приклад фото
          </summary>
          <img src={templateSrc} alt="Приклад" className="mt-1.5 w-full rounded-lg object-cover aspect-video" />
        </details>
      )}
      {approvedItems && approvedItems.length > 0 && (
        <div className="mb-2">
          <p className="text-[11px] text-success font-medium mb-1">Прийнято</p>
          <div className="grid grid-cols-3 gap-2">
            {approvedItems.map((a, i) => (
              <div key={i} className="relative">
                <img src={a.signed_url} className="aspect-square w-full object-cover rounded-md border-2 border-success" alt="" />
                <span className="absolute top-0.5 right-0.5 bg-success text-white text-[9px] rounded-full px-1">✓</span>
              </div>
            ))}
          </div>
        </div>
      )}
      {rejectedItems && rejectedItems.length > 0 && (
        <div className="mb-2 grid grid-cols-3 gap-2">
          {rejectedItems.map((r) => (
            <div key={r.id} className="space-y-1">
              {r.signed_url && (
                <img
                  src={r.signed_url}
                  className="aspect-square w-full object-cover rounded-md border-2 border-destructive"
                  alt=""
                />
              )}
              {r.comment && (
                <p className="text-destructive text-[11px] leading-tight">{r.comment}</p>
              )}
            </div>
          ))}
        </div>
      )}
      {subSlots ? (
        <div className="space-y-2">
          {(() => {
            const editableCount =
              rejectedItems && rejectedItems.length > 0 ? rejectedItems.length : subSlots.length;
            return subSlots.map((slotName, i) => {
            if (i >= editableCount) {
              const approved = approvedItems?.[i - editableCount];
              return (
                <div key={i} className="rounded-lg border border-green-500/40 bg-green-500/5 p-2">
                  <div className="flex items-center justify-between mb-1">
                    <span className="text-xs font-medium">{slotName}</span>
                    <Check className="size-3.5 text-green-600" />
                  </div>
                  {approved?.signed_url && (
                    <img
                      src={approved.signed_url}
                      alt=""
                      className="w-full aspect-video object-cover rounded"
                    />
                  )}
                </div>
              );
            }
            const subId = `${id}-sub-${i}`;
            const hasFile = !!files[i];
            const subTemplate =
              category === "van_corners"
                ? `/templates/corner_${i}.jpeg`
                : category === "documents"
                ? `/templates/doc_${i}.jpeg`
                : undefined;
            return (
              <div key={i} className={`rounded-lg border p-2 ${hasFile ? "border-success bg-success/5" : "border-border"}`}>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-xs font-medium">{slotName}</span>
                  {hasFile && <Check className="size-3.5 text-success" />}
                </div>
                {subTemplate && (
                  <details className="mb-1.5">
                    <summary className="text-xs text-muted-foreground cursor-pointer hover:text-primary select-none">
                      📷 Приклад фото
                    </summary>
                    <img src={subTemplate} alt="Приклад" className="mt-1.5 w-full rounded-lg object-cover aspect-video" />
                  </details>
                )}
                {hasFile && (
                  <img src={URL.createObjectURL(files[i])} alt="" className="w-full aspect-video object-cover rounded mb-1.5" />
                )}
                <input id={`${subId}-camera`} type="file" accept="image/*" capture="environment" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const updated = [...files];
                    updated[i] = file;
                    onChange(updated);
                  }} />
                <input id={`${subId}-gallery`} type="file" accept="image/*" className="hidden"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const updated = [...files];
                    updated[i] = file;
                    onChange(updated);
                  }} />
                <div className="flex gap-1.5">
                  <label htmlFor={`${subId}-camera`} className="cursor-pointer flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs">
                    <Camera className="size-3.5" /> Камера
                  </label>
                  <label htmlFor={`${subId}-gallery`} className="cursor-pointer flex-1 flex items-center justify-center gap-1 py-1.5 rounded-md bg-secondary hover:bg-secondary/80 text-xs">
                    <Upload className="size-3.5" /> Галерея
                  </label>
                </div>
              </div>
            );
            });
          })()}
        </div>
      ) : (
      <>
      <input
        id={`${id}-camera`}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={count > 1}
        className="hidden"
        onChange={(e) => onChange(Array.from(e.target.files ?? []).slice(0, count))}
      />
      <input
        id={`${id}-gallery`}
        type="file"
        accept="image/*"
        multiple={count > 1}
        className="hidden"
        onChange={(e) => onChange(Array.from(e.target.files ?? []).slice(0, count))}
      />
      <div className="flex gap-2">
        <label htmlFor={`${id}-camera`} className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm">
          <Camera className="size-4" /> Камера
        </label>
        <label htmlFor={`${id}-gallery`} className="cursor-pointer flex-1 flex items-center justify-center gap-1.5 py-2.5 px-2 rounded-lg bg-secondary hover:bg-secondary/80 text-sm">
          <Upload className="size-4" /> Галерея
        </label>
      </div>
      {files.length > 0 && (
        <div className="mt-2 grid grid-cols-4 gap-1.5">
          {files.map((f, i) => (
            <div key={i} className="aspect-square rounded-md overflow-hidden bg-muted">
              <img
                src={URL.createObjectURL(f)}
                alt=""
                className="w-full h-full object-cover"
              />
            </div>
          ))}
        </div>
      )}
      </>
      )}
    </div>
  );
}