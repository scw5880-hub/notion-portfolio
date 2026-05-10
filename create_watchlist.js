const TOKEN = "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";
const PARENT_PAGE_ID = "35c3ef3c392f80ed92b4d102bb4712d2"; // 포트폴리오 페이지

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

(async () => {
  const res = await fetch("https://api.notion.com/v1/databases", {
    method: "POST",
    headers,
    body: JSON.stringify({
      parent: { type: "page_id", page_id: PARENT_PAGE_ID },
      title: [{ type: "text", text: { content: "관심 종목" } }],
      properties: {
        "이름":       { title: {} },
        "티커":       { rich_text: {} },
        "실시간 주가": { rich_text: {} },
        "매입가":     { rich_text: {} },
        "잔고":       { number: {} },
        "수익률":     { rich_text: {} },
        "평가손익":   { rich_text: {} },
        "주당 배당금": { number: {} },
      }
    })
  });

  const result = await res.json();
  if (result.id) {
    console.log("✅ 관심 종목 DB 생성 완료");
    console.log("DB ID:", result.id);
  } else {
    console.error("❌ 실패:", JSON.stringify(result, null, 2));
  }
})();
