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

        // Usersシートから直接そのユーザーの情報を探す
        const userSheet = doc.sheetsByTitle['Users'];
        const rows = await userSheet.getRows();
        const user = rows.find(r => r.user_id === userId);

        if (!user) throw new Error("User Not Found");

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({
                week_no: user.week_no || 1,
                character_name: user.character_name || "ライオン",
                current_status: user.current_status || "NORMAL"
            })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
