import { test } from 'node:test';
import assert from 'node:assert/strict';
import { main } from '../dist/cli.js';
import { analyze, parseInput } from '../dist/index.js';

const close = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-12, `${actual} != ${expected}`);
const dim = (overrides = {}) => ({ name: 'Part', nominal: 10, plusTol: 0.2, minusTol: 0.1, direction: 1, ...overrides });
const run = async (...args) => {
  const output = [];
  try {
    await main(args, message => output.push(message));
    return { status: 0, stdout: output.join('\n'), stderr: '' };
  } catch (error) {
    return { status: 1, stdout: output.join('\n'), stderr: `Error: ${error.message}` };
  }
};

test('reference symmetric chain and variance contributions', () => {
  const result = analyze([dim({ nominal: 50, plusTol: 0.1 }),
    dim({ nominal: 20, plusTol: 0.05, minusTol: 0.05, direction: -1 }),
    dim({ nominal: 29, plusTol: 0.05, minusTol: 0.05, direction: -1 })]);
  close(result.nominal, 1);
  close(result.worstCase.min, 0.8);
  close(result.worstCase.max, 1.2);
  close(result.rss.halfWidth, Math.sqrt(0.015));
  close(result.rss.mean, 1);
  close(result.contributions[0].percentage, 100 * 2 / 3);
  close(result.contributions.reduce((sum, d) => sum + d.percentage, 0), 100);
});

test('asymmetric negative direction reverses endpoints and mean shift', () => {
  const result = analyze([dim({ direction: -1 })]);
  close(result.nominal, -10);
  close(result.worstCase.min, -10.2);
  close(result.worstCase.max, -9.9);
  close(result.rss.meanShift, -0.05);
  close(result.rss.min, -10.2);
  close(result.rss.max, -9.9);
});

test('zero tolerances and inclusive, one-sided specification bounds', () => {
  const rows = [dim({ plusTol: 0, minusTol: 0 })];
  const result = analyze(rows, { min: 10, max: 10 });
  assert.equal(result.contributions[0].percentage, 0);
  assert.equal(result.specification.worstCase, 'PASS');
  assert.equal(analyze(rows, { max: 9 }).specification.rss, 'FAIL');
  assert.equal(analyze(rows, { min: 9 }).specification.rss, 'PASS');
});

test('RSS and worst case can receive different specification results', () => {
  const result = analyze([dim({ nominal: 0, plusTol: 1, minusTol: 1 }), dim({ nominal: 0, plusTol: 1, minusTol: 1 })], { min: -1.5, max: 1.5 });
  assert.equal(result.specification.rss, 'PASS');
  assert.equal(result.specification.worstCase, 'FAIL');
});

test('invalid dimensions and specification bounds are rejected', () => {
  for (const input of [null, [], {}, [null], [dim({ name: ' ' })], [dim({ nominal: '10' })],
    [dim({ plusTol: -1 })], [dim({ minusTol: NaN })], [dim({ direction: 0 })], [dim({ nominal: Infinity })]]) {
    assert.throws(() => analyze(input));
  }
  assert.throws(() => analyze([dim()], { min: 2, max: 1 }));
  assert.throws(() => analyze([dim()], { max: Infinity }));
  assert.throws(() => analyze([dim({ nominal: Number.MAX_VALUE }), dim({ nominal: Number.MAX_VALUE })]), /overflow/);
});

test('CSV quotes, multiline names, reordered headers, BOM and numeric notation', () => {
  const rows = parseInput('\uFEFFdirection,name,minusTol,nominal,plusTol\r\n+1,"Part, ""A""\nB",.1,1e1,.2\r\n\r\n', 'csv');
  assert.deepEqual(rows, [dim({ name: 'Part, "A"\nB' })]);
  assert.deepEqual(parseInput(JSON.stringify([dim()]), 'json'), [dim()]);
});

test('malformed CSV and JSON are rejected', () => {
  for (const source of ['', 'name,nominal', 'name,nominal,plusTol,minusTol,direction\na,1,2,3',
    'name,nominal,plusTol,minusTol,direction\na,,2,3,1',
    'name,nominal,plusTol,minusTol,direction\na,0x10,2,3,1',
    'name,nominal,plusTol,minusTol,direction\n"a,1,2,3,1',
    'name,nominal,plusTol,minusTol,direction\n"a"x,1,2,3,1']) {
    assert.throws(() => parseInput(source, 'csv'));
  }
  assert.throws(() => parseInput('{', 'json'));
  assert.throws(() => parseInput('[{"name":"a"}]', 'json'));
});

test('CLI JSON, text, help and specification FAIL exit behavior', async () => {
  const json = await run('examples/symmetric.csv', '--json', '--spec-min', '2');
  assert.equal(json.status, 0, json.stderr);
  assert.equal(JSON.parse(json.stdout).specification.worstCase, 'FAIL');
  assert.equal(json.stderr, '');
  const text = await run('examples/asymmetric.json');
  assert.equal(text.status, 0, text.stderr);
  assert.match(text.stdout, /Nominal gap: 1/);
  assert.match(text.stdout, /Variance contributions:/);
  assert.equal((await run('--help')).status, 0);
});

test('CLI errors produce no analysis output', async () => {
  for (const args of [[], ['missing.csv'], ['TASK.md'], ['--bogus'],
    ['examples/symmetric.csv', '--spec-min'], ['examples/symmetric.csv', '--spec-max', 'NaN'],
    ['examples/symmetric.csv', '--spec-min', '3', '--spec-max', '2'],
    ['examples/symmetric.csv', '--json', '--json'], ['examples/symmetric.csv', 'examples/asymmetric.json']]) {
    const result = await run(...args);
    assert.equal(result.status, 1, JSON.stringify(args));
    assert.equal(result.stdout, '');
    assert.match(result.stderr, /Error:/);
  }
});
