const yf = require('yahoo-finance2');
const yahooFinance = new yf.default({ suppressNotices: ['yahooSurvey'] });

const TOKEN = process.env.NOTION_TOKEN;
const DB_ID = process.env.NOTION_DB_ID || "35c3ef3c-392f-81e3-8fe1-dba9cd5a280a";

const headers = {
  "Authorization": `Bearer ${TOKEN}`,
  "Notion-Version": "2022-06-28",
  "Content-Type": "application/json"
};

const g = (domain) => `https://www.google.com/s2/favicons?domain=${domain}&sz=128`;

// 산업명 영어 → 한국어
const INDUSTRY_KO = {
  "Semiconductors":                       "반도체",
  "Semiconductor Equipment & Materials":  "반도체 장비",
  "Consumer Electronics":                 "소비자 전자기기",
  "Internet Content & Information":       "인터넷/콘텐츠",
  "Footwear & Accessories":               "신발/의류",
  "Apparel Manufacturing":                "의류 제조",
  "Software—Application":                 "소프트웨어",
  "Software—Infrastructure":             "소프트웨어 인프라",
  "Technology":                           "기술",
  "Information Technology Services":      "IT 서비스",
  "Computer Hardware":                    "컴퓨터 하드웨어",
  "Electronic Components":                "전자 부품",
  "Real Estate":                          "부동산",
  "REIT—Diversified":                     "리츠 (복합)",
  "REIT—Office":                          "리츠 (오피스)",
  "REIT—Industrial":                      "리츠 (산업)",
  "REIT—Data Center":                     "리츠 (데이터센터)",
  "Financial Services":                   "금융 서비스",
  "Banks—Diversified":                    "은행 (종합)",
  "Asset Management":                     "자산 운용",
  "Insurance—Diversified":                "보험",
  "Healthcare":                           "헬스케어",
  "Biotechnology":                        "바이오",
  "Drug Manufacturers—General":           "제약",
  "Medical Devices":                      "의료기기",
  "Communication Services":               "통신 서비스",
  "Telecom Services":                     "통신",
  "Entertainment":                        "엔터테인먼트",
  "Electronic Gaming & Multimedia":       "게임/미디어",
  "Auto Manufacturers":                   "자동차 제조",
  "Auto Parts":                           "자동차 부품",
  "Oil & Gas E&P":                        "석유/가스",
  "Oil & Gas Integrated":                 "석유/가스 (통합)",
  "Specialty Chemicals":                  "특수 화학",
  "Agricultural Inputs":                  "농업",
  "Aerospace & Defense":                  "항공/방위",
  "Airlines":                             "항공사",
  "Retail—Specialty":                     "소매 (전문)",
  "Retail—Cyclical":                      "소매 (경기)",
  "Grocery Stores":                       "식품 유통",
  "Restaurants":                          "외식",
  "Beverages—Non-Alcoholic":             "음료 (비알코올)",
  "Beverages—Alcoholic":                 "음료 (알코올)",
  "Packaged Foods":                       "식품 패키지",
  "Consumer Defensive":                   "필수 소비재",
  "Utilities—Regulated Electric":         "전력 (규제)",
  "Utilities—Renewable":                  "재생에너지",
  "Industrial Conglomerates":             "복합 산업",
  "Specialty Industrial Machinery":       "산업 기계",
  "Tools & Accessories":                  "공구/부품",
  "Staffing & Employment Services":       "인력 서비스",
  "Advertising Agencies":                 "광고",
  "Publishing":                           "출판/미디어",
  "Security & Protection Services":       "보안 서비스",
  "Consulting Services":                  "컨설팅",
  "混合":                                  "혼합",
};

function toKo(industry) {
  if (!industry) return null;
  return INDUSTRY_KO[industry] ?? industry;
}

function formatPrice(price, currency) {
  if (price === null || price === undefined) return null;
  if (currency === "KRW") {
    return `₩${Math.round(price).toLocaleString("ko-KR")}`;
  }
  return `$${(Math.round(price * 100) / 100).toLocaleString("en-US")}`;
}

async function getStockInfo(ticker) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryProfile', 'summaryDetail', 'assetProfile']
    });

    const price    = quote.price?.regularMarketPrice ?? null;
    const currency = quote.price?.currency === "KRW" ? "KRW" : "USD";
    const name     = quote.price?.shortName ?? quote.price?.longName ?? null;
    const dividend = quote.summaryDetail?.dividendRate ?? 0;
    const industryRaw = quote.assetProfile?.industry
                     ?? quote.summaryProfile?.industry
                     ?? quote.summaryProfile?.category
                     ?? null;
    const industry = toKo(industryRaw);
    const website  = quote.assetProfile?.website ?? quote.summaryProfile?.website ?? null;
    const domain   = website ? new URL(website).hostname.replace("www.", "") : null;

    return { price, currency, name, dividend, industry, logoUrl: domain ? g(domain) : null };
  } catch (e) {
    console.log(`  ⚠️  ${ticker} 조회 실패: ${e.message}`);
    return { price: null, currency: null, name: null, dividend: null, industry: null, logoUrl: null };
  }
}

async function updatePage(page, info) {
  const currentName  = page.properties["이름"].title[0]?.plain_text ?? "";
  const currentIndustry = page.properties["산업"]?.select?.name ?? null;
  const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? "";
  const hasIcon = !!page.icon;

  const body = { properties: {} };

  // 이름: 비어있거나 티커랑 같으면 자동 채우기
  if (info.name && (!currentName || currentName === ticker)) {
    body.properties["이름"] = { title: [{ text: { content: info.name } }] };
  }

  // 오늘의 주가: 통화 기호 포함 텍스트
  if (info.price !== null) {
    body.properties["오늘의 주가"] = {
      rich_text: [{ text: { content: formatPrice(info.price, info.currency) } }]
    };
  }

  // 주당 배당금: 숫자 유지
  if (info.dividend !== null) {
    body.properties["주당 배당금"] = { number: Math.round(info.dividend * 100) / 100 };
  }

  // 산업: 비어있을 때만 채우기 (한국어)
  if (info.industry && !currentIndustry) {
    body.properties["산업"] = { select: { name: info.industry } };
  }

  // 로고: 없을 때만 추가
  if (info.logoUrl && !hasIcon) {
    body.icon = { type: "external", external: { url: info.logoUrl } };
  }

  const r = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: "PATCH", headers, body: JSON.stringify(body)
  });
  if (!r.ok) {
    const err = await r.json();
    console.error(`  ❌ Notion 업데이트 실패 (${r.status}):`, err.message);
  }
}

(async () => {
  console.log("📊 포트폴리오 업데이트 시작...\n");

  const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
    method: "POST", headers, body: JSON.stringify({})
  });
  const data = await res.json();

  for (const page of data.results) {
    const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? null;
    if (!ticker) { console.log(`⚠️  티커 없는 행 스킵`); continue; }

    process.stdout.write(`🔍 ${ticker} ... `);
    const info = await getStockInfo(ticker);
    await updatePage(page, info);

    const priceStr = info.price ? formatPrice(info.price, info.currency) : "실패";
    const divStr   = info.dividend ? ` / 배당 ${formatPrice(info.dividend, info.currency)}` : "";
    const logoStr  = (!page.icon && info.logoUrl) ? " + 로고" : "";
    console.log(`✅ ${priceStr}${divStr}${logoStr}`);
  }

  console.log("\n🎉 완료!");
})();
