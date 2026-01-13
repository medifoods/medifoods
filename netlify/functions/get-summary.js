const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    // URLからユーザーIDを取得。無ければ U12345 を使用
    const userId = event.queryStringParameters.user_id || "U12345";
    
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        // 集計用の 'Agg' シートからデータを読み込む
        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        // user_id列とURLのIDを照合
        const userAgg = rows.find(r => r.user_id === userId);

        if (!userAgg) {
            throw new Error("User Not Found in Agg sheet");
        }

        return {
            statusCode: 200,
            headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*"
            },
            body: JSON.stringify({
                week_no: userAgg.current_week_no || 1,
                weekly_learning_text: userAgg.weekly_learning_text || "今週も頑張りましょう！",
                char_status_logic: userAgg.char_status_logic || "NORMAL"
            })
        };
    } catch (error) {
        console.error("API Error:", error);
        return {
            statusCode: 500,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message })
        };
    }
};
};
