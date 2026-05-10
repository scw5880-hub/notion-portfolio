const TOKEN = "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";
const DB_ID = "35c3ef3c-392f-81e3-8fe1-dba9cd5a280a";

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

(async () => {
  // 1. DB에 "구분" select 컬럼 추가
  const schemaRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      properties: {
        "구분": {
          select: {
            options: [
              { name: "보유", color: "blue" },
              { name: "관심", color: "yellow" }
            ]
          }
        }
      }
    })
  });
  const schema = await schemaRes.json();
  if (!schema.id) { console.error("❌ 컬럼 추가 실패:", schema.message); return; }
  console.log("✅ '구분' 컬럼 추가 완료");

  // 2. 기존 모든 행에 구분 = "보유" 세팅
  const rows = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
    method: "POST", headers, body: JSON.stringify({})
  });
  const data = await rows.json();

  for (const page of data.results) {
    const ticker = page.properties["티커"]?.rich_text[0]?.plain_text ?? "(없음)";
    await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
      method: "PATCH",
      headers,
      body: JSON.stringify({
        properties: { "구분": { select: { name: "보유" } } }
      })
    });
    console.log(`  ✅ ${ticker} → 보유`);
  }

  console.log("\n🎉 완료! 이제 Notion에서 뷰 설정만 하면 돼.");
})();
