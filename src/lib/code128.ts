/**
 * Minimal Code 128 (subset B) encoder for printed package IDs, so 1D keyboard-wedge scanners
 * can read labels alongside the QR code. Returns module widths (bar, space, bar, …).
 */

// Bar/space width patterns for symbol values 0–106 (106 = stop, which has a 7th element).
const PATTERNS = [
  '212222', '222122', '222221', '121223', '121322', '131222', '122213', '122312', '132212', '221213',
  '221312', '231212', '112232', '122132', '122231', '113222', '123122', '123221', '223211', '221132',
  '221231', '213212', '223112', '312131', '311222', '321122', '321221', '312212', '322112', '322211',
  '212123', '212321', '232121', '111323', '131123', '131321', '112313', '132113', '132311', '211313',
  '231113', '231311', '112133', '112331', '132131', '113123', '113321', '133121', '313121', '211331',
  '231131', '213113', '213311', '213131', '311123', '311321', '331121', '312113', '312311', '332111',
  '314111', '221411', '431111', '111224', '111422', '121124', '121421', '141122', '141221', '112214',
  '112412', '122114', '122411', '142112', '142211', '241211', '221114', '413111', '241112', '134111',
  '111242', '121142', '121241', '114212', '124112', '124211', '411212', '421112', '421211', '212141',
  '214121', '412121', '111143', '111341', '131141', '114113', '114311', '411113', '411311', '113141',
  '114131', '311141', '411131', '211412', '211214', '211232', '2331112',
];
const START_B = 104;
const STOP = 106;

export function code128B(text: string): number[] {
  const values: number[] = [START_B];
  for (const ch of text) {
    const code = ch.charCodeAt(0);
    if (code < 32 || code > 126) throw new Error(`Character not encodable in Code 128-B: ${JSON.stringify(ch)}`);
    values.push(code - 32);
  }
  const checksum = values.reduce((sum, v, i) => sum + v * (i === 0 ? 1 : i), 0) % 103;
  values.push(checksum, STOP);
  return values.flatMap((v) => PATTERNS[v].split('').map(Number));
}

/** SVG rects for the barcode, including the 10-module quiet zones. */
export function code128Bars(text: string): { x: number; w: number }[] & { width: number } {
  const widths = code128B(text);
  const bars: { x: number; w: number }[] = [];
  let x = 10;
  widths.forEach((w, i) => {
    if (i % 2 === 0) bars.push({ x, w });
    x += w;
  });
  return Object.assign(bars, { width: x + 10 });
}
