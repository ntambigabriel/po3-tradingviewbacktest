import Draggable from "./Draggable";
import { COLORS, STATE_COLOR, STATE_LABEL } from "./constants";
import { Snapshot } from "@/lib/strategy";

interface Props {
  snapshot: Snapshot | null;
  onClose: () => void;
}

function rPill(r: number, hasTrades: boolean) {
  if (!hasTrades || (r === 0 && !hasTrades)) {
    return { bg: COLORS.rZeroBg, color: COLORS.rZero, text: "—" };
  }
  if (r > 0) return { bg: COLORS.rPosBg, color: COLORS.rPos, text: `+${r.toFixed(1)}R` };
  if (r < 0) return { bg: COLORS.rNegBg, color: COLORS.rNeg, text: `${r.toFixed(1)}R` };
  return { bg: COLORS.rZeroBg, color: COLORS.rZero, text: "0R" };
}

function wrPill(wins: number, losses: number) {
  const total = wins + losses;
  if (total === 0) return { bg: COLORS.rZeroBg, color: COLORS.rZero, text: "—" };
  const wr = (wins / total) * 100;
  if (wr >= 60) return { bg: COLORS.rPosBg, color: COLORS.rPos, text: `${wr.toFixed(0)}%` };
  if (wr >= 40) return { bg: COLORS.amberBg, color: COLORS.amber, text: `${wr.toFixed(0)}%` };
  return { bg: COLORS.rNegBg, color: COLORS.rNeg, text: `${wr.toFixed(0)}%` };
}

function Pill({ p }: { p: { bg: string; color: string; text: string } }) {
  return (
    <span style={{ background: p.bg, color: p.color, padding: "2px 6px", borderRadius: 4, fontSize: 11 }}>
      {p.text}
    </span>
  );
}

export default function Dashboard({ snapshot, onClose }: Props) {
  const today = snapshot?.todayStats;
  const history = snapshot?.historyDays ?? [];
  const state = snapshot?.state ?? 0;

  const headers = ["DATE", "BUYS", "BUY R", "SELLS", "SELL WR", "SELL R", "MID✓TP", "TOTAL R"];

  const renderRow = (d: { date: string; buys: number; buyR: number; sells: number; sellWins: number; sellLosses: number; sellR: number; midNoSL: number; totalR: number }, isToday: boolean, alt: boolean) => {
    const hasBuys = d.buys > 0;
    const hasSells = d.sells > 0;
    return (
      <tr
        key={(isToday ? "today-" : "") + d.date}
        style={{
          background: isToday ? COLORS.today : alt ? COLORS.rowAlt : COLORS.popupBg,
        }}
      >
        <td style={{ padding: "4px 8px", color: isToday ? COLORS.cyan : "#3a5570", fontSize: 11 }}>
          {isToday ? "TODAY" : d.date.slice(5)}
        </td>
        <td style={{ padding: "4px 8px", color: hasBuys ? "#aabbcc" : "#2a3540", fontSize: 11, textAlign: "right" }}>
          {hasBuys ? d.buys : "—"}
        </td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>
          <Pill p={rPill(d.buyR, hasBuys)} />
        </td>
        <td style={{ padding: "4px 8px", color: hasSells ? "#aabbcc" : "#2a3540", fontSize: 11, textAlign: "right" }}>
          {hasSells ? d.sells : "—"}
        </td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>
          <Pill p={wrPill(d.sellWins, d.sellLosses)} />
        </td>
        <td style={{ padding: "4px 8px", textAlign: "right" }}>
          <Pill p={rPill(d.sellR, hasSells)} />
        </td>
        <td style={{ padding: "4px 8px", background: COLORS.midTpBg, textAlign: "right", fontSize: 11, color: d.midNoSL > 0 ? COLORS.rPos : "#2a3540" }}>
          {d.midNoSL > 0 ? d.midNoSL : "—"}
        </td>
        <td style={{ padding: "4px 8px", background: COLORS.totalBg, textAlign: "right" }}>
          <Pill p={rPill(d.totalR, hasBuys || hasSells)} />
        </td>
      </tr>
    );
  };

  return (
    <Draggable initial={{ x: window.innerWidth - 440, y: 60 }} width={420}>
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
            <span style={{ color: COLORS.cyan, fontSize: 12, fontWeight: 600 }}>📊 PO3 DASHBOARD</span>
            <button onClick={onClose} style={{ background: "none", border: "none", color: COLORS.textDim, cursor: "pointer" }}>
              ×
            </button>
          </div>
          <div style={{ maxHeight: 480, overflowY: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 11 }}>
              <thead>
                <tr style={{ background: "#0a0e16" }}>
                  {headers.map((h, i) => (
                    <th
                      key={h}
                      style={{
                        padding: "6px 8px",
                        textAlign: i === 0 ? "left" : "right",
                        color: i === 0 ? COLORS.cyan : i === 6 ? COLORS.rPos : i === 7 ? COLORS.gold : COLORS.textDim,
                        fontWeight: 500,
                        fontSize: 10,
                      }}
                    >
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {today && renderRow(today, true, false)}
                <tr>
                  <td colSpan={8} style={{ padding: "2px 8px", color: "#1a2540", fontSize: 10 }}>
                    ─────────────────────────────────────────
                  </td>
                </tr>
                {history.slice(0, 16).map((d, i) => renderRow(d, false, i % 2 === 1))}
              </tbody>
            </table>
          </div>
          <div
            style={{
              borderTop: `1px solid ${COLORS.border}`,
              background: "#050810",
              padding: "6px 12px",
              fontSize: 10,
              display: "flex",
              gap: 16,
              color: COLORS.textDim,
            }}
          >
            <span>
              State: <span style={{ color: STATE_COLOR[state] }}>{STATE_LABEL[state]}</span>
            </span>
            <span>Consec Buys: {snapshot?.consecBuys ?? 0}</span>
            <span>Consec Sells: {snapshot?.consecSells ?? 0}</span>
          </div>
        </div>
      )}
    </Draggable>
  );
}