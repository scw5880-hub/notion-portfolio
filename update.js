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

function formatPrice(price, currency) {
  if (price === null || price === undefined) return null;
  if (currency === "KRW") {
    return `₩${Math.round(price).toLocaleString("ko-KR")}`;
  }
  return `$${(Math.round(price * 100) / 100).toLocaleString("en-US")}`;
}

function parsePrice(text) {
  if (!text) return null;
  const cleaned = text.replace(/[$₩,\s]/g, "");
  const num = parseFloat(cleaned);
  return isNaN(num) ? null : num;
}

function formatReturn(pct) {
  const sign = pct >= 0 ? "+" : "";
  return `${sign}${pct.toFixed(2)}%`;
}

function formatPnL(pnl, currency) {
  const sign = pnl >= 0 ? "+" : "-";
  const abs = Math.abs(pnl);
  if (currency === "KRW") {
    return `${sign}₩${Math.round(abs).toLocaleString("ko-KR")}`;
  }
  return `${sign}$${(Math.round(abs * 100) / 100).toLocaleString("en-US")}`;
}

async function getStockInfo(ticker) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryProfile', 'assetProfile']
    });

    const price    = quote.price?.regularMarketPrice ?? null;
    const currency = quote.price?.currency === "KRW" ? "KRW" : "USD";
    const name     = quote.price?.shortName ?? quote.price?.longName ?? null;
    const dividend = quote.summaryDetail?.dividendRate ?? 0;
    const website  = quote.assetProfile?.website ?? quote.summaryProfile?.website ?? null;
    const domain   = website ? new URL(website).hostname.replace("www.", "") : null;

    return { price, currency, name, dividend, logoUrl: domain ? g(domain) : null };
  } catch (e) {
    console.log(`  ⚠️  ${ticker} 조회 실패: ${e.message}`);
    return { price: null, currency: null, name: null, dividend: null, logoUrl: null };
  }
}

async function updatePage(page, info) {
  const currentName = page.properties["이름"].title[0]?.plain_text ?? "";
  const ticker      = page.properties["티커"].rich_text[0]?.plain_text ?? "";
  const hasIcon     = !!page.icon;

  const buyPriceText = page.properties["매입가"]?.rich_text[0]?.plain_text ?? null;
  const quantity     = page.properties["잔고"]?.number ?? null;
  const buyPrice     = parsePrice(buyPriceText);

  const body = { properties: {} };

  // 이름: 비어있거나 티커랑 같으면 자동 채우기
  if (info.name && (!currentName || currentName === ticker)) {
    body.properties["이름"] = { title: [{ text: { content: info.name } }] };
  }

  // 실시간 주가
  if (info.price !== null) {
    body.properties["실시간 주가"] = {
      rich_text: [{ text: { content: formatPrice(info.price, info.currency) } }]
    };
  }

  // 주당 배당금
  if (info.dividend !== null) {
    body.properties["주당 배당금"] = { number: Math.round(info.dividend * 100) / 100 };
  }

  // 수익률 & 평가손익: 매입가와 잔고가 있을 때만 계산
  if (buyPrice !== null && quantity !== null && info.price !== null) {
    const pct = (info.price - buyPrice) / buyPrice * 100;
    const pnl = (info.price - buyPrice) * quantity;
    body.properties["수익률"]  = { rich_text: [{ text: { content: formatReturn(pct) } }] };
    body.properties["평가손익"] = { rich_text: [{ text: { content: formatPnL(pnl, info.currency) } }] };
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
    const divStr   = info.dividend ? ` | 배당 ${formatPrice(info.dividend, info.currency)}` : "";

    const buyPriceText = page.properties["매입가"]?.rich_text[0]?.plain_text ?? null;
    const quantity     = page.properties["잔고"]?.number ?? null;
    const buyPrice     = parsePrice(buyPriceText);
    let returnStr = "";
    if (buyPrice !== null && quantity !== null && info.price !== null) {
      const pct = (info.price - buyPrice) / buyPrice * 100;
      const pnl = (info.price - buyPrice) * quantity;
      returnStr = ` | ${formatReturn(pct)} (${formatPnL(pnl, info.currency)})`;
    }

    console.log(`✅ ${priceStr}${divStr}${returnStr}`);
  }

  console.log("\n🎉 완료!");
})();
