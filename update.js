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

// 카테고리 자동 감지
function getCategory(quoteType) {
  const map = {
    'EQUITY':     '주식',
    'ETF':        '상장지수펀드',
    'MUTUALFUND': '공모펀드',
    'FUTURE':     '선물',
    'INDEX':      '지수',
  };
  return map[quoteType] ?? '주식';
}

async function getStockInfo(ticker) {
  try {
    const quote = await yahooFinance.quoteSummary(ticker, {
      modules: ['price', 'summaryProfile', 'summaryDetail', 'assetProfile']
    });

    const price     = quote.price?.regularMarketPrice ?? null;
    const currency  = quote.price?.currency ?? 'USD';
    const quoteType = quote.price?.quoteType ?? 'EQUITY';
    const name      = quote.price?.shortName ?? quote.price?.longName ?? null;
    const dividend  = quote.summaryDetail?.dividendRate ?? 0;

    // 산업: 주식이면 industry, 펀드/ETF면 category
    const industry  = quote.assetProfile?.industry
                   ?? quote.summaryProfile?.industry
                   ?? quote.summaryProfile?.category
                   ?? null;

    const website   = quote.assetProfile?.website
                   ?? quote.summaryProfile?.website
                   ?? null;
    const domain    = website ? new URL(website).hostname.replace('www.', '') : null;

    return {
      price,
      currency: currency === 'KRW' ? 'KRW' : 'USD',
      name,
      dividend,
      industry,
      category: getCategory(quoteType),
      logoUrl: domain ? g(domain) : null
    };
  } catch (e) {
    console.log(`  ⚠️  ${ticker} 조회 실패: ${e.message}`);
    return { price: null, currency: null, name: null, dividend: null, industry: null, category: null, logoUrl: null };
  }
}

function formatPrice(price, currency) {
  if (price === null) return null;
  const rounded = currency === 'KRW' ? Math.round(price) : Math.round(price * 100) / 100;
  return rounded;
}

async function updatePage(page, info) {
  const currentName     = page.properties["이름"].title[0]?.plain_text ?? "";
  const currentIndustry = page.properties["산업"]?.select?.name ?? null;
  const currentCategory = page.properties["카테고리"]?.select?.name ?? null;
  const hasIcon         = !!page.icon;

  const body = { properties: {} };

  // 이름: 비어있거나 티커랑 같으면 자동 채우기
  const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? "";
  if (info.name && (!currentName || currentName === ticker)) {
    body.properties["이름"] = { title: [{ text: { content: info.name } }] };
  }

  if (info.price !== null) {
    body.properties["오늘의 주가"] = { number: formatPrice(info.price, info.currency) };
  }
  if (info.dividend !== null) {
    body.properties["주당 배당금"] = { number: formatPrice(info.dividend, info.currency) };
  }
  if (info.currency) {
    body.properties["통화"] = { select: { name: info.currency } };
  }
  if (info.industry && !currentIndustry) {
    body.properties["산업"] = { select: { name: info.industry.slice(0, 50) } };
  }
  if (info.category && !currentCategory) {
    body.properties["카테고리"] = { select: { name: info.category } };
  }
  if (info.logoUrl && !hasIcon) {
    body.icon = { type: "external", external: { url: info.logoUrl } };
  }

  await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
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
    const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? null;
    if (!ticker) { console.log(`⚠️  티커 없는 행 스킵`); continue; }

    process.stdout.write(`🔍 ${ticker} ... `);
    const info = await getStockInfo(ticker);
    await updatePage(page, info);

    const sym       = info.currency === 'KRW' ? '₩' : '$';
    const priceStr  = info.price    ? `${sym}${formatPrice(info.price, info.currency).toLocaleString()}` : "실패";
    const divStr    = info.dividend ? ` / 배당 ${sym}${formatPrice(info.dividend, info.currency)}` : "";
    const nameStr   = info.name     ? ` (${info.name})` : "";
    const logoStr   = (!page.icon && info.logoUrl) ? " + 로고" : "";
    console.log(`✅ ${priceStr}${divStr}${nameStr}${logoStr}`);
  }

  console.log("\n🎉 완료!");
})();
