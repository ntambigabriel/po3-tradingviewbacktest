import { useState } from "react";
import { COLORS } from "./constants";
import { StrategyParams } from "@/lib/strategy";

export interface BacktestResults {
  totalTrades: number;
  winRate: number;
  totalR: number;
  maxDrawdown: number;
  avgRPerDay: number;
  bestDay: { date: string; r: number };
  worstDay: { date: string; r: number };
  equity: { time: number; r: number }[];
  monthly: { month: string; trades: number; winRate: number; r: number }[];
}

interface Props {
  params: StrategyParams;
  onParamsChange: (p: StrategyParams) => void;
  startDate: string;
  endDate: string;
  onStartDate: (d: string) => void;
  onEndDate: (d: string) => void;
  onRun: () => void;
  results: BacktestResults | null;
  running: boolean;
}

function NumField({ label, value, onChange }: { label: string; value: number; onChange: (n: number) => void }) {
  return (
    <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, padding: "4px 0", color: COLORS.textDim }}>
      {label}
      <input
        type="number"
        value={value}
        step="any"
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
        style={{ width: 80, background: "#0a0e16", border: `1px solid ${COLORS.border}`, color: "#ddd", padding: "2px 6px", borderRadius: 3, fontSize: 11 }}
      />
    </label>
  );
}

export default function BacktestPanel({
  params, onParamsChange, startDate, endDate, onStartDate, onEndDate, onRun, results, running,
}: Props) {
  const set = (k: keyof StrategyParams, v: any) => onParamsChange({ ...params, [k]: v });
  return (
    <div style={{ width: 280, background: COLORS.toolbar, borderLeft: `1px solid ${COLORS.border}`, height: "100%", overflowY: "auto", color: "#ddd", fontFamily: "ui-monospace, monospace" }}>
      <div style={{ padding: 12 }}>
        <h3 style={{ color: COLORS.cyan, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>BACKTEST CONFIG</h3>
        <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 4 }}>
          Start Date
          <input type="date" value={startDate} onChange={(e) => onStartDate(e.target.value)} style={{ width: "100%", background: "#0a0e16", border: `1px solid ${COLORS.border}`, color: "#ddd", padding: "4px 6px", borderRadius: 3, marginTop: 2 }} />
        </label>
        <label style={{ display: "block", fontSize: 11, color: COLORS.textDim, marginBottom: 8 }}>
          End Date
          <input type="date" value={endDate} onChange={(e) => onEndDate(e.target.value)} style={{ width: "100%", background: "#0a0e16", border: `1px solid ${COLORS.border}`, color: "#ddd", padding: "4px 6px", borderRadius: 3, marginTop: 2 }} />
        </label>
        <hr style={{ border: 0, borderTop: `1px solid ${COLORS.border}`, margin: "8px 0" }} />
        <NumField label="Swing Lookback" value={params.swingLen} onChange={(v) => set("swingLen", v)} />
        <NumField label="Max Bars 1m" value={params.maxBars} onChange={(v) => set("maxBars", v)} />
        <NumField label="Min Break Points" value={params.minBreakPts} onChange={(v) => set("minBreakPts", v)} />
        <NumField label="Min Corr Points" value={params.minCorrPts} onChange={(v) => set("minCorrPts", v)} />
        <NumField label="SL Buffer" value={params.slBuffer} onChange={(v) => set("slBuffer", v)} />
        <NumField label="RR Ratio" value={params.rrRatio} onChange={(v) => set("rrRatio", v)} />
        <NumField label="Min Closes Below P1" value={params.minClosesBelowP1} onChange={(v) => set("minClosesBelowP1", v)} />
        <NumField label="Min Risk Size" value={params.minRiskSize} onChange={(v) => set("minRiskSize", v)} />
        <NumField label="Max Risk Size" value={params.maxRiskSize} onChange={(v) => set("maxRiskSize", v)} />
        <NumField label="Max Consec Buys" value={params.maxConsecBuys} onChange={(v) => set("maxConsecBuys", v)} />
        <NumField label="Max Consec Sells" value={params.maxConsecSells} onChange={(v) => set("maxConsecSells", v)} />
        <NumField label="Sell TP R" value={params.sellTpR} onChange={(v) => set("sellTpR", v)} />
        <hr style={{ border: 0, borderTop: `1px solid ${COLORS.border}`, margin: "8px 0" }} />
        <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center", fontSize: 11, color: COLORS.textDim, padding: "4px 0" }}>
          H1 Filter
          <input type="checkbox" checked={params.useH1Filter} onChange={(e) => set("useH1Filter", e.target.checked)} />
        </label>
        <NumField label="Min H1 Position" value={params.minH1Position} onChange={(v) => set("minH1Position", v)} />
        <button
          onClick={onRun}
          disabled={running}
          style={{ width: "100%", marginTop: 12, padding: "8px", background: COLORS.cyan, color: "#0b0f19", border: "none", borderRadius: 4, cursor: "pointer", fontWeight: 600, opacity: running ? 0.5 : 1 }}
        >
          {running ? "Running..." : "▶ Run Backtest"}
        </button>
      </div>

      {results && (
        <div style={{ padding: 12, borderTop: `1px solid ${COLORS.border}` }}>
          <h3 style={{ color: COLORS.cyan, fontSize: 12, marginBottom: 8, fontWeight: 600 }}>RESULTS</h3>
          <div style={{ background: COLORS.toolbar, padding: 10, borderRadius: 4, fontSize: 11, lineHeight: 1.7, color: "#bbb" }}>
            <div>Total Trades: <span style={{ color: "#fff" }}>{results.totalTrades}</span></div>
            <div>Win Rate: <span style={{ color: "#fff" }}>{results.winRate.toFixed(1)}%</span></div>
            <div>Total R: <span style={{ color: results.totalR >= 0 ? COLORS.rPos : COLORS.rNeg }}>{results.totalR >= 0 ? "+" : ""}{results.totalR.toFixed(1)}R</span></div>
            <div>Max Drawdown: <span style={{ color: COLORS.rNeg }}>{results.maxDrawdown.toFixed(1)}R</span></div>
            <div>Avg R/day: <span style={{ color: results.avgRPerDay >= 0 ? COLORS.rPos : COLORS.rNeg }}>{results.avgRPerDay >= 0 ? "+" : ""}{results.avgRPerDay.toFixed(2)}</span></div>
            <div>Best: <span style={{ color: COLORS.rPos }}>+{results.bestDay.r.toFixed(1)}R</span> ({results.bestDay.date})</div>
            <div>Worst: <span style={{ color: COLORS.rNeg }}>{results.worstDay.r.toFixed(1)}R</span> ({results.worstDay.date})</div>
          </div>
          <EquityCurve data={results.equity} />
          <div style={{ marginTop: 12 }}>
            <h4 style={{ color: COLORS.textDim, fontSize: 10, marginBottom: 4 }}>MONTHLY</h4>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 10 }}>
              <thead>
                <tr style={{ color: COLORS.textDim }}>
                  <th style={{ textAlign: "left", padding: 3 }}>Month</th>
                  <th style={{ textAlign: "right", padding: 3 }}>T</th>
                  <th style={{ textAlign: "right", padding: 3 }}>WR</th>
                  <th style={{ textAlign: "right", padding: 3 }}>R</th>
                </tr>
              </thead>
              <tbody>
                {results.monthly.map((m, i) => (
                  <tr key={m.month} style={{ background: i % 2 ? COLORS.rowAlt : "transparent" }}>
                    <td style={{ padding: 3, color: "#aaa" }}>{m.month}</td>
                    <td style={{ padding: 3, textAlign: "right", color: "#aaa" }}>{m.trades}</td>
                    <td style={{ padding: 3, textAlign: "right", color: "#aaa" }}>{m.winRate.toFixed(0)}%</td>
                    <td style={{ padding: 3, textAlign: "right", color: m.r >= 0 ? COLORS.rPos : COLORS.rNeg }}>{m.r >= 0 ? "+" : ""}{m.r.toFixed(1)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}

function EquityCurve({ data }: { data: { time: number; r: number }[] }) {
  if (data.length === 0) return null;
  const w = 240, h = 100;
  const minR = Math.min(0, ...data.map((d) => d.r));
  const maxR = Math.max(0, ...data.map((d) => d.r));
  const range = maxR - minR || 1;
  const dx = w / (data.length - 1 || 1);
  const path = data.map((d, i) => `${i === 0 ? "M" : "L"}${(i * dx).toFixed(1)},${(h - ((d.r - minR) / range) * h).toFixed(1)}`).join(" ");
  return (
    <div style={{ marginTop: 10, background: COLORS.popupBg, padding: 8, borderRadius: 4 }}>
      <div style={{ color: COLORS.textDim, fontSize: 10, marginBottom: 4 }}>EQUITY CURVE (R)</div>
      <svg width={w} height={h}>
        <path d={path} fill="none" stroke={COLORS.rPos} strokeWidth={1.5} />
      </svg>
    </div>
  );
}