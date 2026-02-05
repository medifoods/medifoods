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

    // AIへのメッセージ（gpt-4o-mini用に最適化）
    const userContent = [
      {
        type: "text",
        text: `
          あなたは栄養療法のプロです。食事画像を見て、以下のJSON形式【のみ】で返答してください。
          余計な挨拶やマークダウン（\`\`\`jsonなど）は不要です。
          
          出力形式:
          {
            "食べ物ですか": true,
            "メニュー": [{"名前": "料理名", "材料": ["材料"], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
            "健康アドバイス": "150文字以内の親切なアドバイス。否定語禁止。締め文：普段と変わらない食事を少しずつ健康を意識したものへと近づけ、食薬を習慣化することで元気な心と体をつくりましょう"
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

    // ★重要変更：モデルをminiにして高速化（タイムアウト回避）
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: userContent }],
      max_tokens: 1000
    });

    // AIからの返答チェック
    if (!completion.choices || !completion.choices || !completion.choices.message) {
        throw new Error("AIからの応答が空でした。通信環境を確認してください。");
    }

    let content = completion.choices.message.content;
    
    // ★防御策：AIが ```json ... ``` で返してきても強制的に削除して読み込む
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let aiResult;
    try {
        aiResult = JSON.parse(content);
    } catch (e) {
        // 万が一JSONが壊れていても、無理やり表示する（エラーで止めない）
        console.error("JSON Parse Fail:", content);
        aiResult = {
            "食べ物ですか": true,
            "メニュー": [{"名前": "解析エラー", "材料": [], "糖質":0, "食物繊維":0, "カロリー":0, "脂質":0, "タンパク質":0}],
            "健康アドバイス": "申し訳ありません。AIの解析結果を読み取れませんでした。\n生データ: " + content
        };
    }

    // --- 2. スプレッドシートへ保存 ---
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
    });
    await doc.loadInfo();

    const logSheet = doc.sheetsByTitle['DailyLog'];
    const photoToSave = mealPhotos.length > 0 ? mealPhotos : ""; // 容量削減のため1枚目のみ

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
