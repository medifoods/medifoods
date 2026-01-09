const { google } = require("googleapis");

function getServiceAccount() {
  const raw = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;
  if (!raw) throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_JSON");

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

exports.handler = async () => {
  try {
    const sheetId = process.env.GOOGLE_SHEET_ID;
    if (!sheetId) throw new Error("Missing GOOGLE_SHEET_ID");

    const sheets = await getSheetsClient();

    // DailyLog の A:C を読み取り（まずはテスト）
    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: sheetId,
      range: "DailyLog!A:C",
    });

    const values = res.data.values || [];
    const header = values[0] || [];
    const rows = values.slice(1);

    // 最新5件を返す（空なら空でOK）
    const last5 = rows.slice(-5);

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        totalRows: rows.length,
        header,
        last5,
      }),
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
