const { GoogleSpreadsheet } = require("google-spreadsheet");

exports.handler = async (event) => {
  // CORS
  if (event.httpMethod === "OPTIONS") {
    return {
      statusCode: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Headers": "Content-Type, Authorization",
        "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      },
      body: "",
    };
  }

  const userId = event.queryStringParameters?.user_id || "U12345";

  try {
    if (!process.env.SPREADSHEET_ID) throw new Error("Missing env var: SPREADSHEET_ID");
    if (!process.env.GOOGLE_SERVICE_ACCOUNT_JSON) throw new Error("Missing env var: GOOGLE_SERVICE_ACCOUNT_JSON");

    const svc = JSON.parse(process.env.GOOGLE_SERVICE_ACCOUNT_JSON);

    if (!svc.client_email) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing: client_email");
    if (!svc.private_key) throw new Error("GOOGLE_SERVICE_ACCOUNT_JSON missing: private_key");

    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);

    await doc.useServiceAccountAuth({
      client_email: svc.client_email,
      private_key: String(svc.private_key).replace(/\\n/g, "\n"),
    });

    await doc.loadInfo();

    const aggSheet = doc.sheetsByTitle["Agg"];
    if (!aggSheet) throw new Error("Agg sheet not found");

    const rows = await aggSheet.getRows();
    const userAgg = rows.find((r) => String(r.user_id || "") === String(userId));

    if (!userAgg) {
      return {
        statusCode: 404,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ error: "User Not Found in Agg sheet", user_id: userId }),
      };
    }

    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({
        week_no: userAgg.current_week_no || 1,
        weekly_learning_text: userAgg.weekly_learning_text || "今週も頑張りましょう！",
        char_status_logic: userAgg.char_status_logic || "NORMAL",
      }),
    };
  } catch (error) {
    console.error("API Error:", error);
    return {
      statusCode: 500,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
      },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
