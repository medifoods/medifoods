const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id;

    try {
        // スプレッドシートの初期化 [5, 6]
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });

        await doc.loadInfo();
        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();

        // 該当ユーザーの行を探す [7]
        const userRow = rows.find(r => r.user_id === userId);

        if (!userRow) {
            return { statusCode: 404, body: JSON.stringify({ message: "User not found" }) };
        }

        // グラフに必要な数値だけを返す
        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                base_avg_7d: parseFloat(userRow.base_avg_7d || 0),
                base_avg_all: parseFloat(userRow.base_avg_all || 0),
                week_no: userRow.current_week_no
            })
        };
    } catch (error) {
        return { statusCode: 500, body: error.toString() };
    }
};
