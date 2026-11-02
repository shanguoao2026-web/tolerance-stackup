#!/usr/bin/env node
import { readFile } from 'node:fs/promises';
import { extname, resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { analyze, parseInput, parseNumber, type Specification } from './index.js';

const usage = `Usage: node dist/cli.js <dimensions.csv|dimensions.json> [--json] [--spec-min NUMBER] [--spec-max NUMBER]

CSV headers / JSON keys: name, nominal, plusTol, minusTol, direction
Tolerances are nonnegative magnitudes; direction is +1 or -1.
Specification results compare the full worst-case and RSS intervals to inclusive bounds.
A valid analysis exits 0, including a specification FAIL. Input errors exit 1.`;

export async function main(args: string[], log: (message: string) => void = console.log) {
  if (args.length === 1 && (args[0] === '--help' || args[0] === '-h')) {
    log(usage); return;
  }
  let file: string | undefined, json = false;
  const spec: Specification = {};
  const seen = new Set<string>();
  for (let i = 0; i < args.length; i++) {
    const arg = args[i]!;
    if (arg === '--json' || arg === '--spec-min' || arg === '--spec-max') {
      if (seen.has(arg)) throw new Error(`Duplicate option: ${arg}`);
      seen.add(arg);
      if (arg === '--json') json = true;
      else {
        const value = args[++i];
        if (value === undefined) throw new Error(`Missing value for ${arg}`);
        spec[arg === '--spec-min' ? 'min' : 'max'] = parseNumber(value, arg);
      }
    } else if (arg.startsWith('-')) throw new Error(`Unknown option: ${arg}`);
    else if (file) throw new Error('Expected exactly one input file');
    else file = arg;
  }
  if (!file) throw new Error(usage);
  const extension = extname(file).toLowerCase();
  if (extension !== '.json' && extension !== '.csv') throw new Error('Input file must have a .csv or .json extension');
  const result = analyze(parseInput(await readFile(file, 'utf8'), extension === '.json' ? 'json' : 'csv'), spec);
  if (json) { log(JSON.stringify(result, null, 2)); return; }
  const n = (value: number) => Number(value.toPrecision(10)).toString();
  log(`Nominal gap: ${n(result.nominal)}`);
  log(`Worst-case min/max: ${n(result.worstCase.min)} .. ${n(result.worstCase.max)}`);
  log(`RSS min/max: ${n(result.rss.min)} .. ${n(result.rss.max)}`);
  log(`RSS mean: ${n(result.rss.mean)} (mean shift ${n(result.rss.meanShift)}), ±${n(result.rss.halfWidth)}`);
  log('Variance contributions:');
  for (const item of result.contributions) log(`  ${item.name}: ${n(item.percentage)}%`);
  if (result.specification) {
    log(`Specification: ${spec.min === undefined ? '-infinity' : n(spec.min)} .. ${spec.max === undefined ? '+infinity' : n(spec.max)}`);
    log(`Worst-case: ${result.specification.worstCase}`);
    log(`RSS: ${result.specification.rss}`);
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
main(process.argv.slice(2)).catch((error: unknown) => {
  console.error(`Error: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 1;
});

}
