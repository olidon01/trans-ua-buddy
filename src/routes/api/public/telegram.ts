import { createFileRoute } from "@tanstack/react-router";
import { createHash, timingSafeEqual } from "crypto";
import { adminClient, sendTelegramMessage } from "@/lib/notifications.server";

function deriveSecret(token: string): string {
  return createHash("sha256").update(`telegram-webhook:${token}`).digest("base64url");
}

function safeEqual(a: string, b: string) {
  const l = Buffer.from(a);
  const r = Buffer.from(b);
  return l.length === r.length && timingSafeEqual(l, r);
}

export const Route = createFileRoute("/api/public/telegram")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        const token = process.env.TELEGRAM_BOT_TOKEN;
        if (!token) return new Response("Not configured", { status: 500 });

        const expected = deriveSecret(token);
        const actual = request.headers.get("X-Telegram-Bot-Api-Secret-Token") ?? "";
        if (!safeEqual(actual, expected)) {
          return new Response("Unauthorized", { status: 401 });
        }

        const update = await request.json().catch(() => null);
        const message = update?.message ?? update?.edited_message;
        const chatId = message?.chat?.id as number | undefined;
        const fromUsername = (message?.from?.username as string | undefined) ?? null;

        if (!chatId) return Response.json({ ok: true });

        const supabase = adminClient();

        // Link chat_id to a profile by telegram_username (case-insensitive)
        if (fromUsername) {
          const uname = fromUsername.replace(/^@/, "");
          // Match profiles where telegram_username equals @uname or uname (any case)
          const { data: matches } = await supabase
            .from("profiles")
            .select("id, telegram_username")
            .or(
              `telegram_username.ilike.${uname},telegram_username.ilike.@${uname}`,
            );
          if (matches && matches.length) {
            await supabase
              .from("profiles")
              .update({ telegram_chat_id: chatId })
              .in(
                "id",
                matches.map((m) => m.id),
              );
          }
        }

        const text = (message?.text as string | undefined) ?? "";
        if (text.startsWith("/start")) {
          try {
            await sendTelegramMessage(
              chatId,
              fromUsername
                ? `✅ Вітаю, @${fromUsername}! Ваш Telegram прив'язано до VanLink. Тепер ви отримуватимете сповіщення про статус поїздок.`
                : `✅ Готово. Тепер ви отримуватимете сповіщення про статус поїздок.\n\nЯкщо у вас не задано username у Telegram, відкрийте Settings → Username та повторіть /start.`,
            );
          } catch (e) {
            console.error("telegram reply failed", e);
          }
        }

        return Response.json({ ok: true });
      },
    },
  },
});