const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OpenAI } = require('openai');

exports.handler = async (event) => {
  // 1. 通信メソッドの確認
  if (event.httpMethod !== "POST") {
    return { statusCode: 405, body: "Method Not Allowed" };
  }

  try {
    // 2. 環境変数のチェック（ここがエラーの原因でした。ガードを入れます）
    if (!process.env.GOOGLE_PRIVATE_KEY || !process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL) {
      throw new Error("Google認証情報（PRIVATE_KEY または EMAIL）がNetlifyに設定されていません。");
    }

    const data = JSON.parse(event.body);
    const userId = data.user_id || "guest";
    
    // 写真データの準備
    let mealPhotos = [];
    if (data.meal_photos && Array.isArray(data.meal_photos)) {
        mealPhotos = data.meal_photos; 
    } else if (data.meal_photo) {
        mealPhotos = [data.meal_photo]; 
    }
    const tonguePhoto = data.tongue_photo; 

    // --- 3. OpenAIで解析 ---
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    // ★食薬特化のプロンプト（あなたの資料[3]に基づき厳格化）
    const systemPrompt = `
      あなたは臨床分子栄養療法と食薬のプロアシスタントです。
      ユーザーの食事に対し、親切で丁寧な言葉を使い、否定的な表現を避け、安心感を与えるアドバイスを行います。
      
      【是正ルール】
      1. 糖質が80g超なら「少し多め」と判断し、次回の調整を具体的に提案。40gを下回らない限り褒めない。
      2. たんぱく質15g未満なら、胃腸に問題がない限り、肉・魚・卵での増量を促す。
      3. 加工肉（ハム、ベーコン等）は健康リスクがあるため常食を控え、メリットは伝えない。
      4. 小麦、牛乳、砂糖、加工肉、揚げ物は推奨しない。
      
      【表現ルール】
      文中に「」（カギカッコ）や箇条書きを使わず、つなげた文章で書くこと。改行は禁止。
      
      【必須の締め文】
      最後に必ず次の文章を付与してください：普段と変わらない食事を少しずつ健康を意識したものへと近づけ、食薬を習慣化することで元気な心と体をつくりましょう。

      出力形式(JSON):
      {
        "食べ物ですか": true,
        "メニュー": [{"名前": "", "材料": [], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
        "健康アドバイス": "..."
      }
    `;

    // 写真がない場合
    if (mealPhotos.length === 0) {
        return { statusCode: 400, body: JSON.stringify({ error: "写真が届いていません" }) };
    }

    const userContent = [
      { type: "text", text: "この食事の栄養素と食薬アドバイスをお願いします。" }
    ];
    
    mealPhotos.forEach(photoBase64 => {
      let url = photoBase64;
      if (!url.startsWith('data:image')) {
          url = `data:image/jpeg;base64,${url}`;
      }
      userContent.push({ type: "image_url", image_url: { url: url } });
    });

    // 解析実行（GPT-4o）
    const completion = await openai.chat.completions.create({
      model: "gpt-4o", 
      messages: [
          { role: "system", content: systemPrompt },
          { role: "user", content: userContent }
      ],
      response_format: { type: "json_object" },
      max_tokens: 1000
    });

    // AI応答の取得（エラー防止付き）
    if (!completion.choices || !completion.choices || !completion.choices.message) {
        throw new Error("AIからの応答が空でした。");
    }
    const aiResult = JSON.parse(completion.choices.message.content);

    // --- 4. スプレッドシートへ保存 ---
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    
    // ★エラーの元凶だった部分を修正（改行コードの置換を安全に実行）
    const privateKey = process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n');

    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: privateKey,
    });
    await doc.loadInfo();

    // DailyLogシートを取得（なければ作成されるわけではないので注意）
    const logSheet = doc.sheetsByTitle['DailyLog']; 
    if (!logSheet) throw new Error("スプレッドシートに 'DailyLog' シートが見つかりません。");

    // 写真は1枚目のみ保存（容量節約）
    const photoToSave = mealPhotos.length > 0 ? mealPhotos : "";

    // ★あなたの指定した列定義[4]に合わせてデータを保存
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

    // --- 5. 結果を返す ---
    // 食べ物ではない場合
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
    // エラー内容を画面に返す（デバッグ用）
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "システムエラー: " + error.message })
    };
  }
};
