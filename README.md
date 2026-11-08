# Skewer Shift

Skewer Shift is an ad-free portrait puzzle game for Android and the web. Sort skewers into groups of three, uncover stacked plates, serve timed orders, and work through 12 story levels and five challenge modes. A local save keeps your level, progress, coins, and boosters between sessions.

The rebuild guide and its inspection report informed the board design. The campaign, challenge rules, artwork, audio, and economy were designed for this game. This project uses a TypeScript game with an Android WebView shell. The shell includes the full game for offline play.

## Run locally

Use Node.js 24.15 or later in the Node 24 LTS line.

```powershell
npm ci
npm run codes -- init
npm run dev
```

Open `http://127.0.0.1:4173`. The setup command activates the public `WELCOME` code and prints the private SUPER code when it creates the campaign. The web app can be installed from a supported browser when served over HTTPS or localhost.

```powershell
npm test
```

The suite replays a timed solution for every shipped board and exercises the resolver, save validation, booster effects, and the live HTTP redemption service.

## Code owner commands

| Command | Effect |
| --- | --- |
| `npm run codes -- init` | Creates the public `WELCOME` code and one private SUPER code on a new database. |
| `npm run codes -- status` | Shows active campaigns, usage, and claim limits. |
| `npm run codes -- super:rotate` | Retires the previous SUPER code immediately and prints its replacement. Existing claims and the current cap carry over. |
| `npm run codes -- super:rotate --cap 50` | Rotates the code and limits the current round to 50 total claims, including previous claims. |
| `npm run codes -- super:rotate --cap 50 --new-round` | Starts a fresh round with 50 claims and allows past recipients to qualify again. |
| `npm run codes -- super:disable` | Turns off SUPER redemption until the owner rotates it. |
| `npm run codes -- --help` | Lists the commands for additional campaigns and rewards. |

`WELCOME` gives 300 coins and two of each booster. Each randomly generated SUPER code contains 160 bits of randomness and gives 25,000 coins and 25 of each booster. A player can claim a reward once per campaign round. The game identifies players by a private install or browser token, so a reset or a different installation creates a separate player. The server stores code digests and claim receipts. Keep each new SUPER code private until you intend to share it.

Run owner commands against the same persistent `GRILL_DATA_DIR` as the server. The default is `.grill-data` relative to the working directory. The server accepts player registration, code redemption, and receipt recovery. Code management runs from the owner’s terminal, and the APK contains only the player-facing flow. To serve the game to other players, place `npm start` behind an HTTPS reverse proxy, persist and back up its SQLite data, and keep the server process and code-owner commands on the same data store. `HOST` and `PORT` default to `127.0.0.1` and `4173`. `GRILL_TRUST_PROXY=1` enables the client IP forwarded by a directly connected loopback proxy. Configure that proxy to append the client IP and restrict direct access to the Node port.

## Build the Android APK

Install a JDK, Android SDK platform 36, and build-tools 36.0.0. Set `JAVA_HOME` and `ANDROID_SDK_ROOT` if the tools are outside their standard paths.

```powershell
sdkmanager 'platforms;android-36' 'build-tools;36.0.0'
$env:GRILL_API_ORIGIN = 'https://your-game.example'
npm run android
```

`out/Skewer-Shift.apk` is a single APK for Android 8 or later. Supply the HTTPS origin serving this project to enable online codes. `GRILL_SHARE_URL` can specify a public app or APK download URL, and defaults to the game’s HTTPS origin. With no share URL, Android can attach the installed APK and code in its share sheet. With no API origin, the APK can redeem the public `WELCOME` gift once as a preview reward. SUPER and other online codes require the hosted service.

The build uses a locally generated development signature unless you set `GRILL_ANDROID_KEYSTORE`, `GRILL_ANDROID_KEY_ALIAS`, and `GRILL_ANDROID_STOREPASS`. Set `GRILL_ANDROID_KEYPASS` if the key has a separate password. Keep the same signing key for updates. The builder verifies the finished signature.

## Level tools

Build the app before running the level tools. The shipped level definitions live in `src/domain/levels.ts`.

```powershell
node tools/level-check.mjs --export 001 > my-level.json
node tools/level-check.mjs --inspect my-level.json
node tools/level-check.mjs --solve my-level.json
node tools/level-check.mjs --generate-witnesses
```

The inspector reports per-food counts, available moves and slots, queue depths, and required orders. The solver exercises production rules with a modeled delay per move and validates each winning replay before accepting it.
