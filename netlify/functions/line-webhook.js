// netlify/functions/line-webhook.js
import crypto from "crypto";

export const handler = async (event) => {
  // LINEの「検証」やブラウザ直打ち用
  if (event.httpMethod === "GET") {
    return { statusCode: 200, body: "ok" };
  }

  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  const CHANNEL_SECRET = process.env.LINE_CHANNEL_SECRET;
  const ACCESS_TOKEN = process.env.LINE_CHANNEL_ACCESS_TOKEN;

  if (!CHANNEL_SECRET || !ACCESS_TOKEN) {
    console.log("Missing env vars");
    return { statusCode: 500, body: "Missing env vars" };
  }

  const body = event.body || "";

  // 署名検証（これが通らないとLINEは正規リクエストとみなせない）
  const signature = event.headers["x-line-signature"] || event.headers["X-Line-Signature"];
  const hash = crypto.createHmac("sha256", CHANNEL_SECRET).update(body).digest("base64");

  if (hash !== signature) {
    console.log("Invalid signature");
    return { statusCode: 401, body: "Invalid signature" };
  }

  const payload = JSON.parse(body);
  const events = payload.events || [];

  // すぐ200を返す（LINE側のタイムアウト回避）
  // ただし返信も同時に投げる
  await Promise.all(
    events.map(async (ev) => {
      if (ev.type !== "message") return;
      if (ev.message?.type !== "text") return;

      const text = ev.message.text;

      // 返信API
      const res = await fetch("https://api.line.me/v2/bot/message/reply", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${ACCESS_TOKEN}`,
        },
        body: JSON.stringify({
          replyToken: ev.replyToken,
          messages: [{ type: "text", text: `受け取ったよ：${text}` }],
        }),
      });

      const t = await res.text();
      console.log("reply status:", res.status, t);
    })
  );

  return { statusCode: 200, body: "ok" };
};
