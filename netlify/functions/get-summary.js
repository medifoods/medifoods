const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        // 環境変数の秘密鍵に含まれる改行コードを正しく処理 [2]
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n');
        
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        });
        await doc.loadInfo();

        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        const userAgg = rows.find(r => r.user_id === userId);

        if (!userAgg) throw new Error("User Not Found");

        // undefinedを回避し、フロントエンドに渡す値を確定 [3]
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                week_no: userAgg.current_week_no || "1",
                weekly_learning_text: userAgg.weekly_learning_text || "今週の食薬Pointを読み込み中...",
                y_base: userAgg.y_base || "0",
                base_avg_all: userAgg.base_avg_all || "0",
                char_status_logic: parseInt(userAgg.char_status_logic) || 1 // ライオン(1)をデフォルトに
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
