const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        // 1. スプレッドシートの初期化とデータ取得 [1, 2]
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        const userRow = rows.find(r => r.user_id === userId);

        // 2. AIへの依頼（プロンプトに禁止食材ルールを適用） [3, 4]
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "あなたは食薬アドバイザーです。小麦・砂糖・揚げ物・乳製品・加工肉は一切使いません。回答は必ずJSON形式のみで行ってください。" },
                { role: "user", content: `以下の状況に基づき、来週の【献立3つ】【買い物リスト】【簡単レシピ1つ】【総合アドバイス】を生成して。
                状況：週次判定キー=${userRow.weekly_bucket}、今週の学び=${userRow.weekly_learning_text}` }
            ],
            response_format: { type: "json_object" }
        });

        const plan = JSON.parse(aiResponse.choices.message.content);

        // 3. WeeklyLogシートへ結果を保存 [5, 6]
        const weeklyLogSheet = doc.sheetsByTitle['WeeklyLog'];
        await weeklyLogSheet.addRow({
            user_id: userId,
            week_no: userRow.current_week_no,
            weekly_plan_json: JSON.stringify(plan),
            created_at: new Date().toLocaleString("ja-JP")
        });

        return {
            statusCode: 200,
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(plan)
        };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
