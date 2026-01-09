const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";

    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        // 1. Aggシートからユーザーの週数(week_no)を取得
        const aggSheet = doc.sheetsByTitle['Agg'];
        const aggRows = await aggSheet.getRows();
        const userAgg = aggRows.find(r => r.user_id === userId);

        if (!userAgg) return { statusCode: 404, body: "User not found" };

        const currentWeek = userAgg.current_week_no || 1;

        // 2. MessageDBシートから対応する週の学び文(learning)を取得
        const msgSheet = doc.sheetsByTitle['MessageDB'];
        const msgRows = await msgSheet.getRows();
        const learningMsg = msgRows.find(r => r.type === 'learning' && r.week_no == currentWeek);

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                week_no: currentWeek,
                weekly_learning_text: learningMsg ? learningMsg.text : "食薬で心と体を整えましょう。",
                base_avg_7d: parseFloat(userAgg.base_avg_7d || 0),
                base_avg_all: parseFloat(userAgg.base_avg_all || 0)
            })
        };
    } catch (error) {
        return { statusCode: 500, body: error.toString() };
    }
};
