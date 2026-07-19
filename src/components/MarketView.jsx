import React, { useEffect, useMemo, useState } from 'react';

const SYMBOLS = ['NVDA', 'PLTR', 'GOOGL', 'AAPL', 'MSFT', 'META', 'CRWV', 'MU', 'QCOM', 'UBER', 'AMZN', 'SPCX', 'AMD', 'INTC', 'TSLA', 'SBUX', 'ORCL', 'MDB', 'BAC', 'WMT'];
const RANGES = [
  { label: '1D', range: '1d', interval: '5m', points: 46 },
  { label: '5D', range: '5d', interval: '30m', points: 42 },
  { label: '1M', range: '1mo', interval: '1d', points: 30 },
  { label: '3M', range: '3mo', interval: '1d', points: 60 },
  { label: '6M', range: '6mo', interval: '1wk', points: 28 },
  { label: '1Y', range: '1y', interval: '1wk', points: 52 },
  { label: '2Y', range: '2y', interval: '1mo', points: 24 },
  { label: '5Y', range: '5y', interval: '1mo', points: 60 },
  { label: 'Max', range: 'max', interval: '3mo', points: 80 },
];
const CHART_LAYERS = ['price', 'sell', 'buy'];
const CHART_LAYER_LABELS = {
  price: 'Price',
  sell: 'Sell',
  buy: 'Buy',
};
const STOCK_PROXY_PATH = '/stock-proxy.php';
const PREVIEW_SYMBOL = 'NVDA';
const ECONOMIC_NEWS = [
  { title: 'Fed rate outlook keeps megacap tech in focus', source: 'Market Desk', time: 'Today' },
  { title: 'Chip demand lifts AI infrastructure forecasts', source: 'Economy Watch', time: 'Today' },
  { title: 'Treasury yields steady as investors weigh earnings', source: 'Global Markets', time: 'Today' },
  { title: 'Oil prices edge higher as supply concerns return', source: 'Energy Brief', time: 'Today' },
  { title: 'Retail sales data points to resilient consumer demand', source: 'US Economy', time: 'Today' },
  { title: 'Dollar softens before central bank commentary', source: 'FX Monitor', time: 'Today' },
  { title: 'Semiconductor earnings shape broader Nasdaq sentiment', source: 'Tech Markets', time: 'Today' },
  { title: 'Bond traders watch inflation expectations into close', source: 'Rates Desk', time: 'Today' },
];

function stockProxyUrl(symbol, rangeConfig) {
  const params = new URLSearchParams({
    symbol,
    range: rangeConfig.range,
    interval: rangeConfig.interval,
  });
  return `${STOCK_PROXY_PATH}?${params.toString()}`;
}

function money(value) {
  if (value === null || value === undefined || Number.isNaN(Number(value))) return 'N/A';
  return `$${Number(value).toFixed(2)}`;
}

function compactShares(value) {
  const numeric = Math.abs(Number(value || 0));
  const sign = Number(value || 0) < 0 ? '-' : '';
  if (numeric >= 1_000_000_000) return `${sign}${(numeric / 1_000_000_000).toFixed(2)}B`;
  if (numeric >= 1_000_000) return `${sign}${(numeric / 1_000_000).toFixed(2)}M`;
  if (numeric >= 1_000) return `${sign}${(numeric / 1_000).toFixed(1)}K`;
  return `${sign}${numeric.toFixed(0)}`;
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
  if (!series.length) {
    return { min: null, max: null, avg: null, first: null, last: null, change: null, buy: 0, sell: 0, net: 0, rangeLabel };
  }
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

function StockChart({ series, visibleLayers, setVisibleLayers }) {
  const [hoverIndex, setHoverIndex] = useState(null);

  if (!series.length) {
    return <div className="market-chart-box market-chart-empty">Live market data unavailable</div>;
  }

  const width = 960;
  const height = 330;
  const pad = { top: 12, right: 82, bottom: 62, left: 78 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const priceTop = pad.top;
  const volumeTop = pad.top + plotH * 0.34;
  const volumeBottom = height - pad.bottom;
  const volumeH = volumeBottom - volumeTop;
  const plotBottom = volumeBottom;
  const plotFrameH = plotBottom - pad.top;
  const prices = series.map((point) => point.price);
  const minPrice = Math.min(...prices);
  const maxPrice = Math.max(...prices);
  const priceSpan = Math.max(1, maxPrice - minPrice);
  const maxTrade = Math.max(...series.map((point) => Math.max(point.buy, point.sell)), 1);
  const xFor = (index) => pad.left + (series.length <= 1 ? plotW / 2 : (index / (series.length - 1)) * plotW);
  const yForPrice = (price) => priceTop + (1 - ((price - minPrice) / priceSpan)) * (plotH * 0.52);
  const barWidth = Math.max(3, Math.min(12, plotW / series.length / 3));
  const linePath = series.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yForPrice(point.price)}`).join(' ');
  const areaBase = volumeBottom;
  const areaPath = `${linePath} L ${xFor(series.length - 1)} ${areaBase} L ${xFor(0)} ${areaBase} Z`;
  const tickIndexes = [0, Math.floor(series.length * 0.25), Math.floor(series.length * 0.5), Math.floor(series.length * 0.75), series.length - 1]
    .filter((value, index, all) => all.indexOf(value) === index);
  const volumeTicks = [0, 0.5, 1];
  const showPrice = visibleLayers.price;
  const showBuy = visibleLayers.buy;
  const showSell = visibleLayers.sell;
  const hoverPoint = hoverIndex === null ? null : series[hoverIndex];
  const hoverX = hoverIndex === null ? 0 : xFor(hoverIndex);
  const hoverY = hoverPoint ? yForPrice(hoverPoint.price) : 0;
  const tooltipW = 174;
  const tooltipH = 82;
  const tooltipX = Math.min(width - pad.right - tooltipW - 8, Math.max(pad.left + 8, hoverX + 12));
  const tooltipY = hoverY > pad.top + tooltipH + 16 ? hoverY - tooltipH - 10 : hoverY + 12;

  const handlePointerMove = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    const svgX = ((event.clientX - rect.left) / rect.width) * width;
    const ratio = Math.max(0, Math.min(1, (svgX - pad.left) / plotW));
    const nextIndex = Math.round(ratio * (series.length - 1));
    setHoverIndex(Math.max(0, Math.min(series.length - 1, nextIndex)));
  };

  const toggleLayer = (layer) => {
    setVisibleLayers((current) => {
      const enabledCount = CHART_LAYERS.filter((item) => current[item]).length;
      if (current[layer] && enabledCount === 1) return current;
      return { ...current, [layer]: !current[layer] };
    });
  };

  return (
    <div className="market-chart-box">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        role="img"
        aria-label="Stock price and buy sell volume chart"
        onMouseMove={handlePointerMove}
        onMouseLeave={() => setHoverIndex(null)}
      >
        <rect x={pad.left} y={pad.top} width={plotW} height={plotFrameH} rx="8" fill="#fff" stroke="#e5e7eb" />
        {[0, 1, 2, 3, 4].map((tick) => {
          const y = pad.top + tick * (plotFrameH / 4);
          return <line key={tick} x1={pad.left} x2={width - pad.right} y1={y} y2={y} stroke="#edf2f7" strokeDasharray="5 5" />;
        })}
        <line x1={pad.left} x2={width - pad.right} y1={volumeTop} y2={volumeTop} stroke="#d1d5db" strokeDasharray="4 4" />
        {showPrice && <path d={areaPath} fill="rgba(147,197,253,0.26)" />}
        {series.map((point, index) => {
          const x = xFor(index);
          const buyHeight = (point.buy / maxTrade) * volumeH;
          const sellHeight = (point.sell / maxTrade) * volumeH;
          return (
            <g key={`${point.label}-${index}`}>
              {showBuy && (
                <rect x={x - barWidth - 1} y={volumeBottom - buyHeight} width={barWidth} height={buyHeight} rx="2" fill="rgba(37,99,235,0.58)">
                  <title>{`${point.label}\nBuy: ${compactShares(point.buy)}\nPrice: ${money(point.price)}`}</title>
                </rect>
              )}
              {showSell && (
                <rect x={x + 1} y={volumeBottom - sellHeight} width={barWidth} height={sellHeight} rx="2" fill="rgba(220,38,38,0.58)">
                  <title>{`${point.label}\nSell: ${compactShares(point.sell)}\nPrice: ${money(point.price)}`}</title>
                </rect>
              )}
            </g>
          );
        })}
        {showPrice && <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />}
        {showPrice && series.map((point, index) => (
          <circle key={`point-${point.label}-${index}`} cx={xFor(index)} cy={yForPrice(point.price)} r="9" fill="transparent">
            <title>{`${point.label}\nPrice: ${money(point.price)}\nBuy: ${compactShares(point.buy)}\nSell: ${compactShares(point.sell)}\nVolume: ${compactShares(point.volume)}`}</title>
          </circle>
        ))}
        {tickIndexes.map((index) => (
          <text key={index} x={xFor(index)} y={height - 42} textAnchor="middle" fill="#4b5563" fontSize="13">{series[index]?.label}</text>
        ))}
        {showPrice && <text x={pad.left - 12} y={yForPrice(maxPrice) + 4} fill="#111827" fontSize="12" textAnchor="end">{money(maxPrice)}</text>}
        {showPrice && <text x={pad.left - 12} y={yForPrice(minPrice) + 4} fill="#111827" fontSize="12" textAnchor="end">{money(minPrice)}</text>}
        {volumeTicks.map((tick) => {
          const value = maxTrade * tick;
          const y = volumeBottom - tick * volumeH;
          return (
            <text key={tick} x={width - pad.right + 10} y={y + 4} fill="#6b7280" fontSize="12">
              {compactShares(value)}
            </text>
          );
        })}
        <rect x={pad.left} y={pad.top} width={plotW} height={plotFrameH} fill="transparent" />
        {hoverPoint && (
          <g pointerEvents="none">
            <line x1={pad.left} x2={width - pad.right} y1={hoverY} y2={hoverY} stroke="#0ea5e9" strokeWidth="1.5" strokeDasharray="5 4" />
            <line x1={hoverX} x2={hoverX} y1={pad.top} y2={plotBottom} stroke="#94a3b8" strokeWidth="1" strokeDasharray="3 5" opacity="0.8" />
            <circle cx={hoverX} cy={hoverY} r="5" fill="#2563eb" stroke="#fff" strokeWidth="2" />
            <rect x={width - pad.right + 8} y={hoverY - 12} width="64" height="24" rx="6" fill="#0f172a" />
            <text x={width - pad.right + 40} y={hoverY + 4} fill="#fff" fontSize="12" fontWeight="700" textAnchor="middle">{money(hoverPoint.price)}</text>
            <rect x={tooltipX} y={tooltipY} width={tooltipW} height={tooltipH} rx="8" fill="rgba(15,23,42,0.94)" />
            <text x={tooltipX + 10} y={tooltipY + 18} fill="#dbeafe" fontSize="12" fontWeight="700">{hoverPoint.label}</text>
            <text x={tooltipX + 10} y={tooltipY + 36} fill="#fff" fontSize="12">Price: {money(hoverPoint.price)}</text>
            <text x={tooltipX + 10} y={tooltipY + 53} fill="#bfdbfe" fontSize="12">Buy: {compactShares(hoverPoint.buy)}</text>
            <text x={tooltipX + 92} y={tooltipY + 53} fill="#fecaca" fontSize="12">Sell: {compactShares(hoverPoint.sell)}</text>
            <text x={tooltipX + 10} y={tooltipY + 70} fill="#cbd5e1" fontSize="12">Volume: {compactShares(hoverPoint.volume)}</text>
          </g>
        )}
      </svg>
      <div className="market-chart-filters in-graph" aria-label="Chart layers">
        {CHART_LAYERS.map((layer) => (
          <button
            key={layer}
            type="button"
            aria-pressed={visibleLayers[layer]}
            className={`market-layer-btn ${visibleLayers[layer] ? 'active' : ''} ${layer}`}
            onClick={() => toggleLayer(layer)}
          >
            <span className="market-layer-dot" />
            {CHART_LAYER_LABELS[layer]}
          </button>
        ))}
      </div>
    </div>
  );
}

function StockCardPreview({ symbol, stats, series, rangeConfig, changePositive }) {
  const width = 360;
  const height = 76;
  const pad = { top: 10, right: 10, bottom: 16, left: 10 };
  const plotW = width - pad.left - pad.right;
  const plotH = height - pad.top - pad.bottom;
  const prices = series.map((point) => point.price);
  const minPrice = prices.length ? Math.min(...prices) : 0;
  const maxPrice = prices.length ? Math.max(...prices) : 1;
  const priceSpan = Math.max(1, maxPrice - minPrice);
  const maxTrade = Math.max(...series.map((point) => Math.max(point.buy, point.sell)), 1);
  const xFor = (index) => pad.left + (series.length <= 1 ? plotW / 2 : (index / (series.length - 1)) * plotW);
  const yForPrice = (price) => pad.top + (1 - ((price - minPrice) / priceSpan)) * (plotH * 0.6);
  const linePath = series.length
    ? series.map((point, index) => `${index === 0 ? 'M' : 'L'} ${xFor(index)} ${yForPrice(point.price)}`).join(' ')
    : 'M 10 44 C 62 30, 92 50, 138 34 S 226 20, 350 28';
  const areaBase = height - pad.bottom;
  const areaPath = series.length
    ? `${linePath} L ${xFor(series.length - 1)} ${areaBase} L ${xFor(0)} ${areaBase} Z`
    : `${linePath} L 350 ${areaBase} L 10 ${areaBase} Z`;
  const step = Math.max(1, Math.ceil(series.length / 42));
  const sampledBars = series.filter((_, index) => index % step === 0);
  const barWidth = Math.max(2, Math.min(5, plotW / Math.max(sampledBars.length, 1) / 3));

  return (
    <div className="market-dashboard-preview" aria-hidden="true">
      <div className="market-preview-head">
        <span>{symbol}</span>
        <strong>{money(stats.last)}</strong>
      </div>
      <div className="market-preview-body">
        <div className="market-preview-stats">
          <span>{rangeConfig.label}</span>
          <span className={changePositive ? 'positive' : 'negative'}>
            {stats.change === null ? 'Loading' : `${changePositive ? '+' : ''}${stats.change.toFixed(2)}%`}
          </span>
          <span>Buy {compactShares(stats.buy)}</span>
          <span>Sell {compactShares(stats.sell)}</span>
        </div>
        <div className="market-preview-chart">
          <svg viewBox={`0 0 ${width} ${height}`} preserveAspectRatio="none">
            <rect x={pad.left} y={pad.top} width={plotW} height={areaBase - pad.top} rx="6" fill="#fff" stroke="#dbeafe" />
            <path d={areaPath} fill="rgba(147,197,253,0.34)" />
            {sampledBars.map((point, index) => {
              const sourceIndex = index * step;
              const x = xFor(sourceIndex);
              const buyHeight = (point.buy / maxTrade) * (plotH * 0.34);
              const sellHeight = (point.sell / maxTrade) * (plotH * 0.34);
              return (
                <g key={`${point.label}-${sourceIndex}`}>
                  <rect x={x - barWidth - 1} y={areaBase - buyHeight} width={barWidth} height={buyHeight} rx="1" fill="rgba(37,99,235,0.52)" />
                  <rect x={x + 1} y={areaBase - sellHeight} width={barWidth} height={sellHeight} rx="1" fill="rgba(220,38,38,0.48)" />
                </g>
              );
            })}
            <path d={linePath} fill="none" stroke="#2563eb" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />
          </svg>
        </div>
      </div>
    </div>
  );
}

function EconomicNewsPreview() {
  return (
    <div className="market-dashboard-news">
      <div className="market-news-list">
        {ECONOMIC_NEWS.map((item) => (
          <article key={item.title} className="market-news-item">
            <h4>{item.title}</h4>
            <p>{item.source} - {item.time}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export default function MarketView() {
  const [symbol, setSymbol] = useState('NVDA');
  const [rangeIndex, setRangeIndex] = useState(0);
  const rangeConfig = RANGES[rangeIndex];
  const [series, setSeries] = useState([]);
  const [previewSeries, setPreviewSeries] = useState([]);
  const [tickerQuotes, setTickerQuotes] = useState({});
  const [visibleLayers, setVisibleLayers] = useState({ price: true, sell: true, buy: true });
  const stats = useMemo(() => statsFor(series, rangeConfig.label), [series, rangeConfig.label]);
  const previewRange = RANGES[0];
  const previewStats = useMemo(() => statsFor(previewSeries, previewRange.label), [previewSeries, previewRange.label]);

  useEffect(() => {
    let cancelled = false;
    setSeries([]);

    const proxyUrl = stockProxyUrl(symbol, rangeConfig);

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
        setTickerQuotes((current) => ({ ...current, [symbol]: parsed[parsed.length - 1].price }));
      })
      .catch(() => {
        if (cancelled) return;
        setSeries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [symbol, rangeConfig]);

  useEffect(() => {
    let cancelled = false;
    const quoteRange = RANGES[0];

    Promise.all(SYMBOLS.map((item) => {
      const proxyUrl = stockProxyUrl(item, quoteRange);
      return fetch(proxyUrl)
        .then((response) => {
          if (!response.ok) throw new Error(`HTTP ${response.status}`);
          return response.json();
        })
        .then((json) => {
          if (json?.error) throw new Error(json.message || 'Proxy error');
          const parsed = parseYahooChart(json, quoteRange);
          return [item, parsed.at(-1)?.price ?? null];
        })
        .catch(() => [item, null]);
    })).then((entries) => {
      if (cancelled) return;
      setTickerQuotes(Object.fromEntries(entries.filter(([, price]) => price !== null)));
    });

    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    fetch(stockProxyUrl(PREVIEW_SYMBOL, previewRange))
      .then((response) => {
        if (!response.ok) throw new Error(`HTTP ${response.status}`);
        return response.json();
      })
      .then((json) => {
        if (cancelled) return;
        if (json?.error) throw new Error(json.message || 'Proxy error');
        const parsed = parseYahooChart(json, previewRange);
        if (!parsed.length) throw new Error('No stock data returned');
        setPreviewSeries(buildBuySellTradeBars(parsed));
      })
      .catch(() => {
        if (cancelled) return;
        setPreviewSeries([]);
      });

    return () => {
      cancelled = true;
    };
  }, [previewRange]);

  const changePositive = Number(stats.change || 0) >= 0;
  const previewChangePositive = Number(previewStats.change || 0) >= 0;
  const netPositive = stats.net >= 0;

  return (
    <section className="market-view">
      <div className="market-ticker-wrap" aria-label="Market ticker">
        <div className="market-ticker-track">
          {[...SYMBOLS, ...SYMBOLS].map((ticker, index) => (
            <button key={`${ticker}-${index}`} type="button" className="market-ticker-item" onClick={() => setSymbol(ticker)}>
              <span>{ticker}</span>
              <strong>{money(tickerQuotes[ticker])}</strong>
            </button>
          ))}
        </div>
      </div>

      <div className="market-overview">
        <div className="market-dashboard market-overview-card" tabIndex={0} aria-label="Hover or focus to expand stock card">
          <StockCardPreview
            symbol={PREVIEW_SYMBOL}
            stats={previewStats}
            series={previewSeries}
            rangeConfig={previewRange}
            changePositive={previewChangePositive}
          />
          <div className="market-symbols" aria-label="Stock symbols">
            {SYMBOLS.map((item) => (
              <button key={item} type="button" className={`market-symbol-btn ${item === symbol ? 'active' : ''}`} onClick={() => setSymbol(item)}>
                {item}
              </button>
            ))}
          </div>

          <div className="market-topline">
            <div>
              <h3>{symbol}</h3>
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
            <div><b>{stats.rangeLabel}</b><span className={changePositive ? 'positive' : 'negative'}>{stats.change === null ? 'N/A' : `${changePositive ? '+' : ''}${stats.change.toFixed(2)}%`}</span></div>
            <div><b>Buy</b><span className="buy">{compactShares(stats.buy)}</span></div>
            <div><b>Sell</b><span className="sell">{compactShares(stats.sell)}</span></div>
            <div><b>Net</b><span className={netPositive ? 'positive' : 'negative'}>{netPositive ? '+' : ''}{compactShares(stats.net)}</span></div>
          </div>

          <StockChart series={series} visibleLayers={visibleLayers} setVisibleLayers={setVisibleLayers} />
        </div>

        <div className="market-news-card market-overview-card" tabIndex={0} aria-label="Hover or focus to expand economic news">
          <EconomicNewsPreview />
        </div>
      </div>
    </section>
  );
}
