const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OpenAI } = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const data = JSON.parse(event.body);
    
    // 写真チェック（ここが通ればサーバー側の問題ではない）
    let mealPhotos = data.meal_photos || [];
    if (!Array.isArray(mealPhotos)) mealPhotos = [mealPhotos];
    if (mealPhotos.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "写真が届いていません" }) };
    }

    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ★ご希望通り gpt-4o に戻しました
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "user",
          content: [
            {
              type: "text",
              text: `あなたは栄養療法のプロです。食事画像を見てJSON形式で返答してください。余計な挨拶は不要です。
              出力形式:
              {
                "食べ物ですか": true,
                "メニュー": [{"名前": "料理名", "材料": ["材料"], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
                "健康アドバイス": "150文字以内の親切なアドバイス。否定語禁止。締め文：普段と変わらない食事を少しずつ健康を意識したものへと近づけ、食薬を習慣化することで元気な心と体をつくりましょう"
              }`
            },
            ...mealPhotos.map(url => ({ type: "image_url", image_url: { url } }))
          ]
        }
      ],
      response_format: { type: "json_object" }, // JSONモードを強制
      max_tokens: 1000
    });

    const aiContent = completion.choices.message.content;
    const aiResult = JSON.parse(aiContent);

    // スプレッドシート保存
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
    });
    await doc.loadInfo();
    const sheet = doc.sheetsByTitle['DailyLog'];
    
    await sheet.addRow({
      log_id: Date.now().toString(),
      date: data.date,
      user_id: data.user_id,
      meal_purpose: data.meal_purpose,
      meal_photo_urls: mealPhotos, // 容量節約で1枚目のみ
      tongue_photo_url: data.tongue_photo || "",
      meal_ai_json: JSON.stringify(aiResult),
      daily_questionnaire_json: JSON.stringify(data.daily_questionnaire),
      created_at: new Date().toISOString()
    });

    // 食べ物でない場合
    if (aiResult.食べ物ですか === false) {
      return {
        statusCode: 200,
        body: JSON.stringify({ message_ui: "食事が確認できませんでした。食事が写っている写真で再送すると、より正確にアドバイスできます。" })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({ status: "ok", meal_ai_json: aiResult })
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "システムエラー: " + error.message })
    };
  }
};
