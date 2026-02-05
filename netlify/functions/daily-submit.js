const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OpenAI } = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    const data = JSON.parse(event.body);
    const userId = data.user_id;
    
    // 写真データの準備
    let mealPhotos = [];
    if (data.meal_photos && Array.isArray(data.meal_photos)) {
        mealPhotos = data.meal_photos; 
    } else if (data.meal_photo) {
        mealPhotos = [data.meal_photo]; 
    }
    const tonguePhoto = data.tongue_photo; 

    // --- 1. OpenAIで解析 ---
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // AIへのメッセージ（本番用プロンプト）
    const userContent = [
      {
        type: "text",
        text: `
          あなたは臨床分子栄養療法と食薬のプロです。食事画像から栄養とアドバイスをJSONで返してください。
          【ルール】
          - 食品が写っていない場合は "食べ物ですか": false を返す。
          - 糖質80g超は「少し多め」と判断し次回控える提案をする。
          - たんぱく質15g未満は肉魚卵の追加を提案。
          - 小麦、牛乳、砂糖、加工肉、揚げ物は推奨しない。
          - 文中に「」は使わず、否定語を避け、親切なトーンで。
          - 最後に必ず「普段と変わらない食事を少しずつ健康を意識したものへと近づけ、食薬を習慣化することで元気な心と体をつくりましょう」で締める。
          
          出力JSON形式:
          {
            "食べ物ですか": true,
            "メニュー": [{"名前": "", "材料": [], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
            "健康アドバイス": "..."
          }
        `
      }
    ];

    if (mealPhotos.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "写真が届いていません" }) };
    }

    mealPhotos.forEach(photoBase64 => {
      let url = photoBase64;
      if (!url.startsWith('data:image')) {
          url = `data:image/jpeg;base64,${url}`;
      }
      userContent.push({ type: "image_url", image_url: { url: url } });
    });

    // ★本番設定：gpt-4oに戻し、JSONモードを有効化
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [{ role: "user", content: userContent }],
      response_format: { type: "json_object" }, // 必ずJSONで返す設定
      max_tokens: 1000
    });

    // ★重要：AIからの返事（生のデータ）を正しく取り出す
    if (!completion.choices || !completion.choices || !completion.choices.message) {
        throw new Error("AIからの応答が不正です。");
    }

    const aiResult = JSON.parse(completion.choices.message.content);

    // --- 2. スプレッドシートへ保存 ---
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
    });
    await doc.loadInfo();

    const logSheet = doc.sheetsByTitle['DailyLog'];
    // シート容量節約のため1枚目のみ保存
    const photoToSave = mealPhotos.length > 0 ? mealPhotos : "";

    await logSheet.addRow({
      log_id: Date.now().toString(),
      date: data.date,
      user_id: userId,
      meal_purpose: data.meal_purpose,
      meal_photo_urls: photoToSave, 
      tongue_photo_url: tonguePhoto || "",
      meal_ai_json: JSON.stringify(aiResult),
      daily_questionnaire_json: JSON.stringify(data.daily_questionnaire),
      created_at: new Date().toISOString()
    });

    // --- 3. 結果を返す ---
    if (aiResult.食べ物ですか === false) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          message_ui: "食事が確認できませんでした。食事が写っている写真で再送すると、より正確にアドバイスできます。"
        })
      };
    }

    return {
      statusCode: 200,
      body: JSON.stringify({
        status: "ok",
        meal_ai_json: aiResult
      })
    };

  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "システムエラー: " + error.message })
    };
  }
};
