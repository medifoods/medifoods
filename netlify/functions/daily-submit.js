const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

    try {
        const body = JSON.parse(event.body);
        const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

        // 1. AI解析（食事と舌のダブル解析） [5, 6]
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "あなたは臨床分子栄養療法と食薬のプロです。小麦・砂糖・揚げ物は推奨しません。回答はJSON形式のみ。「」を使わず、最後は必ず「食薬を習慣化することで元気な心と体をつくりましょう」で締めてください。" },
                { role: "user", content: "食事写真と舌写真を解析して。形式：{meal_ai: {食べ物ですか:bool, メニュー:[], アドバイス:str}, tongue_ai: {色:str, 苔:str, メモ:str}}" }
            ],
            response_format: { type: "json_object" }
        });

        const aiResult = JSON.parse(aiResponse.choices.message.content);

        // 2. スプレッドシートへの接続と保存 [7, 8]
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        // DailyLog（生データ）への書き込み
        const logSheet = doc.sheetsByTitle['DailyLog'];
        await logSheet.addRow({
            user_id: body.user_id || "U12345",
            date: new Date().toLocaleDateString("ja-JP"),
            meal_purpose: body.meal_purpose,
            meal_ai_json: JSON.stringify(aiResult.meal_ai),
            advice_daily_final: aiResult.meal_ai.アドバイス,
            created_at: new Date().toLocaleString("ja-JP")
        });

        // DailyAnswers（採点用）への書き込み
        const ansSheet = doc.sheetsByTitle['DailyAnswers'];
        await ansSheet.addRow({
            log_id: Date.now(),
            date: new Date().toLocaleDateString("ja-JP"),
            user_id: body.user_id || "U12345",
            Q2: body.Q2 || 0, Q6: body.Q6 || 0, Q11: body.Q11 || 0,
            created_at: new Date().toLocaleString("ja-JP")
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ status: "success", advice: aiResult.meal_ai.アドバイス })
        };

    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
