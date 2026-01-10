const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle['Users'];
        const data = require('querystring').parse(event.body);

        // 新規ユーザーを行として追加 [6, 8]
        await sheet.addRow({
            user_id: data.user_id,
            display_name: data.display_name,
            start_date: new Date().toISOString().split('T'), // 講座開始日 [6]
            daily_enabled: "TRUE",
            weekly_enabled: "TRUE",
            notes: `状態: ${data.health_condition}`
        });

        return { statusCode: 200, body: JSON.stringify({ message: "Success", user_id: data.user_id }) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
