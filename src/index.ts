export interface Dimension {
  name: string;
  nominal: number;
  plusTol: number;
  minusTol: number;
  direction: 1 | -1;
}
export interface Specification { min?: number; max?: number }

function finite(value: unknown, label: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    throw new Error(`${label} must be a finite number`);
  }
  return value;
}

export function validateDimensions(input: unknown): Dimension[] {
  if (!Array.isArray(input) || input.length === 0) {
    throw new Error('Input must be a nonempty array of dimensions');
  }
  return input.map((row: unknown, index) => {
    const label = `Dimension ${index + 1}`;
    if (typeof row !== 'object' || row === null || Array.isArray(row)) {
      throw new Error(`${label} must be an object`);
    }
    const data = row as Record<string, unknown>;
    if (typeof data.name !== 'string' || !data.name.trim()) {
      throw new Error(`${label} name must be a nonempty string`);
    }
    const nominal = finite(data.nominal, `${label} nominal`);
    const plusTol = finite(data.plusTol, `${label} plusTol`);
    const minusTol = finite(data.minusTol, `${label} minusTol`);
    if (plusTol < 0 || minusTol < 0) throw new Error(`${label} tolerances must be nonnegative`);
    if (data.direction !== 1 && data.direction !== -1) {
      throw new Error(`${label} direction must be +1 or -1`);
    }
    return { name: data.name.trim(), nominal, plusTol, minusTol, direction: data.direction };
  });
}

// RFC-style quoted fields, including escaped quotes and embedded line breaks.
function csvRows(source: string): string[][] {
  const rows: string[][] = [];
  let row: string[] = [], field = '', quoted = false, closed = false;
  const endField = () => { row.push(field); field = ''; closed = false; };
  const endRow = () => { endField(); if (row.some(cell => cell.trim())) rows.push(row); row = []; };
  for (let i = 0; i < source.length; i++) {
    const char = source[i]!;
    if (quoted) {
      if (char === '"') {
        if (source[i + 1] === '"') { field += '"'; i++; }
        else { quoted = false; closed = true; }
      } else field += char;
    } else if (char === ',') endField();
    else if (char === '\n' || char === '\r') {
      if (char === '\r' && source[i + 1] === '\n') i++;
      endRow();
    } else if (char === '"') {
      if (field || closed) throw new Error('Invalid quote in CSV field');
      quoted = true;
    } else {
      if (closed) throw new Error('Unexpected text after closing CSV quote');
      field += char;
    }
  }
  if (quoted) throw new Error('Unterminated quoted CSV field');
  endRow();
  return rows;
}

const numericPattern = /^[+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?$/i;
export function parseNumber(value: string, label: string): number {
  if (!numericPattern.test(value.trim())) throw new Error(`${label} must be a finite number`);
  return finite(Number(value), label);
}

export function parseInput(source: string, format: 'json' | 'csv'): Dimension[] {
  source = source.replace(/^\uFEFF/, '');
  if (format === 'json') return validateDimensions(JSON.parse(source));
  const rows = csvRows(source);
  const header = rows.shift();
  if (!header) throw new Error('CSV is empty');
  const keys = header.map(key => key.trim());
  const required = ['name', 'nominal', 'plusTol', 'minusTol', 'direction'];
  if (keys.length !== required.length || new Set(keys).size !== keys.length ||
      required.some(key => !keys.includes(key))) {
    throw new Error(`CSV header must contain exactly: ${required.join(',')}`);
  }
  return validateDimensions(rows.map((cells, index) => {
    if (cells.length !== keys.length) throw new Error(`CSV row ${index + 2} has the wrong number of fields`);
    return Object.fromEntries(keys.map((key, i) => [key,
      key === 'name' ? cells[i]! : parseNumber(cells[i]!, `CSV row ${index + 2} ${key}`)]));
  }));
}

export function analyze(input: unknown, spec: Specification = {}) {
  const dimensions = validateDimensions(input);
  if (spec.min !== undefined) finite(spec.min, 'Specification minimum');
  if (spec.max !== undefined) finite(spec.max, 'Specification maximum');
  if (spec.min !== undefined && spec.max !== undefined && spec.min > spec.max) {
    throw new Error('Specification minimum must not exceed maximum');
  }
  let nominal = 0, min = 0, max = 0, meanShift = 0, radius = 0;
  const widths = dimensions.map(d => {
    nominal += d.direction * d.nominal;
    min += d.direction * d.nominal - (d.direction === 1 ? d.minusTol : d.plusTol);
    max += d.direction * d.nominal + (d.direction === 1 ? d.plusTol : d.minusTol);
    meanShift += d.direction * (d.plusTol / 2 - d.minusTol / 2);
    const width = d.plusTol / 2 + d.minusTol / 2;
    radius = Math.hypot(radius, width);
    return width;
  });
  const mean = nominal + meanShift;
  const rss = { mean, meanShift, halfWidth: radius, min: mean - radius, max: mean + radius };
  const worstCase = { min, max };
  if (![nominal, min, max, meanShift, ...Object.values(rss)].every(Number.isFinite)) {
    throw new Error('Analysis overflow: dimensions are too large');
  }
  const contributions = dimensions.map((d, i) => ({
    name: d.name,
    percentage: radius === 0 ? 0 : (widths[i]! / radius) ** 2 * 100
  }));
  const within = (range: { min: number; max: number }) =>
    (spec.min === undefined || range.min >= spec.min) &&
    (spec.max === undefined || range.max <= spec.max) ? 'PASS' as const : 'FAIL' as const;
  const specification = spec.min === undefined && spec.max === undefined ? undefined : {
    ...spec, worstCase: within(worstCase), rss: within(rss)
  };
  return { nominal, worstCase, rss, contributions, ...(specification ? { specification } : {}) };
}
