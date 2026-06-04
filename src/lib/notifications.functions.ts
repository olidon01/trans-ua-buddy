import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import {
  adminClient,
  appUrl,
  renderApprovedEmail,
  renderApprovedTelegram,
  renderRejectedEmail,
  renderRejectedTelegram,
  sendResendEmail,
  sendTelegramMessage,
} from "./notifications.server";

const InputSchema = z.object({
  tripId: z.string().uuid(),
  kind: z.enum(["approved", "rejected"]),
});

export const notifyTrip = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => InputSchema.parse(input))
  .handler(async ({ data, context }) => {
    // Ensure caller is staff
    const { supabase, userId } = context as {
      supabase: ReturnType<typeof adminClient>;
      userId: string;
    };
    const { data: isStaffRow } = await supabase.rpc("is_staff", {
      _user_id: userId,
    });
    if (!isStaffRow) {
      throw new Response("Forbidden", { status: 403 });
    }

    const admin = adminClient();
    const { data: trip, error: tErr } = await admin
      .from("trips")
      .select("id, driver_id, full_name, admin_comment")
      .eq("id", data.tripId)
      .maybeSingle();
    if (tErr || !trip) throw new Error("Trip not found");

    const { data: profile } = await admin
      .from("profiles")
      .select("email, email_notifications, telegram_notifications, telegram_chat_id")
      .eq("id", trip.driver_id)
      .maybeSingle();
    if (!profile) return { sent: { email: false, telegram: false } };

    // Generate magic link for one-click sign-in
    let driverLink = `${appUrl()}/driver`;
    if (profile.email) {
      try {
        const { data: linkData } = await adminClient().auth.admin.generateLink({
          type: "magiclink",
          email: profile.email,
          options: { redirectTo: `${appUrl()}/driver` },
        });
        if (linkData?.properties?.action_link) {
          driverLink = linkData.properties.action_link;
        }
      } catch (e) {
        console.error("magic link generation failed, using fallback", e);
      }
    }

    let rejected: { category: string; comment: string | null }[] = [];
    if (data.kind === "rejected") {
      const { data: photos } = await admin
        .from("trip_photos")
        .select("category, comment")
        .eq("trip_id", trip.id)
        .eq("status", "rejected");
      rejected = photos ?? [];
    }

    const fullName = trip.full_name || "водію";
    const result = { email: false, telegram: false };

    // Email
    if (profile.email_notifications && profile.email) {
      try {
        if (data.kind === "approved") {
          await sendResendEmail({
            to: profile.email,
            subject: "VanLink — поїздку затверджено",
            html: renderApprovedEmail(fullName, driverLink),
          });
        } else {
          await sendResendEmail({
            to: profile.email,
            subject: "VanLink — потрібно перезавантажити фото",
            html: renderRejectedEmail({
              fullName,
              adminComment: trip.admin_comment ?? "",
              rejected,
              driverLink,
            }),
          });
        }
        result.email = true;
      } catch (e) {
        console.error("email send failed", e);
      }
    }

    // Telegram
    if (profile.telegram_notifications && profile.telegram_chat_id) {
      try {
        const text =
          data.kind === "approved"
            ? renderApprovedTelegram(fullName, driverLink)
            : renderRejectedTelegram({
                fullName,
                adminComment: trip.admin_comment ?? "",
                rejected,
                driverLink,
              });
        await sendTelegramMessage(profile.telegram_chat_id, text);
        result.telegram = true;
      } catch (e) {
        console.error("telegram send failed", e);
      }
    }

    return { sent: result };
  });