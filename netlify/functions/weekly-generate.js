const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        // 1. スプレッドシートからユーザーの最新状況を取得 [3, 4]
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();
        const aggSheet = doc.sheetsByTitle['Agg'];
        const rows = await aggSheet.getRows();
        const userRow = rows.find(r => r.user_id === userId);

        // 2. OpenAIによる週次プラン生成（ソースの厳格な禁止ルールを適用） [5, 6]
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { 
                    role: "system", 
                    content: "あなたは食薬アドバイザーです。小麦、砂糖、サラダ油、牛乳、バター、生クリーム、顆粒出汁、揚げ物、加工肉は一切使いません。回答はJSON形式のみとし、「」は使わず、最後は必ず『食薬を習慣化することで元気な心と体をつくりましょう』で締めてください。" 
                },
                { 
                    role: "user", 
                    content: `状況：週次判定キー=${userRow.weekly_bucket}、今週の学び=${userRow.weekly_learning_text}。来週の【食薬献立3つ】【買い物リスト】【簡単食薬レシピ1つ（材料と工程）】【食薬アドバイス】を生成して。` 
                }
            ],
            response_format: { type: "json_object" }
        });

        const plan = JSON.parse(aiResponse.choices.message.content);

        // 3. 週次ログに保存 [7]
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
