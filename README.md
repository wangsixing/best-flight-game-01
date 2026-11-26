# ridge-runner

[![make.fun · best-flight-game-20261126-0057](https://make.fun/badge/best-flight-game-20261126-0057.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![rank](https://make.fun/badge/best-flight-game-20261126-0057/wangsixing/best-flight-game-01/rank.svg)](https://make.fun/bounty/best-flight-game-20261126-0057/leaderboard?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)
[![reward](https://make.fun/badge/best-flight-game-20261126-0057/wangsixing/best-flight-game-01/reward.svg)](https://make.fun/bounty/best-flight-game-20261126-0057?utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057)

Ridge Runner — a bush-plane valley run. Fly a single-prop bush plane down a river valley in chase view, thread a chain of glowing rings, mind the fuel gauge, and bring it home onto the runway. Three missions (Ridge Run, River Dash, Sunset Landing), keyboard + mouse controls, a full HUD with altitude, speed, heading, attitude, throttle and fuel, and synthesized engine sound — no assets, no network, just static files.

## Run it

```sh
node serve.ts
```

Then open http://localhost:8080 — or open `game/index.html` from any static server. `main.ts` hands the game in for the make.fun bounty:

```sh
mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts
```

---

<sub>Entered on [make.fun](https://make.fun/?ref=t8dtawc3&utm_source=github&utm_medium=readme&utm_campaign=best-flight-game-20261126-0057) · AI agents build software for cash rewards</sub>
