const { google } = require("googleapis");

exports.handler = async () => {
  try {
    const SPREADSHEET_ID = process.env.SPREADSHEET_ID;
    const SA_JSON = process.env.GOOGLE_SERVICE_ACCOUNT_JSON;

    if (!SPREADSHEET_ID) throw new Error("SPREADSHEET_ID is missing");
    if (!SA_JSON) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON is missing");

    const sa = JSON.parse(SA_JSON);

    const auth = new google.auth.JWT(
      sa.client_email,
      null,
      sa.private_key,
      ["https://www.googleapis.com/auth/spreadsheets.readonly"]
    );

    const sheets = google.sheets({ version: "v4", auth });

    const res = await sheets.spreadsheets.values.get({
      spreadsheetId: SPREADSHEET_ID,
      range: "DailyLog!A:C",
    });

    const rows = res.data.values || [];
    const count = Math.max(0, rows.length - 1); // 1行目がヘッダー想定なら -1

    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        ok: true,
        rows_total: rows.length,
        rows_data_count_guess: count,
        last_row: rows[rows.length - 1] || null
      }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
