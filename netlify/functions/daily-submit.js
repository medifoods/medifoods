const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    try {
        // 1. フロントから届いたデータを解析
        const data = JSON.parse(event.body);
        
        // 2. スプレッドシートの認証設定
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            // 改行コードの処理を含めて秘密鍵を読み込む
            private_key: process.env.GOOGLE_SERVICE_ACCOUNT_JSON.replace(/\\n/gm, "\n"),
        });

        await doc.loadInfo();
        
        // 3. DailyLogシート（追記専用ログ）への保存
        const logSheet = doc.sheetsByTitle['DailyLog'];
        await logSheet.addRow({
            log_id: `log_${Date.now()}`,
            date: new Date().toLocaleDateString('ja-JP'), // JST日付
            user_id: data.user_id,
            meal_purpose: data.meal_purpose,
            base_score: data.base_score,
            health_ratio_score: data.health_ratio_score,
            advice_daily_final: data.advice // AI生成アドバイス
        });

        return { statusCode: 200, body: JSON.stringify({ message: "Success" }) };
    } catch (e) {
        return { statusCode: 500, body: e.toString() };
    }
};
