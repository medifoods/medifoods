const { GoogleSpreadsheet } = require('google-spreadsheet');
const querystring = require('querystring');

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
        const data = querystring.parse(event.body);

        // スプレッドシートの列名（ヘッダー）と一致させて追加
        await sheet.addRow({
            user_id: data.user_id,
            display_name: data.display_name,
            birth_date: data.birth_date,
            gender: data.gender,
            start_date: data.start_date,
            group_code: data.group_code || "一般",
            // week_no, day_no はスプレッドシートの数式で自動計算されるため空欄でOK
            character_name: "ライオン",
            current_status: "NORMAL",
            daily_enabled: "TRUE",
            weekly_enabled: "TRUE",
            notes: data.notes
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Success", user_id: data.user_id })
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
