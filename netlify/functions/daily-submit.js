const { google } = require("googleapis");

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

  // Netlifyの環境変数は改行が \n になっていることが多いので戻す
  const json = JSON.parse(raw);
  if (json.private_key) {
    json.private_key = json.private_key.replace(/\\n/g, "\n");
  }
  return json;
}

async function getSheetsClient() {
  const sa = getServiceAccount();

  const auth = new google.auth.JWT({
    email: sa.client_email,
    key: sa.private_key,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });

  await auth.authorize();
  return google.sheets({ version: "v4", auth });
}

exports.handler = async (event) => {
  try {
    if (event.httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Headers": "Content-Type",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
        },
        body: "ok",
      };
    }

    if (event.httpMethod !== "POST") {
      return { statusCode: 405, body: "Method Not Allowed" };
    }

    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");

    const body = JSON.parse(event.body || "{}");

    // フォームから送る項目（必要に応じて増やせます）
    const userId = (body.userId || "").trim();
    const text = (body.text || "").trim();

    if (!text) {
      return { statusCode: 400, body: "text is required" };
    }

    const sheets = await getSheetsClient();

    // DailyLog シートに追記（A:日時 / B:userId / C:text）
    const now = new Date().toISOString();

    await sheets.spreadsheets.values.append({
      spreadsheetId: sheetId,
      range: "DailyLog!A:C",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[now, userId, text]],
      },
    });

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true, appended: { now, userId, text } }),
    };
  } catch (err) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: false,
        error: err.message || String(err),
      }),
    };
  }
};
