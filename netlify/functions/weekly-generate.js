const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require("google-spreadsheet");

function mustEnv(name) {
  const v = process.env[name];
  if (!v) throw new Error(`Missing env var: ${name}`);
  return v;
}

async function getSheet(doc, title) {
  await doc.loadInfo();
  const sheet = doc.sheetsByTitle[title];
  if (!sheet) throw new Error(`Sheet not found: ${title}`);
  return sheet;
}

async function authDoc() {
  const doc = new GoogleSpreadsheet(mustEnv("SPREADSHEET_ID"));
  const svc = JSON.parse(mustEnv("GOOGLE_SERVICE_ACCOUNT_JSON"));
  const client_email = svc.client_email;
  const private_key = (svc.private_key || "").replace(/\\n/g, "\n");
  await doc.useServiceAccountAuth({ client_email, private_key });
  return doc;
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const doc = await authDoc();

    const aggTitle = process.env.AGG_SHEET_TITLE || "Agg";
    const weeklyTitle = process.env.WEEKLY_SHEET_TITLE || "WeeklyLog";

    const agg = await getSheet(doc, aggTitle);
    const weekly = await getSheet(doc, weeklyTitle);

    // 例：Aggから直近の行だけ取る（必要に応じて集計ロジックを実装）
    const rows = await agg.getRows({ limit: 7 });
    const snapshot = rows.map((r) => r._rawData);

    const openai = new OpenAI({ apiKey: mustEnv("OPENAI_API_KEY") });
    const model = process.env.OPENAI_TEXT_MODEL || "gpt-4o-mini";
    const prompt = process.env.PROMPT_WEEKLY || "Generate next week's meal plan and shopping list based on the provided snapshot.";

    const ai = await openai.chat.completions.create({
      model,
      messages: [
        { role: "system", content: prompt },
        { role: "user", content: JSON.stringify({ snapshot }) },
      ],
      temperature: 0.4,
    });

    const plan = ai.choices?.[0]?.message?.content || "";

    await weekly.addRow({
      timestamp: new Date().toISOString(),
      plan,
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "ok", plan }),
    };
  } catch (err) {
    console.error("weekly-generate error:", err);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "error", message: String(err.message || err) }),
    };
  }
};
