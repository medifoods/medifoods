const { GoogleSpreadsheet } = require('google-spreadsheet');
const { OpenAI } = require('openai');

exports.handler = async (event) => {
  if (event.httpMethod !== "POST") return { statusCode: 405, body: "Method Not Allowed" };

  try {
    const data = JSON.parse(event.body);
    const userId = data.user_id;
    
    // 写真データのチェック
    let mealPhotos = data.meal_photos || [];
    if (!Array.isArray(mealPhotos)) mealPhotos = [mealPhotos];
    
    // 写真がない場合も記録は受け付けるが、AI解析はスキップする設計
    const hasMealPhotos = mealPhotos.length > 0;

    // OpenAI APIの設定
    const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

    let aiResult = {};

    if (hasMealPhotos) {
        // ★あなたが定義した食薬ルール（ソース[1]）をここに注入
        const systemPrompt = `
          あなたは臨床分子栄養療法と食薬のプロアシスタントです。ユーザーの食事に対し、親切で丁寧な言葉を使い、否定的な表現を避け、安心感を与えるアドバイスを行います。
          【是正ルール】
          1. 糖質が80g超なら「少し多め」と判断し、次回の調整を具体的に提案。40gを下回らない限り褒めない。ジュースは血糖値の乱高下を招くため控えるよう伝える。高GI食品には酢の物を提案する。
          2. たんぱく質15g未満なら、胃腸に問題がない限り、肉・魚・卵での増量を促す。加工肉（ハム、ベーコン、ソーセージ、バーガー、サラミ等）は健康リスクがあるため常食を控え、メリットは伝えない。
          3. 食物繊維6g以下なら野菜、海藻、ナッツ等の増量を促す。旬の色や香りのある野菜を勧める。
          4. 巨大魚（マグロ等）は水銀リスクのため推奨しない。
          5. 揚げ物やインスタントは週1回までとし、加熱にはココナッツオイル、生食にはオメガ3を勧める。
          6. 小麦、牛乳、バター、生クリーム、砂糖、顆粒出汁、白だし、麺つゆ、はちみつ、マヨネーズ、ケチャップは一切使用・推奨しない。
          
          【表現ルール】
          文中に「」（カギカッコ）や箇条書きを使わず、つなげた文章で書くこと。改行は禁止。
          
          【必須の締め文】
          最後に必ず次の文章を付与してください：普段と変わらない食事を少しずつ健康を意識したものへと近づけ、食薬を習慣化することで元気な心と体をつくりましょう。

          出力形式（JSONのみ）:
          {
            "食べ物ですか": true,
            "メニュー": [{"名前": "", "材料": [], "糖質": 0, "食物繊維": 0, "カロリー": 0, "脂質": 0, "タンパク質": 0}],
            "健康アドバイス": "..."
          }
          食品が写っていない場合は "食べ物ですか": false を返してください。
        `;

        // GPT-4o 呼び出し
        const completion = await openai.chat.completions.create({
          model: "gpt-4o", 
          messages: [
              { role: "system", content: systemPrompt },
              { role: "user", content: [
                  { type: "text", text: "この食事の栄養素と食薬アドバイスをお願いします。" },
                  ...mealPhotos.map(url => ({ type: "image_url", image_url: { url: url } }))
              ]}
          ],
          response_format: { type: "json_object" },
          max_tokens: 1000
        });

        // AIの返答をパース
        try {
            aiResult = JSON.parse(completion.choices.message.content);
        } catch (e) {
            console.error("JSON Parse Error", e);
            aiResult = { "食べ物ですか": true, "健康アドバイス": "解析中にエラーが発生しましたが、記録は完了しました。" };
        }
    } else {
        // 写真がない場合
        aiResult = { "食べ物ですか": false, "健康アドバイス": "" };
    }

    // スプレッドシートへ保存
    const doc = new GoogleSpreadsheet(process.env.SPREADSHEET_ID);
    await doc.useServiceAccountAuth({
      client_email: process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL,
      private_key: process.env.GOOGLE_PRIVATE_KEY.replace(/\\n/gm, '\n'),
    });
    await doc.loadInfo();

    const logSheet = doc.sheetsByTitle['DailyLog']; // [2]の定義に従う
    
    // 写真は1枚目のみ保存（容量節約）
    const photoToSave = hasMealPhotos ? mealPhotos : "";

    await logSheet.addRow({
      log_id: Date.now().toString(),
      date: data.date,
      user_id: userId,
      meal_purpose: data.meal_purpose,
      meal_photo_urls: photoToSave, 
      tongue_photo_url: data.tongue_photo || "",
      meal_ai_json: JSON.stringify(aiResult),
      daily_questionnaire_json: JSON.stringify(data.daily_questionnaire),
      created_at: new Date().toISOString()
    });

    // フロントエンドへの返却
    if (aiResult.食べ物ですか === false && hasMealPhotos) {
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
