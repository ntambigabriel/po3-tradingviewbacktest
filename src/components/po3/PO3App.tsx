import { useEffect, useRef, useState, useCallback } from "react";
import {
  createChart,
  IChartApi,
  ISeriesApi,
  LineStyle,
  CrosshairMode,
  UTCTimestamp,
  SeriesMarker,
  Time,
} from "lightweight-charts";
import { COLORS, SPEED_MS, STATE_COLOR, STATE_LABEL } from "./constants";
import { Bar, fetchKlines, buildH1Map, H1Candle } from "@/lib/binance";
import { StrategyEngine, DEFAULT_PARAMS, StrategyParams, Snapshot, StrategyEvent } from "@/lib/strategy";
import Dashboard from "./Dashboard";
import Demo, { DemoState } from "./Demo";
import BacktestPanel, { BacktestResults } from "./BacktestPanel";

const todayStr = () => new Date().toISOString().slice(0, 10);
const sevenDaysAgo = () => new Date(Date.now() - 7 * 86400000).toISOString().slice(0, 10);

export default function PO3App() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const overlaySeriesRef = useRef<{ [key: string]: ISeriesApi<"Line"> }>({});

  const barsRef = useRef<Bar[]>([]);
  const h1MapRef = useRef<Map<number, H1Candle>>(new Map());
  const engineRef = useRef<StrategyEngine>(new StrategyEngine(DEFAULT_PARAMS));

  const [params, setParams] = useState<StrategyParams>(DEFAULT_PARAMS);
  const [snapshot, setSnapshot] = useState<Snapshot | null>(null);
  const [showStats, setShowStats] = useState(false);
  const [showDemo, setShowDemo] = useState(false);
  const [showBacktest, setShowBacktest] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [speed, setSpeed] = useState<keyof typeof SPEED_MS>("5x");
  const [startDate, setStartDate] = useState(sevenDaysAgo());
  const [endDate, setEndDate] = useState(todayStr());
  const [loading, setLoading] = useState(false);
  const [loadProgress, setLoadProgress] = useState({ fetched: 0, total: 0 });
  const [loadingMessage, setLoadingMessage] = useState("Fetching BTCUSDT 1m data...");
  const [results, setResults] = useState<BacktestResults | null>(null);
  const [running, setRunning] = useState(false);
  const [currentBarIndex, setCurrentBarIndex] = useState(0);

  const playRef = useRef<number | null>(null);
  const idxRef = useRef(0);

  const allMarkersRef = useRef<SeriesMarker<Time>[]>([]);

  const [demo, setDemo] = useState<DemoState>({
    startBalance: 10000,
    balance: 10000,
    riskMode: "pct",
    riskPct: 1,
    riskDollar: 100,
    leverage: 1,
    openTrades: [],
    log: [],
    totalR: 0,
  });
  const demoRef = useRef(demo);
  useEffect(() => { demoRef.current = demo; }, [demo]);

  // Init chart
  useEffect(() => {
    if (!chartContainerRef.current) return;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { color: COLORS.bg }, textColor: COLORS.axis },
      grid: { vertLines: { color: COLORS.grid }, horzLines: { color: COLORS.grid } },
      crosshair: { mode: CrosshairMode.Normal, vertLine: { color: COLORS.crosshair }, horzLine: { color: COLORS.crosshair } },
      rightPriceScale: { borderColor: COLORS.border },
      timeScale: { borderColor: COLORS.border, timeVisible: true, secondsVisible: false },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
    });
    const series = chart.addCandlestickSeries({
      upColor: COLORS.green, downColor: COLORS.red,
      borderUpColor: COLORS.green, borderDownColor: COLORS.red,
      wickUpColor: COLORS.green, wickDownColor: COLORS.red,
    });
    chartRef.current = chart;
    candleSeriesRef.current = series;

    const ro = new ResizeObserver(() => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.resize(chartContainerRef.current.clientWidth, chartContainerRef.current.clientHeight);
      }
    });
    ro.observe(chartContainerRef.current);

    return () => {
      ro.disconnect();
      chart.remove();
      chartRef.current = null;
      candleSeriesRef.current = null;
    };
  }, []);

  const clearOverlays = useCallback(() => {
    if (!chartRef.current) return;
    Object.values(overlaySeriesRef.current).forEach((s) => {
      try { chartRef.current!.removeSeries(s); } catch {}
    });
    overlaySeriesRef.current = {};
  }, []);

  const drawOverlays = useCallback((snap: Snapshot, currentBar: Bar) => {
    if (!chartRef.current) return;
    clearOverlays();
    const chart = chartRef.current;
    const ext = params.extBars;
    const futureTime = (currentBar.time + ext * 60) as UTCTimestamp;

    const addLine = (key: string, color: string, style: LineStyle, points: { time: UTCTimestamp; value: number }[]) => {
      const s = chart.addLineSeries({ color, lineWidth: 1, lineStyle: style, priceLineVisible: false, lastValueVisible: false });
      s.setData(points);
      overlaySeriesRef.current[key] = s;
    };

    const startTime = (snap.p1Bar !== null && barsRef.current[snap.p1Bar]) ? (barsRef.current[snap.p1Bar].time as UTCTimestamp) : (currentBar.time as UTCTimestamp);

    if (snap.state === 3 && snap.p1 !== null) {
      addLine("p1", "#ffffff", LineStyle.Dashed, [
        { time: startTime, value: snap.p1 },
        { time: futureTime, value: snap.p1 },
      ]);
    }

    if (snap.inBuyTrade && snap.buyEntry && snap.buySL && snap.buyTP && snap.buyMid) {
      const buyP1Bar = snap.buyP1Bar;
      const tradeStart = buyP1Bar !== null && barsRef.current[buyP1Bar] ? (barsRef.current[buyP1Bar].time as UTCTimestamp) : (currentBar.time as UTCTimestamp);
      addLine("buyEntry", "#1848A0", LineStyle.Solid, [
        { time: tradeStart, value: snap.buyEntry },
        { time: futureTime, value: snap.buyEntry },
      ]);
      addLine("buySL", "#1848A0", LineStyle.Solid, [
        { time: tradeStart, value: snap.buySL },
        { time: futureTime, value: snap.buySL },
      ]);
      addLine("buyTP", "#404040", LineStyle.Solid, [
        { time: tradeStart, value: snap.buyTP },
        { time: futureTime, value: snap.buyTP },
      ]);
      addLine("buyMid", snap.midTouched ? "#ff3333" : "#ffd700", LineStyle.Solid, [
        { time: tradeStart, value: snap.buyMid },
        { time: futureTime, value: snap.buyMid },
      ]);
    }

    snap.openSells.forEach((sell, i) => {
      const ts = (barsRef.current[sell.bar]?.time ?? currentBar.time) as UTCTimestamp;
      addLine(`sellE_${i}`, "#ffd700", LineStyle.Dashed, [
        { time: ts, value: sell.entry },
        { time: futureTime, value: sell.entry },
      ]);
      addLine(`sellSL_${i}`, "#ff3333", LineStyle.Dashed, [
        { time: ts, value: sell.sl },
        { time: futureTime, value: sell.sl },
      ]);
      addLine(`sellTP_${i}`, "#00d060", LineStyle.Dashed, [
        { time: ts, value: sell.tp },
        { time: futureTime, value: sell.tp },
      ]);
    });
  }, [clearOverlays, params.extBars]);

  const applyEventsToDemo = useCallback((events: StrategyEvent[]) => {
    let d = { ...demoRef.current };
    let mutated = false;
    for (const ev of events) {
      if (ev.type === "SELL_ENTRY") {
        d.openTrades = [...d.openTrades, { type: "SELL", entry: ev.entry, sl: ev.sl, tp: ev.tp }];
        mutated = true;
      } else if (ev.type === "SELL_WIN" || ev.type === "SELL_LOSS") {
        const tr = ev.trade;
        const idx = d.openTrades.findIndex((t) => t.entry === tr.entry && t.sl === tr.sl);
        if (idx >= 0) d.openTrades = d.openTrades.filter((_, i) => i !== idx);
        const riskAmt = d.riskMode === "pct" ? d.balance * (d.riskPct / 100) : d.riskDollar;
        const r = ev.type === "SELL_WIN" ? params.sellTpR : -1;
        const pnl = riskAmt * r * d.leverage;
        d.balance = d.balance + pnl;
        d.totalR += r;
        d.log = [
          { type: "SELL" as const, entry: tr.entry, sl: tr.sl, tp: tr.tp, time: ev.bar.time, result: (ev.type === "SELL_WIN" ? "WIN" : "LOSS") as "WIN" | "LOSS", r, pnl },
          ...d.log,
        ].slice(0, 200);
        mutated = true;
      }
    }
    if (mutated) setDemo(d);
  }, [params.sellTpR]);

  const fullMarkersRebuild = useCallback(() => {
    if (candleSeriesRef.current) candleSeriesRef.current.setMarkers(allMarkersRef.current);
  }, []);

  const collectMarkers = useCallback((events: StrategyEvent[]) => {
    for (const ev of events) {
      const time = ev.bar.time as UTCTimestamp;
      if (ev.type === "BUY_ENTRY") {
        allMarkersRef.current.push({ time, position: "belowBar", color: "#26a69a", shape: "arrowUp", text: "BUY" });
      } else if (ev.type === "SELL_WIN") {
        allMarkersRef.current.push({ time, position: "belowBar", color: "#00d060", shape: "circle", text: "TP ✓" });
      } else if (ev.type === "SELL_LOSS") {
        allMarkersRef.current.push({ time, position: "aboveBar", color: "#ff8800", shape: "circle", text: "SL ✗" });
      } else if (ev.type === "MID_TOUCHED") {
        allMarkersRef.current.push({ time, position: "belowBar", color: "#ffd700", shape: "circle" });
      }
    }
  }, []);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadingMessage("Fetching BTCUSDT 1m data...");
    try {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime() + 86399000;
      const bars = await fetchKlines(start, end, (f, t) => setLoadProgress({ fetched: f, total: t }));
      barsRef.current = bars;
      h1MapRef.current = buildH1Map(bars);
      // Initial render: full data
      if (candleSeriesRef.current) {
        candleSeriesRef.current.setData(bars.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
        candleSeriesRef.current.setMarkers([]);
      }
      allMarkersRef.current = [];
      // Reset engine then process all bars to live edge
      engineRef.current = new StrategyEngine(params);
      let snap: Snapshot | null = null;
      for (const b of bars) {
        snap = engineRef.current.processBar(b, h1MapRef.current);
        collectMarkers(engineRef.current.events);
        applyEventsToDemo(engineRef.current.events);
      }
      setSnapshot(snap);
      idxRef.current = bars.length - 1;
      setCurrentBarIndex(bars.length - 1);
      fullMarkersRebuild();
      if (snap && bars.length) drawOverlays(snap, bars[bars.length - 1]);
      chartRef.current?.timeScale().fitContent();
    } catch (e) {
      console.error(e);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate, params, applyEventsToDemo, collectMarkers, drawOverlays, fullMarkersRebuild]);

  // initial fetch
  useEffect(() => {
    loadData();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Replay loop
  useEffect(() => {
    if (!playing) {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
      return;
    }
    const ms = SPEED_MS[speed];
    playRef.current = window.setInterval(() => {
      const bars = barsRef.current;
      if (idxRef.current >= bars.length - 1) {
        setPlaying(false);
        return;
      }
      idxRef.current++;
      const bar = bars[idxRef.current];
      if (candleSeriesRef.current) {
        candleSeriesRef.current.update({ time: bar.time as UTCTimestamp, open: bar.open, high: bar.high, low: bar.low, close: bar.close });
      }
      const snap = engineRef.current.processBar(bar, h1MapRef.current);
      collectMarkers(engineRef.current.events);
      applyEventsToDemo(engineRef.current.events);
      fullMarkersRebuild();
      setSnapshot(snap);
      setCurrentBarIndex(idxRef.current);
      drawOverlays(snap, bar);
    }, ms);
    return () => {
      if (playRef.current) {
        clearInterval(playRef.current);
        playRef.current = null;
      }
    };
  }, [playing, speed, drawOverlays, applyEventsToDemo, collectMarkers, fullMarkersRebuild]);

  const reset = () => {
    setPlaying(false);
    engineRef.current = new StrategyEngine(params);
    allMarkersRef.current = [];
    setDemo((d) => ({ ...d, balance: d.startBalance, openTrades: [], log: [], totalR: 0 }));
    idxRef.current = 0;
    setCurrentBarIndex(0);
    if (candleSeriesRef.current) candleSeriesRef.current.setMarkers([]);
    clearOverlays();
    if (barsRef.current.length && candleSeriesRef.current) {
      candleSeriesRef.current.setData([{ time: barsRef.current[0].time as UTCTimestamp, open: barsRef.current[0].open, high: barsRef.current[0].high, low: barsRef.current[0].low, close: barsRef.current[0].close }]);
    }
    setSnapshot(null);
  };

  const goToEnd = () => {
    if (!barsRef.current.length) return;
    setPlaying(false);
    engineRef.current = new StrategyEngine(params);
    allMarkersRef.current = [];
    let snap: Snapshot | null = null;
    setDemo((d) => ({ ...d, balance: d.startBalance, openTrades: [], log: [], totalR: 0 }));
    for (const b of barsRef.current) {
      snap = engineRef.current.processBar(b, h1MapRef.current);
      collectMarkers(engineRef.current.events);
      applyEventsToDemo(engineRef.current.events);
    }
    if (candleSeriesRef.current) {
      candleSeriesRef.current.setData(barsRef.current.map((b) => ({ time: b.time as UTCTimestamp, open: b.open, high: b.high, low: b.low, close: b.close })));
    }
    fullMarkersRebuild();
    idxRef.current = barsRef.current.length - 1;
    setCurrentBarIndex(idxRef.current);
    setSnapshot(snap);
    if (snap && barsRef.current.length) drawOverlays(snap, barsRef.current[barsRef.current.length - 1]);
  };

  const runBacktest = useCallback(async () => {
    setRunning(true);
    setLoading(true);
    setLoadingMessage("Running backtest...");
    try {
      const start = new Date(startDate).getTime();
      const end = new Date(endDate).getTime() + 86399000;
      // refetch if not in range
      const have = barsRef.current;
      if (!have.length || have[0].time * 1000 > start + 60000 || have[have.length - 1].time * 1000 < end - 86400000) {
        const bars = await fetchKlines(start, end, (f, t) => setLoadProgress({ fetched: f, total: t }));
        barsRef.current = bars;
        h1MapRef.current = buildH1Map(bars);
      }
      const bars = barsRef.current;
      const eng = new StrategyEngine(params);
      const allEvents: StrategyEvent[] = [];
      const equity: { time: number; r: number }[] = [];
      let cumR = 0;
      let peak = 0;
      let maxDD = 0;
      const dayMap = new Map<string, number>();
      const monthMap = new Map<string, { trades: number; wins: number; r: number }>();
      for (let i = 0; i < bars.length; i++) {
        eng.processBar(bars[i], h1MapRef.current);
        for (const ev of eng.events) {
          allEvents.push(ev);
          if (ev.type === "SELL_WIN" || ev.type === "SELL_LOSS" || ev.type === "BUY_WIN" || ev.type === "BUY_INVALIDATED") {
            const r = ev.type === "SELL_WIN" ? params.sellTpR : ev.type === "BUY_WIN" ? params.rrRatio : -1;
            cumR += r;
            peak = Math.max(peak, cumR);
            maxDD = Math.min(maxDD, cumR - peak);
            equity.push({ time: ev.bar.time, r: cumR });
            const dateStr = new Date((ev.bar.time + 3 * 3600) * 1000).toISOString().slice(0, 10);
            dayMap.set(dateStr, (dayMap.get(dateStr) ?? 0) + r);
            const monthStr = dateStr.slice(0, 7);
            const m = monthMap.get(monthStr) ?? { trades: 0, wins: 0, r: 0 };
            m.trades++;
            if (r > 0) m.wins++;
            m.r += r;
            monthMap.set(monthStr, m);
          }
        }
        if (i % 5000 === 0) {
          setLoadProgress({ fetched: i, total: bars.length });
          await new Promise((r) => requestAnimationFrame(() => r(null)));
        }
      }
      const trades = allEvents.filter((e) => e.type === "SELL_WIN" || e.type === "SELL_LOSS" || e.type === "BUY_WIN" || e.type === "BUY_INVALIDATED");
      const wins = allEvents.filter((e) => e.type === "SELL_WIN" || e.type === "BUY_WIN").length;
      const days = [...dayMap.entries()].map(([date, r]) => ({ date, r }));
      const best = days.reduce((a, b) => (b.r > a.r ? b : a), { date: "-", r: 0 });
      const worst = days.reduce((a, b) => (b.r < a.r ? b : a), { date: "-", r: 0 });
      const monthly = [...monthMap.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([month, m]) => ({ month, trades: m.trades, winRate: (m.wins / m.trades) * 100, r: m.r }));
      setResults({
        totalTrades: trades.length,
        winRate: trades.length ? (wins / trades.length) * 100 : 0,
        totalR: cumR,
        maxDrawdown: maxDD,
        avgRPerDay: days.length ? cumR / days.length : 0,
        bestDay: best,
        worstDay: worst,
        equity,
        monthly,
      });
    } catch (e) {
      console.error(e);
    } finally {
      setRunning(false);
      setLoading(false);
    }
  }, [startDate, endDate, params]);

  const SpeedBtn = ({ s }: { s: keyof typeof SPEED_MS }) => (
    <button
      onClick={() => setSpeed(s)}
      style={{
        background: speed === s ? COLORS.cyan : COLORS.pill,
        color: speed === s ? "#0b0f19" : COLORS.textDim,
        border: "none", padding: "4px 8px", borderRadius: 4, cursor: "pointer", fontSize: 11, marginLeft: 2,
      }}
    >
      {s}
    </button>
  );

  const PillBtn = ({ children, onClick, active }: { children: any; onClick: () => void; active?: boolean }) => (
    <button
      onClick={onClick}
      style={{
        background: active ? COLORS.pillHover : COLORS.pill,
        color: COLORS.textDim, border: "none", padding: "6px 10px",
        borderRadius: 4, cursor: "pointer", fontSize: 11, marginLeft: 4,
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => { (e.currentTarget as HTMLButtonElement).style.background = COLORS.pillHover; }}
      onMouseLeave={(e) => { (e.currentTarget as HTMLButtonElement).style.background = active ? COLORS.pillHover : COLORS.pill; }}
    >
      {children}
    </button>
  );

  const Sep = () => <span style={{ width: 1, height: 24, background: COLORS.border, margin: "0 8px", display: "inline-block" }} />;

  return (
    <div style={{ position: "fixed", inset: 0, background: COLORS.bg, color: "#ddd", display: "flex", flexDirection: "column", overflow: "hidden", fontFamily: "system-ui, -apple-system, sans-serif" }}>
      {/* TOOLBAR */}
      <div style={{ height: 44, background: COLORS.toolbar, borderBottom: `1px solid ${COLORS.border}`, display: "flex", alignItems: "center", padding: "0 12px", flexShrink: 0 }}>
        <div style={{ color: COLORS.cyan, fontFamily: "ui-monospace, monospace", fontSize: 12, fontWeight: 700, letterSpacing: 1, fontVariant: "small-caps" }}>
          PO3 MODEL A
        </div>
        <div style={{ flex: 1, display: "flex", justifyContent: "center", gap: 4 }}>
          <span style={{ background: COLORS.pillBadgeBg, color: COLORS.pillBadgeText, padding: "4px 10px", borderRadius: 12, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>BTCUSDT</span>
          <span style={{ background: COLORS.pillBadgeBg, color: COLORS.pillBadgeText, padding: "4px 10px", borderRadius: 12, fontSize: 11, fontFamily: "ui-monospace, monospace" }}>1m</span>
        </div>
        <div style={{ display: "flex", alignItems: "center" }}>
          <PillBtn onClick={() => setShowStats((v) => !v)} active={showStats}>📊 Stats</PillBtn>
          <PillBtn onClick={() => setShowDemo((v) => !v)} active={showDemo}>💼 Demo</PillBtn>
          <PillBtn onClick={() => setShowBacktest((v) => !v)} active={showBacktest}>⚡ Backtest</PillBtn>
          <Sep />
          <PillBtn onClick={reset}>◀◀</PillBtn>
          <PillBtn onClick={() => setPlaying(true)} active={playing}>▶ Play</PillBtn>
          <PillBtn onClick={() => setPlaying(false)}>⏸ Pause</PillBtn>
          <PillBtn onClick={goToEnd}>▶▶</PillBtn>
          <span style={{ marginLeft: 8, color: COLORS.textDim, fontSize: 11 }}>Speed:</span>
          {(["1x", "5x", "10x", "50x"] as const).map((s) => <SpeedBtn key={s} s={s} />)}
          <Sep />
          <span style={{ color: COLORS.textDim, fontSize: 11 }}>From</span>
          <input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)}
            style={{ background: COLORS.pill, color: COLORS.textDim, border: `1px solid ${COLORS.border}`, padding: "4px 6px", borderRadius: 4, fontSize: 11, marginLeft: 4 }} />
          <span style={{ color: COLORS.textDim, fontSize: 11, marginLeft: 6 }}>To</span>
          <input type="date" value={endDate} onChange={(e) => setEndDate(e.target.value)}
            style={{ background: COLORS.pill, color: COLORS.textDim, border: `1px solid ${COLORS.border}`, padding: "4px 6px", borderRadius: 4, fontSize: 11, marginLeft: 4 }} />
          <button onClick={loadData}
            style={{ marginLeft: 6, background: COLORS.cyan, color: "#0b0f19", border: "none", padding: "6px 12px", borderRadius: 4, cursor: "pointer", fontSize: 11, fontWeight: 600 }}>
            Load Data
          </button>
        </div>
      </div>

      {/* MAIN AREA */}
      <div style={{ flex: 1, display: "flex", minHeight: 0 }}>
        <div ref={chartContainerRef} style={{ flex: 1, position: "relative", minWidth: 0 }}>
          {loading && (
            <div style={{ position: "absolute", inset: 0, background: "rgba(11,15,25,0.85)", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", zIndex: 50, color: "#ddd" }}>
              <div style={{ width: 40, height: 40, border: `3px solid ${COLORS.cyan}`, borderTopColor: "transparent", borderRadius: "50%", animation: "spin 1s linear infinite" }} />
              <div style={{ marginTop: 16, color: COLORS.cyan, fontFamily: "ui-monospace, monospace" }}>{loadingMessage}</div>
              <div style={{ marginTop: 8, color: COLORS.textDim, fontSize: 12 }}>
                {loadProgress.fetched.toLocaleString()} / {loadProgress.total.toLocaleString()} bars
              </div>
              <div style={{ marginTop: 8, width: 240, height: 4, background: COLORS.border, borderRadius: 2 }}>
                <div style={{ width: `${Math.min(100, (loadProgress.fetched / Math.max(1, loadProgress.total)) * 100)}%`, height: "100%", background: COLORS.cyan, borderRadius: 2 }} />
              </div>
              <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
            </div>
          )}
          {snapshot && (
            <div style={{ position: "absolute", left: 8, top: 8, background: "rgba(8,11,16,0.7)", padding: "4px 8px", borderRadius: 4, fontSize: 10, fontFamily: "ui-monospace,monospace", color: COLORS.textDim, zIndex: 5 }}>
              <span>State: <span style={{ color: STATE_COLOR[snapshot.state] }}>{STATE_LABEL[snapshot.state]}</span></span>
              <span style={{ marginLeft: 12 }}>Bar {currentBarIndex + 1}/{barsRef.current.length}</span>
            </div>
          )}
        </div>
        {showBacktest && (
          <BacktestPanel
            params={params}
            onParamsChange={setParams}
            startDate={startDate}
            endDate={endDate}
            onStartDate={setStartDate}
            onEndDate={setEndDate}
            onRun={runBacktest}
            results={results}
            running={running}
          />
        )}
      </div>

      {showStats && <Dashboard snapshot={snapshot} onClose={() => setShowStats(false)} />}
      {showDemo && (
        <Demo
          demo={demo}
          onUpdate={(d) => setDemo((prev) => ({ ...prev, ...d, balance: d.startBalance !== undefined ? d.startBalance : prev.balance }))}
          onReset={() => setDemo((d) => ({ ...d, balance: d.startBalance, openTrades: [], log: [], totalR: 0 }))}
          onClose={() => setShowDemo(false)}
        />
      )}
    </div>
  );
}