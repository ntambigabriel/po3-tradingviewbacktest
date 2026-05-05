import { useState } from "react";
import Draggable from "./Draggable";
import { COLORS } from "./constants";

export interface DemoTrade {
  type: "SELL" | "BUY";
  entry: number;
  sl: number;
  tp: number;
  time: number;
  result: "WIN" | "LOSS";
  r: number;
  pnl: number;
}

export interface DemoState {
  startBalance: number;
  balance: number;
  riskMode: "pct" | "dollar";
  riskPct: number;
  riskDollar: number;
  leverage: number;
  openTrades: { type: "SELL" | "BUY"; entry: number; sl: number; tp: number }[];
  log: DemoTrade[];
  totalR: number;
}

interface Props {
  demo: DemoState;
  onUpdate: (d: Partial<DemoState>) => void;
  onReset: () => void;
  onClose: () => void;
}

export default function Demo({ demo, onUpdate, onReset, onClose }: Props) {
  const [open, setOpen] = useState(true);
  const pnl = demo.balance - demo.startBalance;
  const pnlPct = demo.startBalance ? (pnl / demo.startBalance) * 100 : 0;
  const blown = demo.balance <= 0;

  return (
    <Draggable initial={{ x: window.innerWidth - 380, y: window.innerHeight - 540 }} width={360}>
      {({ onMouseDown }) => (
        <div
          style={{
            background: COLORS.popupBg,
            border: `1px solid ${COLORS.border}`,
            borderRadius: 8,
            fontFamily: "ui-monospace, monospace",
            color: "#aabbcc",
            overflow: "hidden",
            boxShadow: "0 8px 32px rgba(0,0,0,0.5)",
          }}
        >
          <div
            onMouseDown={onMouseDown}
            style={{
              cursor: "move",
              padding: "8px 12px",
              borderBottom: `1px solid ${COLORS.border}`,
              display: "flex",
              justifyContent: "space-between",
              background: "#0a0e16",
            }}
          >
            <span style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 600 }}>💼 DEMO ACCOUNT</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textDim, cursor: "pointer" }}>
              ×
            </button>
          </div>

          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 11 }}>
            <button
              onClick={() => setOpen(!open)}
              style={{ background: "none", border: "none", color: COLORS.textDim, cursor: "pointer", padding: 0, marginBottom: 4 }}
            >
              {open ? "▼" : "▶"} Settings
            </button>
            {open && (
              <div style={{ display: "grid", gap: 6 }}>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Starting Balance
                  <input
                    type="number"
                    value={demo.startBalance}
                    onChange={(e) => onUpdate({ startBalance: parseFloat(e.target.value) || 0 })}
                    style={{ width: 110, background: "#0a0e16", border: `1px solid ${COLORS.border}`, color: "#ddd", padding: "2px 6px", borderRadius: 3 }}
                  />
                </label>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Risk
                  <span>
                    <button
                      onClick={() => onUpdate({ riskMode: demo.riskMode === "pct" ? "dollar" : "pct" })}
                      style={{ background: COLORS.pill, border: "none", color: COLORS.cyan, padding: "2px 6px", marginRight: 4, cursor: "pointer", borderRadius: 3 }}
                    >
                      {demo.riskMode === "pct" ? "%" : "$"}
                    </button>
                    <input
                      type="number"
                      value={demo.riskMode === "pct" ? demo.riskPct : demo.riskDollar}
                      onChange={(e) =>
                        demo.riskMode === "pct"
                          ? onUpdate({ riskPct: parseFloat(e.target.value) || 0 })
                          : onUpdate({ riskDollar: parseFloat(e.target.value) || 0 })
                      }
                      style={{ width: 70, background: "#0a0e16", border: `1px solid ${COLORS.border}`, color: "#ddd", padding: "2px 6px", borderRadius: 3 }}
                    />
                  </span>
                </label>
                <label style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  Leverage: {demo.leverage}×
                  <input
                    type="range"
                    min={1}
                    max={100}
                    value={demo.leverage}
                    onChange={(e) => onUpdate({ leverage: parseInt(e.target.value) })}
                    style={{ width: 120 }}
                  />
                </label>
                <button
                  onClick={onReset}
                  style={{ background: COLORS.pill, color: COLORS.textDim, border: "none", padding: "4px 8px", cursor: "pointer", borderRadius: 3 }}
                >
                  Reset Account
                </button>
              </div>
            )}
          </div>

          {blown && (
            <div style={{ background: COLORS.rNegBg, color: COLORS.rNeg, padding: "6px 12px", fontSize: 12, fontWeight: 600 }}>
              ⚠ ACCOUNT BLOWN
            </div>
          )}

          <div style={{ padding: "8px 12px", borderBottom: `1px solid ${COLORS.border}`, fontSize: 11, display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6 }}>
            <div>Balance: <span style={{ color: "#ddd" }}>${demo.balance.toFixed(2)}</span></div>
            <div>P&L: <span style={{ color: pnl >= 0 ? COLORS.rPos : COLORS.rNeg }}>{pnl >= 0 ? "+" : ""}${pnl.toFixed(2)} ({pnlPct >= 0 ? "+" : ""}{pnlPct.toFixed(1)}%)</span></div>
            <div>Total R: <span style={{ color: demo.totalR >= 0 ? COLORS.rPos : COLORS.rNeg }}>{demo.totalR >= 0 ? "+" : ""}{demo.totalR.toFixed(2)}R</span></div>
            <div>Open: <span style={{ color: "#ddd" }}>{demo.openTrades.length}</span></div>
          </div>

          <div style={{ padding: "6px 12px", fontSize: 10, color: COLORS.textDim, borderBottom: `1px solid ${COLORS.border}` }}>OPEN TRADES</div>
          <div style={{ maxHeight: 80, overflowY: "auto", fontSize: 10 }}>
            {demo.openTrades.length === 0 && <div style={{ padding: "4px 12px", color: "#3a4555" }}>No open trades</div>}
            {demo.openTrades.map((t, i) => (
              <div key={i} style={{ padding: "3px 12px", display: "flex", gap: 6 }}>
                <span style={{ color: COLORS.rNeg }}>{t.type}</span>
                <span>E:${t.entry.toFixed(0)}</span>
                <span>SL:${t.sl.toFixed(0)}</span>
                <span>TP:${t.tp.toFixed(0)}</span>
              </div>
            ))}
          </div>

          <div style={{ padding: "6px 12px", fontSize: 10, color: COLORS.textDim, borderTop: `1px solid ${COLORS.border}` }}>TRADE LOG</div>
          <div style={{ maxHeight: 200, overflowY: "auto", fontSize: 10 }}>
            {demo.log.length === 0 && <div style={{ padding: "4px 12px", color: "#3a4555" }}>No trades yet</div>}
            {demo.log.map((t, i) => (
              <div
                key={i}
                style={{
                  padding: "3px 12px",
                  background: t.result === "WIN" ? "rgba(0,160,80,0.08)" : "rgba(200,40,40,0.08)",
                  display: "flex",
                  gap: 6,
                  borderBottom: `1px solid ${COLORS.border}`,
                }}
              >
                <span style={{ color: "#5a7088" }}>{new Date(t.time * 1000).toISOString().slice(5, 16).replace("T", " ")}</span>
                <span style={{ color: t.result === "WIN" ? COLORS.rPos : COLORS.rNeg }}>
                  {t.type} {t.result === "WIN" ? "✓" : "✗"}
                </span>
                <span>R:{t.r >= 0 ? "+" : ""}{t.r.toFixed(1)}</span>
                <span style={{ color: t.pnl >= 0 ? COLORS.rPos : COLORS.rNeg }}>${t.pnl >= 0 ? "+" : ""}{t.pnl.toFixed(0)}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </Draggable>
  );
}