// Server-only helpers. Imported only by *.functions.ts and server routes.
import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/integrations/supabase/types";

export function appUrl(): string {
  return "https://trans-ua-buddy.lovable.app";
}

export function botUsername(): string {
  return process.env.TELEGRAM_BOT_USERNAME ?? "";
}

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

export function renderApprovedEmail(fullName: string, driverLink?: string) {
  const link = driverLink || `${appUrl()}/driver`;
  return `
    <div style="font-family:Arial,sans-serif;max-width:560px;margin:0 auto;padding:24px;color:#111">
      <h2 style="margin:0 0 12px">Вашу поїздку затверджено ✅</h2>
      <p>Вітаємо, ${escapeHtml(fullName)}!</p>
      <p>Адміністратор перевірив і затвердив вашу поїздку. Можете вирушати.</p>
      <p style="margin-top:24px">
        <a href="${link}"
           style="display:inline-block;background:#16a34a;color:#fff;text-decoration:none;
                  padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
          Відкрити VanLink →
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin-top:32px">VanLink</p>
    </div>`;
}

export function renderRejectedEmail(opts: {
  fullName: string;
  adminComment: string;
  rejected: { category: string; comment: string | null }[];
  driverLink?: string;
}) {
  const items = opts.rejected
    .map(
      (r) =>
        `<li><b>${escapeHtml(categoryLabel(r.category))}</b>${
          r.comment ? ` — ${escapeHtml(r.comment)}` : ""
        }</li>`,
    )
    .join("");
  const link = opts.driverLink || `${appUrl()}/driver`;
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
      <p>Будь ласка, завантажте нові фото для зазначених позицій.</p>
      <p style="margin-top:24px">
        <a href="${link}"
           style="display:inline-block;background:#2563eb;color:#fff;text-decoration:none;
                  padding:12px 24px;border-radius:8px;font-weight:600;font-size:14px">
          Завантажити нові фото →
        </a>
      </p>
      <p style="color:#666;font-size:12px;margin-top:32px">VanLink</p>
    </div>`;
}

export function renderApprovedTelegram(fullName: string, driverLink?: string) {
  const link = driverLink || `${appUrl()}/driver`;
  return (
    `✅ <b>Вашу поїздку затверджено</b>\n\n` +
    `Вітаємо, ${escapeHtml(fullName)}! Можете вирушати.` +
    `\n\n👉 <a href="${link}">Відкрити VanLink</a>`
  );
}

export function renderRejectedTelegram(opts: {
  fullName: string;
  adminComment: string;
  rejected: { category: string; comment: string | null }[];
  driverLink?: string;
}) {
  const items = opts.rejected
    .map(
      (r) =>
        `• <b>${escapeHtml(categoryLabel(r.category))}</b>${
          r.comment ? ` — ${escapeHtml(r.comment)}` : ""
        }`,
    )
    .join("\n");
  const link = opts.driverLink || `${appUrl()}/driver`;
  return (
    `⚠️ <b>Потрібно перезавантажити фото</b>\n\n` +
    `${escapeHtml(opts.fullName)}, адміністратор повернув поїздку на доопрацювання.\n\n` +
    `Відхилені фото:\n${items}` +
    (opts.adminComment ? `\n\n💬 <i>${escapeHtml(opts.adminComment)}</i>` : "") +
    `\n\n👉 <a href="${link}">Перейти до застосунку</a>`
  );
}

function escapeHtml(s: string) {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}