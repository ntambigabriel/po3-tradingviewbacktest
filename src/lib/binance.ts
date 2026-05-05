export interface Bar {
  time: number; // seconds
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export async function fetchKlines(
  startTime: number,
  endTime: number,
  onProgress?: (fetched: number, total: number) => void
): Promise<Bar[]> {
  const out: Bar[] = [];
  const totalEstimate = Math.max(1, Math.floor((endTime - startTime) / 60000));
  let cursor = startTime;
  let retries = 0;

  while (cursor < endTime) {
    const url = `https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=1000&startTime=${cursor}&endTime=${endTime}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        if (res.status === 429 && retries < 5) {
          retries++;
          await new Promise(r => setTimeout(r, 2000 * retries));
          continue;
        }
        throw new Error(`Binance error ${res.status}`);
      }
      retries = 0;
      const data: any[] = await res.json();
      if (!data.length) break;
      for (const k of data) {
        out.push({
          time: Math.floor(k[0] / 1000),
          open: parseFloat(k[1]),
          high: parseFloat(k[2]),
          low: parseFloat(k[3]),
          close: parseFloat(k[4]),
          volume: parseFloat(k[5]),
        });
      }
      const last = data[data.length - 1];
      cursor = last[6] + 1;
      onProgress?.(out.length, totalEstimate);
      if (data.length < 1000) break;
      // Small delay to avoid rate limiting on large date ranges
      await new Promise(r => setTimeout(r, 50));
    } catch (e) {
      if (retries < 3) {
        retries++;
        await new Promise(r => setTimeout(r, 1000 * retries));
      } else {
        throw e;
      }
    }
  }

  out.sort((a, b) => a.time - b.time);
  const dedup: Bar[] = [];
  let prev = -1;
  for (const b of out) {
    if (b.time !== prev) {
      dedup.push(b);
      prev = b.time;
    }
  }
  return dedup;
}

export interface H1Candle {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
}

export function buildH1Map(bars: Bar[]): Map<number, H1Candle> {
  const map = new Map<number, H1Candle>();
  for (const b of bars) {
    const key = Math.floor(b.time / 3600) * 3600;
    const existing = map.get(key);
    if (!existing) {
      map.set(key, { time: key, open: b.open, high: b.high, low: b.low, close: b.close });
    } else {
      existing.high = Math.max(existing.high, b.high);
      existing.low = Math.min(existing.low, b.low);
      existing.close = b.close;
    }
  }
  return map;
}

export function findH1(map: Map<number, H1Candle>, time: number): H1Candle | undefined {
  const key = Math.floor(time / 3600) * 3600;
  if (map.has(key)) return map.get(key);
  // find nearest prior
  let k = key - 3600;
  for (let i = 0; i < 48 && k > 0; i++, k -= 3600) {
    if (map.has(k)) return map.get(k);
  }
  return undefined;
}
