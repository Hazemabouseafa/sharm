export interface CurrencyDefinition {
  code: string;
  exponent: number;
  symbol: string;
  name: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyDefinition> = {
  USD: { code: 'USD', exponent: 2, symbol: '$', name: 'US Dollar' },
  EUR: { code: 'EUR', exponent: 2, symbol: '€', name: 'Euro' },
  GBP: { code: 'GBP', exponent: 2, symbol: '£', name: 'British Pound' },
  EGP: { code: 'EGP', exponent: 2, symbol: 'EGP ', name: 'Egyptian Pound' },
  AED: { code: 'AED', exponent: 2, symbol: 'AED ', name: 'UAE Dirham' },
  SAR: { code: 'SAR', exponent: 2, symbol: 'SAR ', name: 'Saudi Riyal' },
  JPY: { code: 'JPY', exponent: 0, symbol: '¥', name: 'Japanese Yen' },
  KWD: { code: 'KWD', exponent: 3, symbol: 'KWD ', name: 'Kuwaiti Dinar' },
};

export function getCurrencyDefinition(code: string): CurrencyDefinition {
  const upper = code.toUpperCase();
  const def = SUPPORTED_CURRENCIES[upper];
  if (!def) {
    throw new Error(`Unsupported ISO currency code: ${code}`);
  }
  return def;
}

export function assertMinorUnitsInteger(value: number, fieldName = 'amount'): number {
  if (!Number.isInteger(value) || !Number.isSafeInteger(value)) {
    throw new Error(`${fieldName} must be a safe integer in minor units, received ${value}`);
  }
  return value;
}

/**
 * Deterministic half-up integer rounding for basis-point calculations (10000 bps = 100%).
 * Example: applyBasisPoints(10050, 1400) => 14% of 10050 = 1407.
 */
export function applyBasisPoints(amountMinor: number, basisPoints: number): number {
  assertMinorUnitsInteger(amountMinor, 'amountMinor');
  assertMinorUnitsInteger(basisPoints, 'basisPoints');
  if (basisPoints === 0 || amountMinor === 0) return 0;
  const sign = amountMinor < 0 ? -1 : 1;
  const absProduct = Math.abs(amountMinor) * Math.abs(basisPoints);
  const rounded = Math.floor((absProduct + 5000) / 10000);
  return sign * (basisPoints < 0 ? -rounded : rounded);
}

export function formatMinorUnits(amountMinor: number, currencyCode: string): string {
  assertMinorUnitsInteger(amountMinor, 'amountMinor');
  const def = getCurrencyDefinition(currencyCode);
  const divisor = 10 ** def.exponent;
  const major = amountMinor / divisor;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: def.code,
    minimumFractionDigits: def.exponent === 0 ? 0 : amountMinor % divisor === 0 ? 0 : def.exponent,
    maximumFractionDigits: def.exponent,
  }).format(major);
}

export function formatMinorUnitsExact(amountMinor: number, currencyCode: string): string {
  assertMinorUnitsInteger(amountMinor, 'amountMinor');
  const def = getCurrencyDefinition(currencyCode);
  const divisor = 10 ** def.exponent;
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: def.code,
    minimumFractionDigits: def.exponent,
    maximumFractionDigits: def.exponent,
  }).format(amountMinor / divisor);
}

/**
 * Escapes CSV values and prevents spreadsheet formula injection (=, +, -, @, tab, CR).
 */
export function escapeCsvCell(raw: unknown): string {
  const str = raw === null || raw === undefined ? '' : String(raw);
  const dangerousPrefix = /^[=+\-@\t\r]/;
  const neutralized = dangerousPrefix.test(str) ? `'${str}` : str;
  if (/[",\n\r]/.test(neutralized)) {
    return `"${neutralized.replace(/"/g, '""')}"`;
  }
  return neutralized;
}
