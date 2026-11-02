# tolerance-stackup

TypeScript Node CLI for a signed, one-dimensional tolerance chain. Requires Node.js 22.8+ and npm.

```sh
npm install
npm run build
node dist/cli.js examples/symmetric.csv
node dist/cli.js examples/asymmetric.json --json --spec-min 0.7 --spec-max 1.3
npm test
```

Run `node dist/cli.js --help` for usage. The exported `analyze`, `parseInput`, and `validateDimensions` functions are also available from `dist/index.js`.

## Input

Supply a `.csv` file with a header, or a `.json` file containing a nonempty array of objects. Both formats use these fields:

| Field | Meaning |
| --- | --- |
| `name` | Nonempty dimension label |
| `nominal` | Finite nominal value |
| `plusTol` | Nonnegative upper tolerance magnitude |
| `minusTol` | Nonnegative lower tolerance magnitude |
| `direction` | Exactly `1` or `-1`; CSV also accepts `+1` |

Use consistent units throughout, including specification bounds. Direction supplies the sign in the chain; each dimension's original interval is `[nominal - minusTol, nominal + plusTol]`. Negative nominal values are permitted and are still multiplied by direction. JSON numbers must be numbers, not strings. CSV supports quoted labels, escaped quotes, CRLF, reordered headers, and blank lines. Headers are case sensitive. Empty fields, malformed records, invalid numbers, missing dimensions, and unsupported extensions are errors.

## Method

For each dimension with nominal `n`, upper magnitude `p`, lower magnitude `m`, and sign `s`:

- Nominal gap: `N = sum(s * n)`.
- Worst-case bounds: sum each signed interval's lower and upper endpoints. For a negative direction the upper tolerance decreases the gap and the lower tolerance increases it.
- Symmetric-equivalent half-width: `t = (p + m) / 2`.
- Mean shift: `D = sum(s * (p - m) / 2)`.
- RSS mean: `M = N + D`. RSS half-width: `R = sqrt(sum(t²))`. Statistical bounds: `M - R` through `M + R`.
- Each variance contribution is `100 * t² / sum(t²)`. With all tolerances zero, every contribution is reported as 0%.

RSS assumes independent contributors and a common tolerance-to-standard-deviation factor. No sigma factor or probability distribution is inferred from the input; the RSS half-width is not a calculated standard deviation or a guaranteed coverage interval. The mean shift treats the midpoint of each tolerance interval as its assumed mean; it is not a measured process bias.

The symmetric example gives nominal `1`, worst case `0.8..1.2`, and RSS half-width `0.1224744871` (approximately `0.1225`). Contributions are approximately `66.6667%`, `16.6667%`, and `16.6667%`.

## Output and specification checks

Default output is readable text; `--json` emits numerical results with `nominal`, `worstCase`, `rss`, and `contributions`. Optional finite `--spec-min` and/or `--spec-max` add a `specification` result. Each interval independently receives PASS only if its entire range is within the inclusive supplied bounds. An omitted bound is unlimited. Minimum must not exceed maximum. Comparisons use unrounded floating-point results.

A successful analysis exits 0 even when a specification reports FAIL. Invalid input or arguments print an error to stderr and exit 1, with no analysis on stdout.

## Disclaimer

This tool is an engineering estimate, not a certification of fit, safety, yield, or manufacturability. RSS does not guarantee that an assembly meets its specifications. Correlated dimensions, nonnormal processes, geometric effects, temperature, and measurement uncertainty may invalidate these assumptions. Independently verify critical calculations and process capability before making design or production decisions.

## License

MIT; see LICENSE.
