const { google } = require("googleapis");

function corsHeaders() {
  return {
    "Access-Control-Allow-Origin": "*",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Allow-Methods": "POST, OPTIONS",
  };
}

exports.handler = async (event) => {
  // CORS preflight
  if (event.httpMethod === "OPTIONS") {
    return { statusCode: 200, headers: corsHeaders(), body: "ok" };
  }
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, headers: corsHeaders(), body: "Method Not Allowed" };
  }

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
      ["https://www.googleapis.com/auth/spreadsheets"]
    );

    const sheets = google.sheets({ version: "v4", auth });

    const body = JSON.parse(event.body || "{}");
    const userName = (body.userName || "").toString().trim();
    const note = (body.note || "").toString().trim();

    if (!userName) throw new Error("userName is required");
    if (!note) throw new Error("note is required");

    const now = new Date();
    const iso = now.toISOString();

    // DailyLogに追記（列は必要に応じて増やせます）
    // A:timestamp, B:userName, C:note
    await sheets.spreadsheets.values.append({
      spreadsheetId: SPREADSHEET_ID,
      range: "DailyLog!A1",
      valueInputOption: "USER_ENTERED",
      insertDataOption: "INSERT_ROWS",
      requestBody: {
        values: [[iso, userName, note]],
      },
    });

    return {
      statusCode: 200,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ok: true }),
    };
  } catch (e) {
    return {
      statusCode: 500,
      headers: { ...corsHeaders(), "Content-Type": "application/json" },
      body: JSON.stringify({ ok: false, error: e.message }),
    };
  }
};
