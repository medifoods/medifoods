const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        // 改行コード \n の読み込みミスを確実に防ぐ
        const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n');
        
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: privateKey,
        });
        await doc.loadInfo();

        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        const userAgg = rows.find(r => r.user_id === userId);

        if (!userAgg) throw new Error("ユーザー未登録");

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                week_no: userAgg.current_week_no || 1,
                weekly_learning_text: userAgg.weekly_learning_text || "準備中...",
                // 老眼対応：フロントへ返す際に数値を整形
                base_avg_7d: parseFloat(userAgg.base_avg_7d || 0).toFixed(1)
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: "通信エラーが発生しました。設定を確認してください。" }) };
    }
};
