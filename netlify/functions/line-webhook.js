const crypto = require("crypto");
const axios = require("axios");

function getHeader(headers, name) {
  if (!headers) return undefined;
  const lower = name.toLowerCase();
  return headers[lower] || headers[name] || headers[name.toUpperCase()];
}

function toRawBody(event) {
  const body = event.body || "";
  if (event.isBase64Encoded) {
    return Buffer.from(body, "base64").toString("utf8");
  }
  return body;
}

function verifyLineSignature(rawBody, channelSecret, signature) {
  const expected = crypto
    .createHmac("sha256", channelSecret)
    .update(rawBody)
    .digest("base64");
  return signature === expected;
}

async function replyMessage(replyToken, messages) {
  const accessToken = process.env.LINE_CHANNEL_ACCESS_TOKEN;
  if (!accessToken) {
    throw new Error("Missing env var: LINE_CHANNEL_ACCESS_TOKEN");
  }

  await axios.post(
    "https://api.line.me/v2/bot/message/reply",
    { replyToken, messages },
    {
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      timeout: 10000,
    }
  );
}

exports.handler = async (event) => {
  try {
    // GETでも落とさない（疎通確認用）
    if (event.httpMethod === "GET") {
      return { statusCode: 200, body: "OK" };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const channelSecret = process.env.LINE_CHANNEL_SECRET;
    if (!channelSecret) {
      return { statusCode: 500, body: "Missing env var: LINE_CHANNEL_SECRET" };
    }

    const rawBody = toRawBody(event);
    const signature = getHeader(event.headers, "x-line-signature");
    if (!signature) {
      return { statusCode: 400, body: "Missing header: x-line-signature" };
    }

    if (!verifyLineSignature(rawBody, channelSecret, signature)) {
      return { statusCode: 401, body: "Invalid signature" };
    }

    const payload = rawBody ? JSON.parse(rawBody) : {};
    const events = Array.isArray(payload.events) ? payload.events : [];

    // LINEの検証リクエスト等で events が空でもOK
    if (events.length === 0) {
      return { statusCode: 200, body: "OK" };
    }

    const recordUrl = process.env.RECORD_URL || ""; // 例: https://あなたのサイト/record
    const welcomeText =
      recordUrl
        ? `記録はこちらから送れます：\n${recordUrl}\n\n（例）「今日の記録」→ 食事写真・舌・目的を送信`
        : `Webhookは受け取りました。RECORD_URLを環境変数に設定すると導線を案内できます。`;

    await Promise.all(
      events.map(async (ev) => {
        if (!ev) return;

        // 友だち追加時
        if (ev.type === "follow" && ev.replyToken) {
          await replyMessage(ev.replyToken, [{ type: "text", text: welcomeText }]);
          return;
        }

        // テキストメッセージ時（通知＋導線）
        if (ev.type === "message" && ev.message && ev.message.type === "text" && ev.replyToken) {
          const text = (ev.message.text || "").trim();

          // 反応を返したい文言だけ軽く分岐（必要なら後で増やす）
          const response =
            /記録|きろく|today|今日/i.test(text)
              ? welcomeText
              : welcomeText;

          await replyMessage(ev.replyToken, [{ type: "text", text: response }]);
        }
      })
    );

    return { statusCode: 200, body: "OK" };
  } catch (err) {
    console.error("line-webhook error:", err);
    return { statusCode: 500, body: "Internal Server Error" };
  }
};
