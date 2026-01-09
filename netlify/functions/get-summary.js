const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n');
        await doc.useServiceAccountAuth({ client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL, private_key: privateKey });
        await doc.loadInfo();

        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        const userAgg = rows.find(r => r.user_id === userId);

        if (!userAgg) throw new Error("ユーザー未登録");

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                week_no: userAgg.current_week_no || "1",
                // ここがundefinedにならないようMessageDBのテキストを確実に返す
                weekly_learning_text: userAgg.weekly_learning_text || "今週も一歩ずつ整えましょう。",
                y_base: userAgg.y_base || "0",
                base_avg_all: userAgg.base_avg_all || "0",
                char_status_logic: parseInt(userAgg.char_status_logic) || 1
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
