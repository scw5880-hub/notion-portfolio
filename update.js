const yf = require('yahoo-finance2');
const yahooFinance = new yf.default({ suppressNotices: ['yahooSurvey'] });

const TOKEN = process.env.NOTION_TOKEN;

const DB_IDS = [
  "35e3ef3c-392f-814a-8b16-f993709b2f14",  // 보유 종목
  "35e3ef3c-392f-81e0-83e0-de4c361b70b7",  // 관심 종목
];
const TRADING_DB_ID = "35e3ef3c-392f-81d2-b2b1-c474b17c7684";

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
      modules: ['price', 'summaryProfile', 'summaryDetail', 'assetProfile']
    });

    const price      = quote.price?.regularMarketPrice ?? null;
    const currency   = quote.price?.currency === "KRW" ? "KRW" : "USD";
    const name       = quote.price?.shortName ?? quote.price?.longName ?? null;
    const dividend   = quote.summaryDetail?.dividendRate ?? 0;
    const changePct  = quote.price?.regularMarketChangePercent ?? null;
    const website    = quote.assetProfile?.website ?? quote.summaryProfile?.website ?? null;
    const domain     = website ? new URL(website).hostname.replace("www.", "") : null;

    return { price, currency, name, dividend, changePct, logoUrl: domain ? g(domain) : null };
  } catch (e) {
    console.log(`  ⚠️  ${ticker} 조회 실패: ${e.message}`);
    return { price: null, currency: null, name: null, dividend: null, logoUrl: null };
  }
}

async function updatePage(page, info, weight = null) {
  const currentName = page.properties["이름"].title[0]?.plain_text ?? "";
  const ticker      = page.properties["티커"].rich_text[0]?.plain_text ?? "";
  const hasIcon     = !!page.icon;

  const buyPriceText = page.properties["매입가"]?.rich_text[0]?.plain_text ?? null;
  const quantity     = page.properties["잔고"]?.number ?? null;
  const buyPrice     = parsePrice(buyPriceText);

  const body = { properties: {} };

  if (info.name && (!currentName || currentName === ticker)) {
    body.properties["이름"] = { title: [{ text: { content: info.name } }] };
  }

  if (info.price !== null) {
    body.properties["실시간 주가"] = {
      rich_text: [{ text: { content: formatPrice(info.price, info.currency) } }]
    };
  }

  const hasProps = page.properties;

  if (info.dividend !== null && hasProps["주당 배당금"]) {
    body.properties["주당 배당금"] = { number: Math.round(info.dividend * 100) / 100 };
  }

  if (buyPrice !== null && quantity !== null && info.price !== null) {
    const pct = (info.price - buyPrice) / buyPrice * 100;
    const pnl = (info.price - buyPrice) * quantity;
    const eval_amount = info.price * quantity;
    if (hasProps["수익률"])   body.properties["수익률"]   = { rich_text: [{ text: { content: formatReturn(pct) } }] };
    if (hasProps["평가손익"]) body.properties["평가손익"] = { rich_text: [{ text: { content: formatPnL(pnl, info.currency) } }] };
    if (hasProps["평가금액 (차트)"]) body.properties["평가금액 (차트)"] = { number: Math.round(eval_amount) };
    if (hasProps["평가금액"])       body.properties["평가금액"]       = { rich_text: [{ text: { content: formatPrice(eval_amount, info.currency) } }] };
  }

  // 매입가_숫자: 매매일지 롤업 연동용 숫자형 매입가
  if (buyPrice !== null && hasProps["매입가_숫자"]) {
    body.properties["매입가_숫자"] = { number: buyPrice };
  }

  // 비중
  if (weight !== null && hasProps["비중"]) {
    body.properties["비중"] = { rich_text: [{ text: { content: weight } }] };
  }

  // 등락률: 오늘의 등락 %
  if (info.changePct !== null) {
    const sign = info.changePct >= 0 ? "+" : "";
    body.properties["등락률"] = {
      rich_text: [{ text: { content: `${sign}${(info.changePct * 100).toFixed(2)}%` } }]
    };
  }

  if (info.logoUrl && !hasIcon) {
    body.icon = { type: "external", external: { url: info.logoUrl } };
  }

  const r = await fetch(`https://api.notion.com/v1/pages/${page.id}`, {
    method: "PATCH", headers, body: JSON.stringify(body)
  });
  if (!r.ok) {
    const errText = await r.text();
    try {
      const err = JSON.parse(errText);
      console.error(`  ❌ Notion 업데이트 실패 (${r.status}):`, err.message);
    } catch {
      console.error(`  ❌ Notion 업데이트 실패 (${r.status}):`, errText.substring(0, 100));
    }
  }
}

async function getUsdKrwRate() {
  try {
    const quote = await yahooFinance.quoteSummary("USDKRW=X", { modules: ['price'] });
    const rate = quote.price?.regularMarketPrice ?? null;
    if (rate) console.log(`  💱 USD/KRW 환율: ₩${rate.toLocaleString("ko-KR")}`);
    return rate;
  } catch (e) {
    console.log(`  ⚠️  환율 조회 실패: ${e.message}`);
    return null;
  }
}

async function updateDatabase(dbId) {
  // 환율 먼저 조회
  const usdKrw = await getUsdKrwRate();

  const res = await fetch(`https://api.notion.com/v1/databases/${dbId}/query`, {
    method: "POST", headers, body: JSON.stringify({})
  });
  const data = await res.json();

  // 1단계: 모든 종목 정보 수집
  const stockList = [];
  for (const page of data.results) {
    const ticker = page.properties["티커"].rich_text[0]?.plain_text ?? null;
    if (!ticker || !/[a-zA-Z0-9]/.test(ticker)) continue;

    process.stdout.write(`🔍 ${ticker} ... `);
    const info = await getStockInfo(ticker);

    const buyPriceText = page.properties["매입가"]?.rich_text[0]?.plain_text ?? null;
    const quantity     = page.properties["잔고"]?.number ?? null;
    const buyPrice     = parsePrice(buyPriceText);

    // 평가금액을 KRW 기준으로 통일 (환율 적용)
    let evalAmountKrw = null;
    if (info.price !== null && quantity !== null) {
      const evalRaw = info.price * quantity;
      if (info.currency === "USD" && usdKrw) {
        evalAmountKrw = evalRaw * usdKrw;
      } else if (info.currency === "KRW") {
        evalAmountKrw = evalRaw;
      }
    }

    stockList.push({ page, info, buyPrice, quantity, evalAmountKrw });

    const priceStr = info.price ? formatPrice(info.price, info.currency) : "실패";
    const divStr   = info.dividend ? ` | 배당 ${formatPrice(info.dividend, info.currency)}` : "";
    let returnStr = "";
    if (buyPrice !== null && quantity !== null && info.price !== null) {
      const pct = (info.price - buyPrice) / buyPrice * 100;
      const pnl = (info.price - buyPrice) * quantity;
      returnStr = ` | ${formatReturn(pct)} (${formatPnL(pnl, info.currency)})`;
    }
    console.log(`✅ ${priceStr}${divStr}${returnStr}`);
  }

  // 2단계: 전체 평가금액(KRW 기준) 합산
  const totalEvalKrw = stockList.reduce((sum, s) => sum + (s.evalAmountKrw ?? 0), 0);
  console.log(`\n  📊 총 평가금액: ₩${Math.round(totalEvalKrw).toLocaleString("ko-KR")}`);

  // 3단계: 비중 계산 후 업데이트
  for (const s of stockList) {
    const weight = (totalEvalKrw > 0 && s.evalAmountKrw !== null)
      ? `${(s.evalAmountKrw / totalEvalKrw * 100).toFixed(1)}%`
      : "-";
    await updatePage(s.page, s.info, weight);
  }
}

// ─────────────────────────────────────────
// 매매일지 → 포트폴리오 잔고 자동 차감
// ─────────────────────────────────────────
async function syncTrades() {
  console.log("\n📋 매매일지 잔고 동기화 중...");

  // 처리됨=false, 매도수량>0, 매도가>0 인 항목만 조회
  const res = await fetch(`https://api.notion.com/v1/databases/${TRADING_DB_ID}/query`, {
    method: "POST", headers,
    body: JSON.stringify({
      filter: {
        and: [
          { property: "처리됨", checkbox: { equals: false } },
          { property: "매도수량", number: { greater_than: 0 } },
          { property: "매도가",   number: { greater_than: 0 } }
        ]
      }
    })
  });
  const data = await res.json();

  if (!data.results || data.results.length === 0) {
    console.log("  처리할 매도 항목 없음");
    return;
  }

  for (const trade of data.results) {
    const sellQty    = trade.properties["매도수량"]?.number ?? 0;
    const relatedArr = trade.properties["종목"]?.relation ?? [];
    if (relatedArr.length === 0 || sellQty <= 0) continue;

    const portfolioPageId = relatedArr[0].id;

    // 포트폴리오 현재 잔고 조회
    const pageRes = await fetch(`https://api.notion.com/v1/pages/${portfolioPageId}`, { headers });
    const pageData = await pageRes.json();
    const currentQty = pageData.properties["잔고"]?.number ?? 0;
    const newQty = Math.max(0, currentQty - sellQty);
    const ticker = pageData.properties["티커"]?.rich_text[0]?.plain_text ?? portfolioPageId;

    // 포트폴리오 잔고 차감
    await fetch(`https://api.notion.com/v1/pages/${portfolioPageId}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ properties: { "잔고": { number: newQty } } })
    });

    // 매매일지 처리됨 체크
    await fetch(`https://api.notion.com/v1/pages/${trade.id}`, {
      method: "PATCH", headers,
      body: JSON.stringify({ properties: { "처리됨": { checkbox: true } } })
    });

    console.log(`  ✅ ${ticker}: 잔고 ${currentQty} → ${newQty} (매도 ${sellQty}주)`);
  }
}

(async () => {
  console.log("📊 포트폴리오 업데이트 시작...\n");

  // 1. 매매일지 잔고 동기화 (가격 업데이트 전에 먼저 처리)
  await syncTrades();

  // 2. 포트폴리오 가격 업데이트
  console.log("\n📈 실시간 가격 업데이트 중...");
  for (const dbId of DB_IDS) {
    await updateDatabase(dbId);
  }

  console.log("\n🎉 완료!");
})();
