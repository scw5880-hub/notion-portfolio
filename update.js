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

async function getStockInfo(ticker) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryProfile', 'summaryDetail']
    });
    const price    = quote.price?.regularMarketPrice ?? null;
    const dividend = quote.summaryDetail?.dividendRate ?? 0;
    const website  = quote.summaryProfile?.website ?? null;
    const domain   = website ? new URL(website).hostname.replace('www.', '') : null;
    return { price, dividend, logoUrl: domain ? g(domain) : null };
  } catch (e) {
    console.log(`  ⚠️  ${ticker} 조회 실패: ${e.message}`);
    return { price: null, logoUrl: null };
  }
}

async function updatePage(pageId, price, dividend, logoUrl, hasIcon) {
  const body = { properties: {} };
  if (price !== null) {
    body.properties["오늘의 주가"] = { number: Math.round(price) };
  }
  if (dividend !== null) {
    body.properties["주당 배당금"] = { number: Math.round(dividend) };
  }
  if (logoUrl && !hasIcon) {
    body.icon = { type: "external", external: { url: logoUrl } };
  }
  await fetch(`https://api.notion.com/v1/pages/${pageId}`, {
    method: "PATCH", headers, body: JSON.stringify(body)
  });
}

(async () => {
  console.log("📊 포트폴리오 업데이트 시작...\n");

  const res = await fetch(`https://api.notion.com/v1/databases/${DB_ID}/query`, {
    method: "POST", headers, body: JSON.stringify({})
  });
  const data = await res.json();

  for (const page of data.results) {
    const name   = page.properties["이름"].title[0]?.plain_text ?? "?";
    const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? null;
    const hasIcon = !!page.icon;

    if (!ticker) { console.log(`⚠️  ${name}: 티커 없음, 스킵`); continue; }

    process.stdout.write(`🔍 ${name} (${ticker}) ... `);
    const { price, dividend, logoUrl } = await getStockInfo(ticker);
    await updatePage(page.id, price, dividend, logoUrl, hasIcon);

    const priceStr = price ? `₩${Math.round(price).toLocaleString()}` : "실패";
    const divStr   = dividend ? ` / 배당 ₩${Math.round(dividend).toLocaleString()}` : "";
    const logoStr  = (!hasIcon && logoUrl) ? " + 로고 추가" : "";
    console.log(`✅ ${priceStr}${divStr}${logoStr}`);
  }

  console.log("\n🎉 완료!");
})();
