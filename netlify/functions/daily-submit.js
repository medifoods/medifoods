const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require("google-spreadsheet");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

function parseJsonBody(event) {
  if (!event.body) return {};
  const raw = event.isBase64Encoded
    ? Buffer.from(event.body, "base64").toString("utf8")
    : event.body;
  return JSON.parse(raw);
}

async function appendRowToSheet({ spreadsheetId, sheetTitle, row }) {
  const doc = new GoogleSpreadsheet(spreadsheetId);

  // GOOGLE_SERVICE_ACCOUNT_JSON に service account JSON 全体を入れる（文字列）
  const svc = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const client_email = svc.client_email;
  const private_key = (svc.private_key || "").replace(/\\n/g, "\n");

  await doc.useServiceAccountAuth({ client_email, private_key });
  await doc.loadInfo();

  const sheet = doc.sheetsByTitle[sheetTitle];
  if (!sheet) throw new Error(`Sheet not found: ${sheetTitle}`);

  await sheet.addRow(row);
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "",
      };
    }
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const data = parseJsonBody(event);
    const imageUrl = data.image_url;

    if (!imageUrl) {
      return { statusCode: 400, body: "Missing image_url" };
    }

    const openai = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });
    const model = process.env.OPENAI_VISION_MODEL || "gpt-4o-mini";
    const systemPrompt = process.env.PROMPT_MEAL_IMAGE || "You analyze meal photos and return structured JSON.";

    // 画像解析（JSONを返す想定）
    const ai = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        {
          role: "user",
          content: [
            { type: "text", text: "Analyze this meal photo and return JSON." },
            { type: "image_url", image_url: { url: imageUrl } },
          ],
        },
      ],
      temperature: 0.2,
    });

    const aiText = ai.choices?.[0]?.message?.content || "";

    // スプレッドシート追記（必要に応じて列を増やす）
    const spreadsheetId = mustEnv("SPREADSHEET_ID");
    const sheetTitle = process.env.DAILY_SHEET_TITLE || "DailyLog";

    await appendRowToSheet({
      spreadsheetId,
      sheetTitle,
      row: {
        timestamp: new Date().toISOString(),
        image_url: imageUrl,
        purpose: data.purpose || "",
        user_id: data.user_id || "",
        ai_result: aiText,
      },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", ai_result: aiText }),
    };
  } catch (err) {
    console.error("daily-submit error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: String(err.message || err) }),
    };
  }
};

