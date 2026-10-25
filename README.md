# QuackNana Marble Race

A YouTube Live interactive marble race for vertical streams (9:16, 1080×1920).

Viewers type **`enter`** in the live chat and their profile picture becomes a marble. After a 2-minute
lobby countdown the gate opens and every marble falls through the obstacles. The race takes about
3 minutes, and the first marble across the finish line wins. Then the winner screen shows, a new
2-minute countdown starts, and everyone who entered races again.

![icon](build/icon.png)

## Features

- **Joins from YouTube chat.** It reads the live chat the same way youtube.com does, so you don't need
  an API key or a login. Type your `@handle` and it finds your live stream.
- **Profile pictures as marbles**, with glossy marble rendering. Names are hidden on the marbles by
  default (there is a setting to show them) and are shown in the leaders list and on the winner screen.
- **5 courses**, picked at random every round: *Duck Pond Dash*, *Candy Cascade*, *Lava Peak*,
  *Neon Galaxy* and *Frozen Falls*. Every course starts with **pegs**, then mixes zig-zag ramps,
  spinners, pinball bumpers, swinging hammers, windmills, trapdoors, tipping buckets, pinwheels,
  diamond pegs, moving platforms and funnels. Each course is built to last the race length you choose
  (3 minutes by default).
- **Likes and subscribers do something good.**
  - Each new like boosts a random marble, and every 10 likes (a like goal) boosts every marble.
  - Each new subscriber starts a **SUB STORM**: every marble gets boosted, with confetti.
  - Super Chats, Super Stickers, gifts and new members get a **golden marble** and a big boost.
- Live leaders list, minimap, rank badges, a crown for the last winner, an all-time winners
  leaderboard, a join feed, sound effects and generated chiptune music.
- A **control panel** to connect YouTube, start or end races, test every effect without going live
  (test ducks, test like, sub and super chat), and change settings.
- An **OBS Browser Source** at `http://127.0.0.1:7777/` that renders at exactly 1080×1920, or you can
  use Window Capture on the game window.
- Anti-stuck system: marbles that stop moving get nudged and, if still stuck, respawned.

## Download and play (Windows)

1. Download `QuackNana-Marble-Race-Windows.zip`.
2. **Extract it first** (right-click, then *Extract All…*). Don't run the EXE from inside the zip.
3. Open the `QuackNana Marble Race` folder and double-click **`QuackNana Marble Race.exe`**.
   Windows SmartScreen may warn about an unknown app. Click *More info*, then *Run anyway*.

Full step-by-step instructions are in [HOW-TO-USE.txt](HOW-TO-USE.txt).

## OBS setup

| Method | How |
| --- | --- |
| Browser Source (best) | URL `http://127.0.0.1:7777/`, width 1080, height 1920. Add `?sound=1` for game audio in OBS. |
| Window Capture | Capture the "QuackNana Marble Race" window. The control panel can resize it to exactly 1080×1920. |

## Chat commands

| Who | Message | What it does |
| --- | --- | --- |
| anyone | `enter` / `!enter` | join (during a race you join the next one) |
| anyone | `leave` / `!leave` | leave |
| channel owner / moderators | `!start` | skip the countdown and start now |

You can change the join and leave words in the settings.

## Developing

```bash
npm install
npm start            # run the app (Electron)
npm run server       # run without Electron; open http://127.0.0.1:7777/ and /control in a browser
npm run sim          # headless race simulator, prints how long each course takes
npm run build:win    # build dist/QuackNana Marble Race-win32-x64/ with the .exe (works on Linux/macOS too)
```

The GitHub Actions workflow in `.github/workflows/build-windows.yml` builds the Windows zip on every
push. Pushing a tag like `v1.0.0` also attaches the zip to a GitHub Release.

### How it works

```
YouTube live chat ──▶ src/youtube/live.js ──▶ src/game/game.js (lobby → race → results)
                                                 │  planck.js physics, 60 steps/s
                                                 ▼
                              src/main/server.js (HTTP + WebSocket on 127.0.0.1:7777)
                                   │                          │
                       game window / OBS source         control panel
                        src/web/index.html             src/web/control.html
```

- `src/game/sections.js` contains the obstacle building blocks, and `src/game/courses.js` holds the
  5 course themes and the planner that strings sections together to hit the race length.
- The game runs in the main process and streams 30 snapshots per second. Every screen (the app window
  and the OBS source) smooths between snapshots, so they all show exactly the same race.
- Settings and the leaderboard are saved in `%APPDATA%\QuackNana Marble Race` (on Windows).

## Credits

- Physics: [planck.js](https://github.com/piqnt/planck.js) (MIT)
- Fonts: *Luckiest Guy* (Apache 2.0) and *Fredoka* (SIL OFL), both from Google Fonts. The licenses
  are in `src/web/fonts/`.
- All graphics and sounds are drawn or generated in code.
