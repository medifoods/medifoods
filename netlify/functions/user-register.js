const { GoogleSpreadsheet } = require('google-spreadsheet');
const querystring = require('querystring');

exports.handler = async (event) => {
    // CORS対応（外部からのリクエストを許可）
    if (event.httpMethod === "OPTIONS") {
        return { statusCode: 200, headers: { "Access-Control-Allow-Origin": "*", "Access-Control-Allow-Headers": "Content-Type" } };
    }
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    
    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            // 改行コードの修正を確実に行う [4, 5]
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        const sheet = doc.sheetsByTitle['Users'];
        const data = querystring.parse(event.body);

        // スプレッドシートのヘッダー名と完全に一致させる [3, 6]
        // week_no と day_no は ARRAYFORMULA に任せるため、ここには記述しません
        await sheet.addRow({
            user_id: data.user_id,
            display_name: data.display_name,
            birth_date: data.birth_date,
            gender: data.gender,
            start_date: data.start_date,
            group_code: data.group_code || "一般",
            character_name: "ライオン",
            current_status: "NORMAL",
            daily_enabled: "TRUE",
            weekly_enabled: "TRUE",
            notes: data.notes
        });

        return {
            statusCode: 200,
            headers: { 
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*" // 画面遷移をスムーズにするための許可
            },
            body: JSON.stringify({ message: "Success", user_id: data.user_id })
        };
    } catch (error) {
        console.error("Error details:", error); // Netlifyのログでエラーを確認できるようにする
        return { 
            statusCode: 500, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }) 
        };
    }
};
