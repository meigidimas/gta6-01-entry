[![gta6-01](https://make.fun/badge/gta6-01.svg)](https://make.fun/bounty/gta6-01)
[![rank](https://make.fun/badge/gta6-01/meigidimas/gta6-01-entry/rank.svg)](https://make.fun/bounty/gta6-01)
[![reward](https://make.fun/badge/gta6-01/meigidimas/gta6-01-entry/reward.svg)](https://make.fun/bounty/gta6-01)

# Neon Bay Heat

An original open-world crime game for the [gta6-01 "Make GTA 6" bounty](https://make.fun/bounty/gta6-01).

Danny Cole came to Neon Bay to drive getaway cars and keep his head down. The city had other plans. Explore a sun-soaked procedural coastal city on foot or behind the wheel, steal what you need, lose the heat, and take the jobs nobody else will — five story missions, from a first stolen car to the big score downtown.

Everything is original: the city, the cars, the characters, the music. No part of any commercial game. The game runs entirely offline in desktop Chrome from static files — no network requests, no build step, no downloads.

## Features

- **Procedural 3D city** — a seeded coastal grid of streets, towers, parks, palms, a beach and a marina, the same city every run
- **Driving** — arcade car physics with traffic that queues, overtakes and reverses out when stuck; parked sedans, vans, sports cars and taxis to steal
- **On foot** — run the streets, punch your way out of trouble, and watch pedestrians flee a speeding car
- **Police pursuit** — a 5-star wanted system: patrol cars chase on the roads, ram, and hold you for a bust; a helicopter with a spotlight circles from 3 stars up; break line of sight and the heat cools
- **Combat** — fists against pedestrians and patrol cars, with health, WASTED and BUSTED endings
- **Five story missions** — each with steps, an objective marker, a minimap diamond and a live tracker (see below)
- **HUD** — wanted stars, cash, speed, health, a live minimap, objective line and toasts
- **Synthesized audio** — engine hum, a two-tone siren, a chord-loop soundtrack and mission stingers, all built from WebAudio oscillators; no audio files
- **Saves** — progress autosaves to localStorage, and the title screen offers Continue
- **Deterministic screenshots** — `?shot=<scene>&seed=1` stages a fixed scene for the competition shots

## Run it locally

```sh
node serve.ts
```

Then open <http://localhost:8080> in desktop Chrome. Or open `game/index.html` directly from a static file server of your choice — the game needs no build step and makes no network requests.

## Screenshot scenes

The competition shots are staged deterministically from the game itself: `?shot=chase&seed=1`, `?shot=mission&seed=1`, `?shot=delivery&seed=1` and `?shot=start&seed=1` — see `shots.json` for the four shipped shots.

## Controls

| Key | Action |
| --- | --- |
| W A S D / arrows | Move on foot, drive in a car |
| Shift | Run |
| E | Steal a parked car / exit the car |
| F or mouse click | Punch |
| Mouse drag | Look around |
| Esc / P | Pause |
| M | Mute |

## Missions

1. **First Wheels** ($250) — steal a car and drive it to the marina drop-off.
2. **The Drop** ($400) — pick up a package uptown and deliver it to the marina before the clock runs out.
3. **Hot Pursuit** ($500) — earn 2 wanted stars, then lose the heat.
4. **Payback** ($600) — chase the rival's car and ram it until it quits.
5. **The Big Score** ($1,000) — pick up the crew, hit the vault downtown, and escape hot.

## License

MIT — see [LICENSE](LICENSE).
