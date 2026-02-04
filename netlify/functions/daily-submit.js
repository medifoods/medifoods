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

    // AIへのメッセージ（少し制限を緩めて優しくしました）
    const userContent = [
      {
        type: "text",
        text: `
          あなたは栄養療法のプロです。食事画像を見てJSON形式で返答してください。
          JSONの前後に余計な文章はつけないでください。
          
          出力形式:
          {
            "食べ物ですか": true,
            "メニュー": [{"名前": "料理名", "材料": ["材料"], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
            "健康アドバイス": "150文字以内の親切なアドバイス"
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

    // ★変更点：モデルをminiにし、JSON強制モードを外してエラー回避
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini", 
      messages: [{ role: "user", content: userContent }],
      max_tokens: 1000
    });

    // ★診断用：AIの返事が空なら、中身をそのままエラーとして表示する
    if (!completion.choices || !completion.choices || !completion.choices.message) {
        console.error("AI Response Error:", JSON.stringify(completion));
        throw new Error("AIからの返答が空です。詳細: " + JSON.stringify(completion));
    }

    let content = completion.choices.message.content;
    
    // JSON以外の文字（```json 等）が含まれていたら削除して整える
    content = content.replace(/```json/g, "").replace(/```/g, "").trim();

    let aiResult;
    try {
        aiResult = JSON.parse(content);
    } catch (e) {
        console.error("JSON Parse Error. Content:", content);
        throw new Error("AIの返答を読み取れませんでした。内容: " + content.substring(0, 50) + "...");
    }

    // --- 2. スプレッドシートへ保存 ---
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
    });
    await doc.loadInfo();

    const logSheet = doc.sheetsByTitle['DailyLog'];
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
      body: JSON.stringify({ error: "診断エラー: " + error.message })
    };
  }
};
