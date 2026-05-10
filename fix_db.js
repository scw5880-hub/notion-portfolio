const TOKEN = "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";
const DB_ID = "35c3ef3c-392f-81e3-8fe1-dba9cd5a280a";

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

(async () => {
  // 1. 현재 DB 구조 확인 (??의 실제 ID 찾기)
  const dbRes = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, { headers });
  const db = await dbRes.json();

  const qqProp = db.properties["??"];
  console.log("?? 프로퍼티:", qqProp ? `찾음 (id: ${qqProp.id})` : "없음");

  // 2. "??" → "통화" 이름 변경 + "카테고리" 추가
  const updateBody = {
    properties: {
      "카테고리": {
        select: {
          options: [
            { name: "주식",           color: "blue"   },
            { name: "상장지수펀드",   color: "orange" },
            { name: "공모펀드",       color: "green"  },
            { name: "부동산투자신탁", color: "purple" },
            { name: "선물",           color: "red"    },
            { name: "지수",           color: "gray"   },
          ]
        }
      }
    }
  };

  // "??" 프로퍼티가 있으면 이름을 "통화"로 변경
  if (qqProp) {
    updateBody.properties["??"] = {
      name: "통화",
      select: {
        options: [
          { name: "USD", color: "blue" },
          { name: "KRW", color: "red"  }
        ]
      }
    };
  } else {
    // 없으면 새로 추가
    updateBody.properties["통화"] = {
      select: {
        options: [
          { name: "USD", color: "blue" },
          { name: "KRW", color: "red"  }
        ]
      }
    };
  }

  const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}`, {
    method: "PATCH",
    headers,
    body: JSON.stringify(updateBody)
  });
  const result = await res.json();

  if (result.id) {
    const props = Object.keys(result.properties).join(", ");
    console.log("✅ DB 수정 완료! 컬럼:", props);
  } else {
    console.error("❌ 실패:", JSON.stringify(result));
  }
})();
