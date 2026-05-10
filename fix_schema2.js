const TOKEN = "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";
const DB_ID = "35c3ef3c-392f-81e3-8fe1-dba9cd5a280a";

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

(async () => {
  const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify({
      properties: {
        "오늘의 주가": { name: "실시간 주가", rich_text: {} },
        "구매 가격":   { name: "매입가",      rich_text: {} },
        "주식 수":     { name: "잔고",        number:    {} },
        "산업":        null,
        "투자 금액":   null,
        "수익률":      { rich_text: {} },
        "평가손익":    { rich_text: {} },
      }
    })
  });
  const result = await res.json();
  if (result.id) {
    console.log("✅ 스키마 수정 완료");
    console.log("컬럼:", Object.keys(result.properties).join(", "));
  } else {
    console.error("❌ 실패:", JSON.stringify(result, null, 2));
  }
})();
