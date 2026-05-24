import { createFileRoute, Navigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAuth, isStaff } from "@/hooks/use-auth";
import { t, PHOTO_CATEGORIES, type PhotoCategoryKey } from "@/lib/i18n";
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
  Plus, X, Upload, Camera, Check, Clock, AlertTriangle, Loader2,
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
    return <WaitingScreen />;
  }

  return (
    <DriverForm
      existingTrip={activeTrip && activeTrip.status === "resubmit" ? activeTrip : null}
      onDone={loadActive}
    />
  );
}

function WaitingScreen() {
  return (
    <div className="max-w-md mx-auto px-4 py-16 text-center">
      <div className="mx-auto size-20 rounded-full bg-warning/15 grid place-items-center mb-6">
        <Clock className="size-10 text-warning" />
      </div>
      <h1 className="text-2xl font-bold mb-2">{t.waitingTitle}</h1>
      <p className="text-muted-foreground">{t.waitingDesc}</p>
    </div>
  );
}

const tripSchema = z.object({
  company_name: z.string().trim().min(1).max(120),
  car_number: z.string().trim().min(1).max(30),
  trailer_number: z.string().trim().min(1).max(30),
  full_name: z.string().trim().min(1).max(120),
  passport_number: z.string().trim().min(1).max(30),
  phone: z.string().trim().min(5).max(30),
  border_crossing: z.string().trim().min(1).max(80),
  vin_last4: z.array(z.string().regex(/^\d{4}$/)).min(1).max(20),
});

type FormState = z.infer<typeof tripSchema>;

function DriverForm({
  existingTrip,
  onDone,
}: {
  existingTrip: TripRow | null;
  onDone: () => void;
}) {
  const { user } = useAuth();
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
  const [prefs, setPrefs] = useState({
    email_notifications: true,
    telegram_notifications: true,
    telegram_username: "",
  });
  const [photos, setPhotos] = useState<Record<PhotoCategoryKey, File[]>>({
    van_overview: [],
    van_corners: [],
    vin_plate: [],
    vin_windshield: [],
    interior: [],
    cargo: [],
    documents: [],
  });
  // For resubmit: existing rejected photos info
  const [rejected, setRejected] = useState<
    { id: string; category: string; storage_path: string; comment: string | null; signed_url: string | null }[]
  >([]);
  const [submitting, setSubmitting] = useState(false);

  // Load profile prefs once
  useEffect(() => {
    if (!user) return;
    void (async () => {
      const { data } = await supabase
        .from("profiles")
        .select("email_notifications, telegram_notifications, telegram_username")
        .eq("id", user.id)
        .maybeSingle();
      if (data) {
        setPrefs({
          email_notifications: data.email_notifications ?? true,
          telegram_notifications: data.telegram_notifications ?? true,
          telegram_username: data.telegram_username ?? "",
        });
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
      }
      const { data: rj } = await supabase
        .from("trip_photos")
        .select("id,category,storage_path,comment")
        .eq("trip_id", existingTrip.id)
        .eq("status", "rejected");
      const enriched = await Promise.all(
        (rj ?? []).map(async (p) => {
          const { data } = await supabase.storage
            .from("trip-photos")
            .createSignedUrl(p.storage_path, 60 * 60);
          return { ...p, signed_url: data?.signedUrl ?? null };
        }),
      );
      setRejected(enriched);
    })();
  }, [existingTrip]);

  function setVin(i: number, v: string) {
    setForm((f) => {
      const copy = [...f.vin_last4];
      copy[i] = v.replace(/\D/g, "").slice(0, 4);
      return { ...f, vin_last4: copy };
    });
  }

  function addVin() {
    setForm((f) => ({ ...f, vin_last4: [...f.vin_last4, ""] }));
  }
  function removeVin(i: number) {
    setForm((f) => ({ ...f, vin_last4: f.vin_last4.filter((_, idx) => idx !== i) }));
  }

  function handlePhotos(cat: PhotoCategoryKey, files: FileList | null, max: number) {
    if (!files) return;
    const arr = Array.from(files).slice(0, max);
    setPhotos((p) => ({ ...p, [cat]: arr }));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!user) return;

    const parsed = tripSchema.safeParse(form);
    if (!parsed.success) {
      toast.error("Заповніть усі поля коректно");
      return;
    }

    // For NEW trip, require all category counts; for resubmit only require categories with rejected photos
    if (!existingTrip) {
      for (const c of PHOTO_CATEGORIES) {
        if (photos[c.key].length !== c.count) {
          toast.error(`${c.label}: завантажте ${c.count} фото`);
          return;
        }
      }
    } else {
      const requiredCats = new Set(rejected.map((r) => r.category));
      for (const c of PHOTO_CATEGORIES) {
        if (!requiredCats.has(c.key)) continue;
        const needed = rejected.filter((r) => r.category === c.key).length;
        if (photos[c.key].length !== needed) {
          toast.error(`${c.label}: завантажте ${needed} фото замість відхилених`);
          return;
        }
      }
    }

    setSubmitting(true);
    try {
      let tripId = existingTrip?.id;

      if (existingTrip) {
        // update trip data, set status back to pending
        const { error } = await supabase
          .from("trips")
          .update({
            ...parsed.data,
            status: "pending",
            admin_comment: null,
          })
          .eq("id", existingTrip.id);
        if (error) throw error;

        // Replace each rejected photo IN-PLACE: upload new file, UPDATE row, delete old storage object.
        for (const c of PHOTO_CATEGORIES) {
          const rejInCat = rejected.filter((r) => r.category === c.key);
          if (rejInCat.length === 0) continue;
          const files = photos[c.key];
          for (let i = 0; i < rejInCat.length; i++) {
            const target = rejInCat[i];
            const file = files[i];
            if (!file) continue;
            const ext = file.name.split(".").pop() || "jpg";
            const newPath = `${user.id}/${existingTrip.id}/${c.key}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("trip-photos")
              .upload(newPath, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;
            const { error: updErr } = await supabase
              .from("trip_photos")
              .update({
                storage_path: newPath,
                status: "pending",
                comment: null,
              })
              .eq("id", target.id);
            if (updErr) throw updErr;
            // best-effort delete of old file
            await supabase.storage.from("trip-photos").remove([target.storage_path]);
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

        // Upload all photos for new trip
        for (const c of PHOTO_CATEGORIES) {
          const files = photos[c.key];
          if (!files.length) continue;
          for (const file of files) {
            const ext = file.name.split(".").pop() || "jpg";
            const path = `${user.id}/${tripId}/${c.key}/${crypto.randomUUID()}.${ext}`;
            const { error: upErr } = await supabase.storage
              .from("trip-photos")
              .upload(path, file, { contentType: file.type, upsert: false });
            if (upErr) throw upErr;
            const { error: insErr } = await supabase.from("trip_photos").insert({
              trip_id: tripId!,
              category: c.key,
              storage_path: path,
              status: "pending",
            });
            if (insErr) throw insErr;
          }
        }
      }

      // Save notification preferences on the driver profile
      const cleanUsername = prefs.telegram_username
        .trim()
        .replace(/^@+/, "")
        .slice(0, 64);
      await supabase
        .from("profiles")
        .update({
          email_notifications: prefs.email_notifications,
          telegram_notifications: prefs.telegram_notifications,
          telegram_username: cleanUsername || null,
        })
        .eq("id", user.id);

      toast.success("Поїздку надіслано на перевірку");
      onDone();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Помилка надсилання";
      toast.error(msg);
    } finally {
      setSubmitting(false);
    }
  }

  const isResubmit = !!existingTrip;
  const rejectedCountByCat = rejected.reduce<Record<string, number>>((acc, r) => {
    acc[r.category] = (acc[r.category] ?? 0) + 1;
    return acc;
  }, {});
  const rejectedByCatList = rejected.reduce<Record<string, typeof rejected>>((acc, r) => {
    (acc[r.category] ||= []).push(r);
    return acc;
  }, {});

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
        <Section title="Дані рейсу">
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
          <Field label={t.fullName}>
            <Input
              required
              value={form.full_name}
              onChange={(e) => setForm({ ...form, full_name: e.target.value })}
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
            <Field label={t.phone}>
              <Input
                required
                type="tel"
                value={form.phone}
                onChange={(e) => setForm({ ...form, phone: e.target.value })}
              />
            </Field>
          </div>
          <Field label={t.borderCrossing}>
            <Select
              value={form.border_crossing}
              onValueChange={(v) => setForm({ ...form, border_crossing: v })}
            >
              <SelectTrigger>
                <SelectValue placeholder="Оберіть пункт" />
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
          <div className="space-y-2">
            {form.vin_last4.map((v, i) => (
              <div key={i} className="flex gap-2 items-center">
                <span className="text-sm text-muted-foreground w-6">{i + 1}.</span>
                <Input
                  inputMode="numeric"
                  pattern="\d{4}"
                  maxLength={4}
                  placeholder="0000"
                  required
                  value={v}
                  onChange={(e) => setVin(i, e.target.value)}
                />
                {form.vin_last4.length > 1 && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="icon"
                    onClick={() => removeVin(i)}
                  >
                    <X className="size-4" />
                  </Button>
                )}
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addVin}>
              <Plus className="size-4 mr-1" /> {t.addVin}
            </Button>
          </div>
        </Section>

        <Section title={t.photos}>
          <div className="space-y-4">
            {PHOTO_CATEGORIES.map((c) => {
              const rejectedInCat = rejectedByCatList[c.key] ?? [];
              const needed = !isResubmit || rejectedInCat.length > 0;
              const requiredCount = isResubmit ? rejectedInCat.length : c.count;
              if (isResubmit && rejectedInCat.length === 0) return null;
              return (
                <PhotoSlot
                  key={c.key}
                  category={c.key}
                  label={c.label}
                  count={requiredCount}
                  files={photos[c.key]}
                  required={needed}
                  rejectedItems={rejectedInCat.map((r) => ({
                    id: r.id,
                    signed_url: r.signed_url,
                    comment: r.comment,
                  }))}
                  onChange={(files) => handlePhotos(c.key, files, c.count)}
                />
              );
            })}
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

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="space-y-1.5">
      <Label className="text-sm">{label}</Label>
      {children}
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
}: {
  category: string;
  label: string;
  count: number;
  files: File[];
  required: boolean;
  rejectedItems?: { id: string; signed_url: string | null; comment: string | null }[];
  onChange: (files: FileList | null) => void;
}) {
  const id = `photo-${label}`;
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
      <input
        id={id}
        type="file"
        accept="image/*"
        capture="environment"
        multiple={count > 1}
        className="hidden"
        onChange={(e) => onChange(e.target.files)}
      />
      <Label
        htmlFor={id}
        className="cursor-pointer flex items-center justify-center gap-2 py-3 px-3 rounded-lg bg-secondary hover:bg-secondary/80 text-sm"
      >
        <Camera className="size-4" />
        {files.length > 0
          ? `Обрано: ${files.length} / ${count}`
          : `${t.uploadPhotos} (${count})`}
      </Label>
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
    </div>
  );
}