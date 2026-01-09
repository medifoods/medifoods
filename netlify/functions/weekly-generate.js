const { OpenAI } = require("openai");
const { GoogleSpreadsheet } = require('google-spreadsheet');

exports.handler = async (event) => {
    const userId = event.queryStringParameters.user_id || "U12345";
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    try {
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        // 1. 集計データと問診回答を取得 [1]
        const aggSheet = doc.sheetsByTitle['Agg'];
        const userAgg = (await aggSheet.getRows()).find(r => r.user_id === userId);
        
        const ansSheet = doc.sheetsByTitle['WeeklyAnswers'];
        const userAns = (await ansSheet.getRows()).reverse().find(r => r.user_id === userId); // 最新の回答

        // 2. A〜E, F〜Jの判定ロジック（該当が最も多いものを抽出）[4, 5]
        const getTopKey = (keys, row) => {
            const scores = keys.map(k => ({ key: k, val: parseInt(row[k] || 0) }));
            const maxVal = Math.max(...scores.map(s => s.val));
            if (maxVal === 0) return "all_zero"; // 全て0の例外 [6]
            return scores.filter(s => s.val === maxVal).map(s => s.key).join("|");
        };

        const aeResult = getTopKey(['A', 'B', 'C', 'D', 'E'], userAns);
        const fjResult = getTopKey(['F', 'G', 'H', 'I', 'J'], userAns);

        // 3. MessageDBからアドバイス本文を自動取得 [2, 3]
        const msgSheet = doc.sheetsByTitle['MessageDB'];
        const msgRows = await msgSheet.getRows();
        
        const findMsg = (type, key) => msgRows.find(r => r.type === type && r.key.includes(key))?.text || "";
        const aeAdvice = aeResult === "all_zero" ? findMsg('exception', 'all_zero_AE') : findMsg('questionnaire', aeResult);
        const fjAdvice = fjResult === "all_zero" ? findMsg('exception', 'all_zero_FJ') : findMsg('questionnaire', fjResult);

        // 4. AIに「食薬処方箋」を生成させる [3, 7]
        const aiResponse = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "あなたは食薬プロアドバイザーです。小麦、砂糖、揚げ物、加工肉、顆粒出汁は一切使用・推奨しません。「」は使わず、最後は必ず『食薬を習慣化することで元気な心と体をつくりましょう』で締めてください。[8]" },
                { role: "user", content: `状況：判定キー=${userAgg.weekly_bucket}、学び=${userAgg.weekly_learning_text}。
                以下の個別診断に基づき、来週の【食薬献立3つ】【買い物リスト】【簡単レシピ1つ】【総合アドバイス】をJSONで生成して。
                診断1：${aeAdvice} / 診断2：${fjAdvice}` }
            ],
            response_format: { type: "json_object" }
        });

        const plan = JSON.parse(aiResponse.choices.message.content);

        // 5. WeeklyLogへ保存して返却 [9, 10]
        const weeklyLogSheet = doc.sheetsByTitle['WeeklyLog'];
        await weeklyLogSheet.addRow({
            user_id: userId,
            week_no: userAgg.current_week_no,
            weekly_plan_json: JSON.stringify(plan),
            created_at: new Date().toLocaleString("ja-JP")
        });

        return { statusCode: 200, headers: { "Content-Type": "application/json" }, body: JSON.stringify(plan) };
    } catch (error) {
        return { statusCode: 500, body: JSON.stringify({ error: error.message }) };
    }
};
