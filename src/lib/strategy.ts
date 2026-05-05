import { Bar, H1Candle, findH1 } from "./binance";

export interface StrategyParams {
  swingLen: number;
  maxBars: number;
  minBreakPts: number;
  minCorrPts: number;
  extBars: number;
  slBuffer: number;
  rrRatio: number;
  approachBuffer: number;
  minClosesBelowP1: number;
  minRiskSize: number;
  maxRiskSize: number;
  maxConsecBuys: number;
  maxConsecSells: number;
  sellTpR: number;
  minH1Position: number;
  useH1Filter: boolean;
}

export const DEFAULT_PARAMS: StrategyParams = {
  swingLen: 3,
  maxBars: 100,
  minBreakPts: 10,
  minCorrPts: 10,
  extBars: 20,
  slBuffer: 10,
  rrRatio: 1.4,
  approachBuffer: 0.1,
  minClosesBelowP1: 3,
  minRiskSize: 75,
  maxRiskSize: 250,
  maxConsecBuys: 2,
  maxConsecSells: 3,
  sellTpR: 1.4,
  minH1Position: 0.75,
  useH1Filter: true,
};

export interface OpenSell {
  entry: number;
  sl: number;
  tp: number;
  bar: number;
  time: number;
}

export interface DayStats {
  date: string;
  buys: number;
  buyR: number;
  sells: number;
  sellWins: number;
  sellLosses: number;
  sellR: number;
  midNoSL: number;
  totalR: number;
}

export type StrategyEvent =
  | { type: "BUY_ENTRY"; bar: Bar; index: number; buyEntry: number; buySL: number; buyTP: number; buyMid: number; p1: number; p1Bar: number; p2: number; p2Bar: number; corrLow: number }
  | { type: "MID_TOUCHED"; bar: Bar; index: number; savedMid: number }
  | { type: "BUY_WIN"; bar: Bar; index: number; r: number }
  | { type: "BUY_INVALIDATED"; bar: Bar; index: number }
  | { type: "SELL_ENTRY"; bar: Bar; index: number; entry: number; sl: number; tp: number }
  | { type: "SELL_WIN"; bar: Bar; index: number; trade: OpenSell }
  | { type: "SELL_LOSS"; bar: Bar; index: number; trade: OpenSell };

export interface Snapshot {
  state: number;
  p1: number | null;
  p1Bar: number | null;
  p2: number | null;
  p2Bar: number | null;
  corrLow: number | null;
  corrHigh: number | null;
  inBuyTrade: boolean;
  buyEntry: number | null;
  buySL: number | null;
  buyTP: number | null;
  buyMid: number | null;
  midTouched: boolean;
  savedMid: number | null;
  openSells: OpenSell[];
  consecBuys: number;
  consecSells: number;
  todayStats: DayStats;
  historyDays: DayStats[];
  buyP1Bar: number | null;
}

function eatDateStr(timeSec: number): string {
  const d = new Date((timeSec + 3 * 3600) * 1000);
  return d.toISOString().slice(0, 10);
}

export class StrategyEngine {
  params: StrategyParams;
  bars: Bar[] = [];

  state = 0;
  sBar = 0;
  p1: number | null = null;
  p1Bar: number | null = null;
  p2: number | null = null;
  p2Bar: number | null = null;
  cLow = 0;
  corrLow: number | null = null;
  corrHigh: number | null = null;
  closesBelow = 0;

  inBuyTrade = false;
  buyEntry: number | null = null;
  buySL: number | null = null;
  buyTP: number | null = null;
  buyMid: number | null = null;
  buyP1Bar: number | null = null;
  midTouched = false;
  savedMid: number | null = null;

  openSells: OpenSell[] = [];
  consecBuys = 0;
  consecSells = 0;

  today: DayStats = this.makeEmptyDay("");
  history: DayStats[] = [];
  currentDateStr = "";

  events: StrategyEvent[] = [];

  constructor(params: StrategyParams) {
    this.params = { ...params };
  }

  makeEmptyDay(date: string): DayStats {
    return {
      date,
      buys: 0,
      buyR: 0,
      sells: 0,
      sellWins: 0,
      sellLosses: 0,
      sellR: 0,
      midNoSL: 0,
      totalR: 0,
    };
  }

  reset() {
    this.bars = [];
    this.state = 0;
    this.sBar = 0;
    this.p1 = this.p1Bar = this.p2 = this.p2Bar = null;
    this.cLow = 0;
    this.corrLow = this.corrHigh = null;
    this.closesBelow = 0;
    this.inBuyTrade = false;
    this.buyEntry = this.buySL = this.buyTP = this.buyMid = this.buyP1Bar = null;
    this.midTouched = false;
    this.savedMid = null;
    this.openSells = [];
    this.consecBuys = 0;
    this.consecSells = 0;
    this.today = this.makeEmptyDay("");
    this.history = [];
    this.currentDateStr = "";
    this.events = [];
  }

  detectPivotHigh(): { price: number; barIndex: number } | null {
    const n = this.bars.length;
    const sl = this.params.swingLen;
    if (n < 2 * sl + 1) return null;
    const pivotIdx = n - 1 - sl;
    const pivotHigh = this.bars[pivotIdx].high;
    for (let i = pivotIdx - sl; i <= pivotIdx + sl; i++) {
      if (i === pivotIdx) continue;
      if (this.bars[i].high >= pivotHigh) return null;
    }
    return { price: pivotHigh, barIndex: pivotIdx };
  }

  processBar(bar: Bar, h1Map: Map<number, H1Candle>): Snapshot {
    this.bars.push(bar);
    const idx = this.bars.length - 1;
    const events: StrategyEvent[] = [];
    this.events = events;

    // Day rollover
    const ds = eatDateStr(bar.time);
    if (this.currentDateStr === "") {
      this.currentDateStr = ds;
      this.today = this.makeEmptyDay(ds);
    } else if (ds !== this.currentDateStr) {
      this.history.unshift({ ...this.today });
      if (this.history.length > 30) this.history.pop();
      this.currentDateStr = ds;
      this.today = this.makeEmptyDay(ds);
    }

    this.sBar++;
    const pivot = this.detectPivotHigh();
    const p = this.params;

    // STATE 0
    if (this.state === 0 && pivot) {
      this.p1 = pivot.price;
      this.p1Bar = pivot.barIndex;
      this.state = 1;
      this.sBar = 0;
      this.closesBelow = 0;
    }
    // STATE 1
    else if (this.state === 1) {
      if (pivot && this.p1 !== null && pivot.price > this.p1) {
        this.p1 = pivot.price;
        this.p1Bar = pivot.barIndex;
        this.sBar = 0;
        this.closesBelow = 0;
      }
      if (this.p1 !== null && bar.close > this.p1 + p.minBreakPts) {
        this.p2 = bar.high;
        this.p2Bar = idx;
        this.cLow = bar.low;
        this.corrHigh = bar.high;
        this.state = 2;
        this.sBar = 0;
        this.closesBelow = 0;
      } else if (this.sBar > p.maxBars) {
        this.state = 0;
      }
    }
    // STATE 2
    else if (this.state === 2) {
      if (this.p2 === null || bar.high > this.p2) {
        this.p2 = bar.high;
        this.p2Bar = idx;
      }
      if (bar.low < this.cLow) this.cLow = bar.low;
      this.corrHigh = Math.max(this.corrHigh ?? bar.high, bar.high);
      if (this.p1 !== null) {
        if (bar.close < this.p1) this.closesBelow++;
        else if (bar.close > this.p1) this.closesBelow = 0;
      }
      if (
        this.closesBelow >= p.minClosesBelowP1 &&
        this.p2 !== null &&
        this.p2 - this.cLow >= p.minCorrPts
      ) {
        this.corrLow = this.cLow;
        this.state = 3;
        this.sBar = 0;
        this.closesBelow = 0;
      } else if (this.sBar > p.maxBars) {
        this.state = 0;
      }
    }
    // STATE 3
    else if (this.state === 3) {
      this.corrLow = Math.min(this.corrLow ?? bar.low, bar.low);
      this.corrHigh = Math.max(this.corrHigh ?? bar.high, bar.high);
      if (this.p1 !== null && bar.close > this.p1 && this.consecBuys < p.maxConsecBuys && !this.inBuyTrade) {
        const prospectiveSL = (this.corrLow ?? bar.low) - p.slBuffer;
        const prospectiveRisk = bar.close - prospectiveSL;
        const riskOk = prospectiveRisk >= p.minRiskSize && prospectiveRisk <= p.maxRiskSize;
        if (riskOk) {
          this.buyEntry = bar.close;
          this.buySL = prospectiveSL;
          this.buyTP = this.buyEntry + (this.buyEntry - this.buySL) * p.rrRatio;
          this.buyMid = (this.buyEntry + this.buySL) / 2;
          this.buyP1Bar = this.p1Bar;
          this.inBuyTrade = true;
          this.midTouched = false;
          this.savedMid = null;
          this.consecBuys++;
          this.consecSells = 0;
          this.today.buys++;
          events.push({
            type: "BUY_ENTRY",
            bar,
            index: idx,
            buyEntry: this.buyEntry,
            buySL: this.buySL,
            buyTP: this.buyTP,
            buyMid: this.buyMid,
            p1: this.p1!,
            p1Bar: this.p1Bar!,
            p2: this.p2!,
            p2Bar: this.p2Bar!,
            corrLow: this.corrLow!,
          });
          this.state = 0;
          this.sBar = 0;
        } else {
          this.state = 0;
          this.sBar = 0;
          this.closesBelow = 0;
        }
      } else if (this.p1 !== null && bar.close > this.p1 && this.consecBuys >= p.maxConsecBuys) {
        this.state = 0;
      } else if (this.corrLow !== null && (bar.low < this.corrLow - p.minCorrPts * 2 || this.sBar > p.maxBars)) {
        this.state = 0;
      }
    }

    // BUY TRADE MANAGEMENT
    if (this.inBuyTrade) {
      this.corrHigh = Math.max(this.corrHigh ?? bar.high, bar.high);
      if (!this.midTouched && this.buyMid !== null && bar.low <= this.buyMid) {
        this.midTouched = true;
        this.savedMid = this.buyMid;
        events.push({ type: "MID_TOUCHED", bar, index: idx, savedMid: this.savedMid });
      }
      if (this.buyTP !== null && bar.high >= this.buyTP) {
        events.push({ type: "BUY_WIN", bar, index: idx, r: p.rrRatio });
        this.today.buyR += p.rrRatio;
        this.today.totalR += p.rrRatio;
        if (this.midTouched) this.today.midNoSL++;
        this.resetBuy();
        this.consecBuys = 0;
      } else if (this.midTouched && this.buySL !== null && bar.low <= this.buySL) {
        const capturedMid = this.savedMid!;
        const capturedSL = this.corrHigh!;
        const capturedTP = capturedMid - (capturedSL - capturedMid) * p.sellTpR;
        const h1 = findH1(h1Map, bar.time);

        // FIX: if no H1 data available, allow the trade through
        let h1Ok = !p.useH1Filter;
        if (p.useH1Filter && h1) {
          const h1Range = h1.high - h1.low;
          const h1Position = h1Range > 0 ? (capturedMid - h1.low) / h1Range : 0.5;
          h1Ok = h1Position >= p.minH1Position;
        } else if (p.useH1Filter && !h1) {
          h1Ok = true; // no H1 data found, allow trade
        }

        if (h1Ok && this.consecSells < p.maxConsecSells) {
          const sell: OpenSell = { entry: capturedMid, sl: capturedSL, tp: capturedTP, bar: idx, time: bar.time };
          this.openSells.push(sell);
          this.today.sells++;
          this.consecSells++;
          this.consecBuys = 0;
          events.push({ type: "SELL_ENTRY", bar, index: idx, entry: sell.entry, sl: sell.sl, tp: sell.tp });
        }
        this.resetBuy();
      } else if (!this.midTouched && this.buySL !== null && bar.low <= this.buySL) {
        events.push({ type: "BUY_INVALIDATED", bar, index: idx });
        this.today.buyR -= 1;
        this.today.totalR -= 1;
        this.resetBuy();
        this.consecBuys = 0;
      }
    }

    // SELL MANAGEMENT
    const remaining: OpenSell[] = [];
    for (const s of this.openSells) {
      if (bar.high >= s.sl) {
        this.today.sellLosses++;
        this.today.sellR -= 1;
        this.today.totalR -= 1;
        this.consecSells = 0;
        events.push({ type: "SELL_LOSS", bar, index: idx, trade: s });
      } else if (bar.low <= s.tp) {
        this.today.sellWins++;
        this.today.sellR += p.sellTpR;
        this.today.totalR += p.sellTpR;
        this.consecSells = 0;
        events.push({ type: "SELL_WIN", bar, index: idx, trade: s });
      } else {
        remaining.push(s);
      }
    }
    this.openSells = remaining;

    return this.snapshot();
  }

  resetBuy() {
    this.inBuyTrade = false;
    this.buyEntry = this.buySL = this.buyTP = this.buyMid = null;
    this.buyP1Bar = null;
    this.midTouched = false;
    this.savedMid = null;
  }

  snapshot(): Snapshot {
    return {
      state: this.state,
      p1: this.p1,
      p1Bar: this.p1Bar,
      p2: this.p2,
      p2Bar: this.p2Bar,
      corrLow: this.corrLow,
      corrHigh: this.corrHigh,
      inBuyTrade: this.inBuyTrade,
      buyEntry: this.buyEntry,
      buySL: this.buySL,
      buyTP: this.buyTP,
      buyMid: this.buyMid,
      midTouched: this.midTouched,
      savedMid: this.savedMid,
      openSells: [...this.openSells],
      consecBuys: this.consecBuys,
      consecSells: this.consecSells,
      todayStats: { ...this.today },
      historyDays: this.history.map((d) => ({ ...d })),
      buyP1Bar: this.buyP1Bar,
    };
  }
}
