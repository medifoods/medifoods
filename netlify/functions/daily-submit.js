const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OpenAI } = require('openai');
const querystring = require('querystring');

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

exports.handler = async (event) => {
    if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };
    
    try {
        const data = querystring.parse(event.body);
        const userId = data.user_id || "U12345";
        const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
        
        await doc.useServiceAccountAuth({
            client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
            private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
        });
        await doc.loadInfo();

        // 1. AIによる食事解析（PromptDBの内容を使用）
        const response = await openai.chat.completions.create({
            model: "gpt-4o",
            messages: [
                { role: "system", content: "あなたは食薬アドバイザーです。料理を特定し、カロリー、タンパク質、脂質、炭水化物、食物繊維、糖質をJSONで返してください。" },
                { role: "user", content: "この食事を解析して。改行なしのアドバイスも含めて。" }
            ],
            response_format: { type: "json_object" }
        });
        const aiResult = JSON.parse(response.choices.message.content);

        const today = new Date().toLocaleDateString('ja-JP');
        const logId = Date.now().toString();

        // 2. DailyAnswersシートへの書き込み（DailyCalcへの自動連動用）
        const ansSheet = doc.sheetsByTitle['DailyAnswers'];
        await ansSheet.addRow({
            log_id: logId,
            date: today,
            user_id: userId,
            meal_purpose: data.meal_purpose,
            Q1: data.Q1 === 'on' ? 1 : 0, // チェックボックスを数値に変換
            Q2: data.Q2 === 'on' ? 1 : 0,
            Q3: data.Q3 === 'on' ? 1 : 0,
            // ...Q10までシートのヘッダーに合わせて追加
        });

        // 3. DailyLogシートへの書き込み（生ログ保存用）
        const logSheet = doc.sheetsByTitle['DailyLog'];
        await logSheet.addRow({
            log_id: logId,
            date: today,
            user_id: userId,
            meal_purpose: data.meal_purpose,
            meal_ai_json: JSON.stringify(aiResult),
            advice_daily_final: aiResult.健康アドバイス || "解析完了しました"
        });

        return {
            statusCode: 200,
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ message: "Success", result: aiResult })
        };
    } catch (error) {
        console.error("Submit Error:", error);
        return { 
            statusCode: 500, 
            headers: { "Access-Control-Allow-Origin": "*" },
            body: JSON.stringify({ error: error.message }) 
        };
    }
};
