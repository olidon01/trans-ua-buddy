// Server-only helpers. Imported only by *.functions.ts and server routes.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

const CATEGORY_LABELS: Record<string, string> = {
  van_overview: "Огляд фургона",
  van_corners: "Кути фургона",
  vin_plate: "VIN-табличка",
  vin_windshield: "VIN під лобовим склом",
  interior: "Салон",
  cargo: "Вантажний відсік",
  documents: "Документи",
};

export function adminClient() {
  return createClient<Database>(
    process.env.SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } },
  );
}

export async function sendResendEmail(opts: {
  to: string;
  subject: string;
  html: string;
}) {
  const key = process.env.RESEND_API_KEY;
  if (!key) throw new Error("RESEND_API_KEY not configured");
  const res = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: "VanLink <onboarding@resend.dev>",
      to: [opts.to],
      subject: opts.subject,
      html: opts.html,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Resend error ${res.status}: ${txt}`);
  }
}

export async function sendTelegramMessage(chatId: number | string, text: string) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error("TELEGRAM_BOT_TOKEN not configured");
  const res = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      chat_id: chatId,
      text,
      parse_mode: "HTML",
      disable_web_page_preview: true,
    }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Telegram error ${res.status}: ${txt}`);
  }
}

export function categoryLabel(key: string): string {
  return CATEGORY_LABELS[key] ?? key;
}

export function renderApprovedEmail(fullName: string) {
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Вашу поїздку затверджено ✅</h2>
      <p>Вітаємо, ${escapeHtml(fullName)}!</p>
      <p>Адміністратор перевірив і затвердив вашу поїздку. Можете вирушати.</p>
      <p style="color:#666;font-size:12px;margin-top:32px">VanLink</p>
    </div>`;
}

export function renderRejectedEmail(opts: {
  fullName: string;
  adminComment: string;
  rejected: { category: string; comment: string | null }[];
}) {
  const items = opts.rejected
    .map(
      (r) =>
        `<li><b>${escapeHtml(categoryLabel(r.category))}</b>${
          r.comment ? ` — ${escapeHtml(r.comment)}` : ""
        }</li>`,
    )
    .join("");
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Потрібно перезавантажити фото</h2>
      <p>Вітаємо, ${escapeHtml(opts.fullName)}.</p>
      <p>Адміністратор повернув вашу поїздку на доопрацювання:</p>
      <blockquote style="border-left:3px solid #e11d48;padding:8px 12px;color:#555;margin:12px 0">
        ${escapeHtml(opts.adminComment)}
      </blockquote>
      <p>Відхилені фото:</p>
      <ul>${items}</ul>
      <p>Будь ласка, відкрийте застосунок і завантажте нові фото для зазначених позицій.</p>
      <p style="color:#666;font-size:12px;margin-top:32px">VanLink</p>
    </div>`;
}

export function renderApprovedTelegram(fullName: string) {
  return `✅ <b>Вашу поїздку затверджено</b>\n\nВітаємо, ${escapeHtml(fullName)}! Можете вирушати.`;
}

export function renderRejectedTelegram(opts: {
  fullName: string;
  adminComment: string;
  rejected: { category: string; comment: string | null }[];
}) {
  const items = opts.rejected
    .map(
      (r) =>
        `• <b>${escapeHtml(categoryLabel(r.category))}</b>${
          r.comment ? ` — ${escapeHtml(r.comment)}` : ""
        }`,
    )
    .join("\n");
  return (
    `⚠️ <b>Потрібно перезавантажити фото</b>\n\n` +
    `${escapeHtml(opts.fullName)}, адміністратор повернув поїздку:\n` +
    `<i>${escapeHtml(opts.adminComment)}</i>\n\n` +
    `Відхилені фото:\n${items}`
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}