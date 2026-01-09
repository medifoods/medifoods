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

        if (!userAgg) throw new Error("ユーザーデータが見つかりません。");

        // フロントエンドに返すデータの名前を厳密に定義
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                week_no: userAgg.current_week_no || "1",
                weekly_learning_text: userAgg.weekly_learning_text || "今週も食薬で整えましょう。",
                y_base: userAgg.y_base || "0", // 前日のスコア
                base_avg_all: userAgg.base_avg_all || "0", // 累積平均
                char_status: userAgg.char_status_logic || "NORMAL"
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
