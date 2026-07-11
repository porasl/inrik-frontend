import React, { useEffect, useMemo, useState } from 'react';

const SYMBOLS = ['NVDA', 'PLTR', 'GOOGL', 'AAPL', 'MSFT', 'META', 'CRWV', 'MU', 'QCOM', 'UBER', 'AMZN', 'SPCX', 'AMD', 'INTC', 'TSLA', 'SBUX', 'ORCL', 'MDB', 'BAC', 'WMT'];
const RANGES = [
  { label: '1D', range: '1d', interval: '5m', points: 46 },
  { label: '5D', range: '5d', interval: '30m', points: 42 },
  { label: '1M', range: '1mo', interval: '1d', points: 30 },
  { label: '6M', range: '6mo', interval: '1wk', points: 28 },
  { label: '1Y', range: '1y', interval: '1wk', points: 52 },
  { label: '5Y', range: '5y', interval: '1mo', points: 60 },
];
const TICKER_QUOTES = [
  ['PLTR', 126.79], ['NVDA', 210.96], ['MSFT', 385.10], ['CRWV', 88.88],
  ['UBER', 74.54], ['INFY', 10.94], ['SBUX', 106.01], ['META', 669.21],
  ['AMZN', 245.34], ['BAC', 59.67], ['SNAP', 4.68], ['ERIC', 11.35],
  ['PSNY', 18.70], ['TSLA', 407.76], ['NKE', 44.37], ['ORCL', 140.64],
  ['MDB', 342.08], ['GOOG', 355.03], ['WMT', 113.90], ['AAPL', 315.32],
];
const BASE_PRICES = {
  AAPL: 315, AMD: 168, AMZN: 245, BAC: 60, CRWV: 89, GOOGL: 355, INTC: 32,
  MDB: 342, META: 669, MSFT: 385, MU: 126, NVDA: 211, ORCL: 141, PLTR: 127,
  QCOM: 178, SBUX: 106, SPCX: 49, TSLA: 408, UBER: 75, WMT: 114,
};

function money(value) {
  return `$${Number(value || 0).toFixed(2)}`;
}

function compactShares(value) {
  const numeric = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  if (numeric >= 1_000_000_000) return `${sign}${(numeric / 1_000_000_000).toFixed(2)}B`;
  if (numeric >= 1_000_000) return `${sign}${(numeric / 1_000_000).toFixed(2)}M`;
  if (numeric >= 1_000) return `${sign}${(numeric / 1_000).toFixed(1)}K`;
  return `${sign}${numeric.toFixed(0)}`;
}

function seededNoise(seed, index) {
  const value = Math.sin(seed * 13.37 + index * 2.17) * 10000;
  return value - Math.floor(value);
}

function makeFallbackSeries(symbol, rangeConfig) {
  const seed = symbol.split('').reduce((sum, char) => sum + char.charCodeAt(0), 0);
  const base = BASE_PRICES[symbol] || 100 + (seed % 120);
  let price = base;

  return Array.from({ length: rangeConfig.points }, (_, index) => {
    const drift = (seed % 2 === 0 ? 1 : -1) * index * 0.025;
    const wave = Math.sin(index / 3 + seed / 10) * base * 0.006;
    const noise = (seededNoise(seed, index) - 0.5) * base * 0.012;
    price = Math.max(2, price + drift + wave + noise);
    const volume = Math.round((seededNoise(seed + 11, index) * 0.75 + 0.35) * 8_000_000);
    return {
      label: rangeConfig.label === '1D'
        ? `${9 + Math.floor(index / 7)}:${String((index % 7) * 8).padStart(2, '0')}`
        : `P${index + 1}`,
      price: Number(price.toFixed(2)),
      volume,
    };
  });
}

function buildBuySellTradeBars(series) {
  return series.map((point, index) => {
    const previous = index > 0 ? series[index - 1].price : point.price;
    const isUp = point.price >= previous;
    return {
      ...point,
      buy: Math.round(point.volume * (isUp ? 0.65 : 0.35)),
      sell: Math.round(point.volume * (isUp ? 0.35 : 0.65)),
    };
  });
}

function statsFor(series, rangeLabel) {
  const prices = series.map((point) => point.price);
  const min = Math.min(...prices);
  const max = Math.max(...prices);
  const avg = prices.reduce((sum, price) => sum + price, 0) / prices.length;
  const first = prices[0];
  const last = prices[prices.length - 1];
  const change = ((last - first) / first) * 100;
  const buy = series.reduce((sum, point) => sum + Number(point.buy || 0), 0);
  const sell = series.reduce((sum, point) => sum + Number(point.sell || 0), 0);
  return { min, max, avg, first, last, change, buy, sell, net: buy - sell, rangeLabel };
}

function parseYahooChart(json, rangeConfig) {
  const result = json?.chart?.result?.[0];
  const timestamps = result?.timestamp || [];
  const quote = result?.indicators?.quote?.[0] || {};
  const closes = quote.close || [];
  const volumes = quote.volume || [];

  return timestamps.reduce((items, timestamp, index) => {
    const price = closes[index];
    if (price === null || price === undefined || Number.isNaN(Number(price))) return items;
    const date = new Date(timestamp * 1000);
    items.push({
      label: rangeConfig.range === '1d' || rangeConfig.range === '5d'
        ? date.toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })
        : date.toLocaleDateString(undefined, { month: 'short', day: 'numeric' }),
      price: Number(Number(price).toFixed(2)),
      volume: Number(volumes[index] || 0),
    });
    return items;
  }, []);
}

function StockChart({ series }) {
  const width = 960;
  const height = 330;
  const pad = { top: 18, right: 58, bottom: 46, left: 62 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const prices = series.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = Math.max(1, maxPrice - minPrice);
  const maxTrade = Math.max(...series.map((point) => Math.max(point.buy, point.sell)), 1);
  const xFor = (index) => pad.left + (series.length <= 1 ? plotW / 2 : (index / (series.length - 1)) * plotW);
  const yForPrice = (price) => pad.top + (1 - ((price - minPrice) / priceSpan)) * (plotH * 0.68);
  const barBase = pad.top + plotH;
  const barMaxHeight = plotH * 0.28;
  const barWidth = Math.max(3, Math.min(12, plotW / series.length / 3));
  const linePath = series.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yForPrice(point.price)}`).join(' ');
  const areaPath = `${linePath} L ${xFor(series.length - 1)} ${barBase - barMaxHeight - 18} L ${xFor(0)} ${barBase - barMaxHeight - 18} Z`;
  const tickIndexes = [0, Math.floor(series.length * 0.25), Math.floor(series.length * 0.5), Math.floor(series.length * 0.75), series.length - 1]
    .filter((value, index, all) => all.indexOf(value) === index);

  return (
    <div className="market-chart-box">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Stock price and buy sell volume chart">
        {[0, 1, 2, 3].map((tick) => {
          const y = pad.top + tick * (plotH / 3);
          return <line key={tick} x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#e5e7eb" strokeDasharray="5 5" />;
        })}
        <path d={areaPath} fill="rgba(17,24,39,0.06)" />
        {series.map((point, index) => {
          const x = xFor(index);
          const buyHeight = (point.buy / maxTrade) * barMaxHeight;
          const sellHeight = (point.sell / maxTrade) * barMaxHeight;
          return (
            <g key={`${point.label}-${index}`}>
              <rect x={x - barWidth - 1} y={barBase - buyHeight} width={barWidth} height={buyHeight} rx="2" fill="rgba(37,99,235,0.58)" />
              <rect x={x + 1} y={barBase - sellHeight} width={barWidth} height={sellHeight} rx="2" fill="rgba(220,38,38,0.58)" />
            </g>
          );
        })}
        <path d={linePath} fill="none" stroke="#111827" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
        {tickIndexes.map((index) => (
          <text key={index} x={xFor(index)} y={height - 16} textAnchor="middle" fill="#4b5563" fontSize="13">{series[index]?.label}</text>
        ))}
        <text x="12" y="22" fill="#111827" fontSize="13" fontWeight="700">Price ($)</text>
        <text x={width - 6} y="22" fill="#6b7280" fontSize="13" fontWeight="700" textAnchor="end">Volume</text>
        <text x={pad.left - 12} y={yForPrice(maxPrice) + 4} fill="#111827" fontSize="12" textAnchor="end">{money(maxPrice)}</text>
        <text x={pad.left - 12} y={yForPrice(minPrice) + 4} fill="#111827" fontSize="12" textAnchor="end">{money(minPrice)}</text>
      </svg>
    </div>
  );
}

export default function MarketView() {
  const [symbol, setSymbol] = useState('NVDA');
  const [rangeIndex, setRangeIndex] = useState(0);
  const rangeConfig = RANGES[rangeIndex];
  const [series, setSeries] = useState(() => buildBuySellTradeBars(makeFallbackSeries('NVDA', RANGES[0])));
  const [status, setStatus] = useState('Loading live data...');
  const stats = useMemo(() => statsFor(series, rangeConfig.label), [series, rangeConfig.label]);

  useEffect(() => {
    let cancelled = false;
    setStatus('Loading live data...');

    const proxyUrl = `https://bazaartoday.com/stock-proxy.php?symbol=${encodeURIComponent(symbol)}&range=${encodeURIComponent(rangeConfig.range)}&interval=${encodeURIComponent(rangeConfig.interval)}`;

    fetch(proxyUrl)
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.error) throw new Error(json.message || 'Proxy error');
        const parsed = parseYahooChart(json, rangeConfig);
        if (!parsed.length) throw new Error('No stock data returned');
        setSeries(buildBuySellTradeBars(parsed));
        setStatus('Live BazaarToday market data');
      })
      .catch(() => {
        if (cancelled) return;
        setSeries(buildBuySellTradeBars(makeFallbackSeries(symbol, rangeConfig)));
        setStatus('Preview data shown while live market data is unavailable');
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, rangeConfig]);

  const changePositive = stats.change >= 0;
  const netPositive = stats.net >= 0;

  return (
    <section className="market-view">
      <div className="market-ticker-wrap" aria-label="Market ticker">
        <div className="market-ticker-track">
          {[...TICKER_QUOTES, ...TICKER_QUOTES].map(([ticker, price], index) => (
            <button key={`${ticker}-${index}`} type="button" className="market-ticker-item" onClick={() => setSymbol(ticker === 'GOOG' ? 'GOOGL' : ticker)}>
              <span>{ticker}</span>
              <strong>{money(price)}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="market-dashboard">
        <div className="market-symbols" aria-label="Stock symbols">
          {SYMBOLS.map((item) => (
            <button key={item} type="button" className={`market-symbol-btn ${item === symbol ? 'active' : ''}`} onClick={() => setSymbol(item)}>
              {item}
            </button>
          ))}
        </div>

        <div className="market-topline">
          <div>
            <div className="market-eyebrow">Stock chart</div>
            <h3>{symbol}</h3>
            <p>{status}</p>
          </div>
          <div className="market-ranges" aria-label="Time ranges">
            {RANGES.map((range, index) => (
              <button key={range.label} type="button" className={`market-range-btn ${index === rangeIndex ? 'active' : ''}`} onClick={() => setRangeIndex(index)}>
                {range.label}
              </button>
            ))}
          </div>
        </div>

        <div className="market-stats">
          <div className="market-current-price">{money(stats.last)}</div>
          <div><b>Min</b><span>{money(stats.min)}</span></div>
          <div><b>Max</b><span>{money(stats.max)}</span></div>
          <div><b>Avg</b><span>{money(stats.avg)}</span></div>
          <div><b>{stats.rangeLabel}</b><span className={changePositive ? 'positive' : 'negative'}>{changePositive ? '+' : ''}{stats.change.toFixed(2)}%</span></div>
          <div><b>Buy</b><span className="buy">{compactShares(stats.buy)}</span></div>
          <div><b>Sell</b><span className="sell">{compactShares(stats.sell)}</span></div>
          <div><b>Net</b><span className={netPositive ? 'positive' : 'negative'}>{netPositive ? '+' : ''}{compactShares(stats.net)}</span></div>
        </div>

        <div className="market-trade-note">
          <span><i className="market-dot buy" />Buy trades</span>
          <span><i className="market-dot sell" />Sell trades</span>
          <span><i className="market-dot price" />Price</span>
        </div>

        <StockChart series={series} />
      </div>
    </section>
  );
}
