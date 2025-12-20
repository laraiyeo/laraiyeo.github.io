// Utilities for formatting odds for display
export function americanToDecimal(american) {
  if (american == null) return null;
  const s = String(american).trim();
  // strip leading + if present
  const n = parseInt(s.replace(/^\+/, ""), 10);
  if (isNaN(n)) return null;
  if (n > 0) return (n / 100 + 1).toFixed(2);
  return (100 / Math.abs(n) + 1).toFixed(2);
}

export function formatOddsForDisplay(americanOdds, display = "american") {
  if (americanOdds == null) return "";
  const s = String(americanOdds).trim();
  if (display === "decimal") {
    const dec = americanToDecimal(s);
    return dec != null ? dec : s;
  }
  // ensure plus sign for positive values
  if (/^[+-]/.test(s)) return s;
  // if it's numeric like 150, prefix with +
  const n = parseInt(s, 10);
  if (!isNaN(n) && n > 0) return `+${n}`;
  return s;
}

export default {
  americanToDecimal,
  formatOddsForDisplay,
};
