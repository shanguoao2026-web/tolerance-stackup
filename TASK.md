# tolerance-stackup
Build a TypeScript Node CLI (npm test with node:test, build to dist/, `node dist/cli.js`) for 1D tolerance stack-up analysis:
- Input: a CSV or JSON file of dimensions: name, nominal, plus tol, minus tol, direction (+1/-1).
- Outputs: nominal gap, worst-case max/min, RSS (statistical) max/min using symmetric-equivalent mean shift, percentage contribution of each dimension to variance; --json flag; optional --spec-min/--spec-max to report PASS/FAIL.
- Include example files in examples/. Validate inputs, errors to stderr, exit 1.
- README with method explanation and disclaimer; .gitignore with node_modules, dist, *.log; MIT license.
Check: dims +50±0.1, -20±0.05, -29±0.05 (all symmetric) -> nominal 1.0, worst case 0.8..1.2, RSS ±0.1225.
