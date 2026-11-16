import { FxRatesMap, SupportedCurrency } from '../types/finance';

// Reference fallback rates relative to 1 USD when offline/rate-limited
export const FALLBACK_USD_RATES: Record<SupportedCurrency, number> = {
  USD: 1,
  KES: 129.25,
  EUR: 0.92,
  GBP: 0.78,
};

const CACHE_KEY = 'kora_ledger_fx_cache_v1';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

export async function fetchLiveFxRates(forceRefresh = false): Promise<FxRatesMap> {
  if (!forceRefresh) {
    try {
      const cachedRaw = localStorage.getItem(CACHE_KEY);
      if (cachedRaw) {
        const cached: FxRatesMap = JSON.parse(cachedRaw);
        const age = Date.now() - new Date(cached.fetchedAt).getTime();
        if (age < CACHE_TTL_MS && cached.rates?.KES && cached.rates?.USD) {
          return cached;
        }
      }
    } catch {
      // Ignore storage read issues
    }
  }

  try {
    const controller = new AbortController();
    const timer = window.setTimeout(() => controller.abort(), 5000);
    const response = await fetch('https://open.er-api.com/v6/latest/USD', {
      signal: controller.signal,
    });
    window.clearTimeout(timer);

    if (!response.ok) {
      throw new Error(`FX API HTTP ${response.status}`);
    }

    const payload = await response.json();
    if (payload?.result === 'success' && payload?.rates) {
      const next: FxRatesMap = {
        base: 'USD',
        rates: {
          USD: 1,
          KES: Number(payload.rates.KES) || FALLBACK_USD_RATES.KES,
          EUR: Number(payload.rates.EUR) || FALLBACK_USD_RATES.EUR,
          GBP: Number(payload.rates.GBP) || FALLBACK_USD_RATES.GBP,
        },
        fetchedAt: new Date().toISOString(),
        source: 'live',
      };
      try {
        localStorage.setItem(CACHE_KEY, JSON.stringify(next));
      } catch {
        // Ignore storage write issues
      }
      return next;
    }
    throw new Error('Unexpected FX payload');
  } catch {
    return {
      base: 'USD',
      rates: { ...FALLBACK_USD_RATES },
      fetchedAt: new Date().toISOString(),
      source: 'fallback',
    };
  }
}

export function getConversionRate(
  from: SupportedCurrency,
  to: SupportedCurrency,
  fx: FxRatesMap
): number {
  if (from === to) return 1;
  const fromUsd = fx.rates[from] || FALLBACK_USD_RATES[from];
  const toUsd = fx.rates[to] || FALLBACK_USD_RATES[to];
  if (!fromUsd || !toUsd) return 1;
  return Number((toUsd / fromUsd).toFixed(6));
}

export function convertAmount(
  amount: number,
  from: SupportedCurrency,
  to: SupportedCurrency,
  fx: FxRatesMap
): number {
  const rate = getConversionRate(from, to, fx);
  return amount * rate;
}
