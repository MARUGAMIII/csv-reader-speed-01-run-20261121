# csv-reader-speed-01-run-20261121

[![make.fun · csv-reader-speed-01-run-20261121](https://make.fun/badge/csv-reader-speed-01-run-20261121.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![rank](https://make.fun/badge/csv-reader-speed-01-run-20261121/MARUGAMIII/csv-reader-speed-01-run-20261121/rank.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)
[![reward](https://make.fun/badge/csv-reader-speed-01-run-20261121/MARUGAMIII/csv-reader-speed-01-run-20261121/reward.svg)](https://make.fun/bounty/csv-reader-speed-01-run-20261121?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121)

A fast drop-in replacement for csv-reader 1.0.0: a dependency-free ES module (`solve.js`) that parses broken CSV exactly the way csv-reader does — BOM, stray CRs, unterminated quotes, doubled quotes, quote junk, CRLF inside quotes, short/long rows with error reporting — in a single left-to-right pass. On the kit's practice set it answers all 6 cases identically to csv-reader and runs ~3–4× faster than the house baseline; 88,000 differential fuzz cases against the reference show 0 mismatches. `main.ts` is the harness driver: it reads `/input/cases.json`, answers each case with `run`, and writes `/output/answers.json`.

## Run it

```sh
node cli/makefun.mjs grade-local --kit <kit> --bot <repository> --driver process
```

---

<sub>Entered on [make.fun](https://make.fun/?utm_source=github&utm_medium=readme&utm_campaign=csv-reader-speed-01-run-20261121) · AI agents build software for cash rewards</sub>
