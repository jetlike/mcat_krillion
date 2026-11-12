# Reaction Party — MCAT

An extension of the original OChem recall game: solo challenge, online parties, shared-device play and untimed practice. Six MCAT subjects, 35 selectable subtopics, 48 bounded prompts and 292 canonical answers. CARS is excluded.

## Run and verify

Requires **Node.js 24** (built-in SQLite). No runtime dependencies or AI keys.

```sh
npm run build
npm test
npm start
```

Open http://localhost:3000. `PORT` overrides the port. `npm run test:e2e` runs desktop/mobile Chromium scenarios with two independent browser profiles. Set `PLAYWRIGHT_MODULE` and `CHROMIUM_PATH` to your installed Playwright module and Chromium executable; the defaults point to the managed cloud runtime. Test screenshots are written under ignored `test-results/`.

## Rules

Each player has a personal time balance that runs only on their turn. A correct unused answer adds `4 + 18 × (rarity/100)^1.6` (the previous reward plus 2) seconds and passes the flask. Correct answers and prompt changes never reset clocks. Wrong answers leave the turn and deadline running. Every correct unused answer strictly above 90 earns exactly one life, without a cap; exactly 90 earns no life. Aliases resolve to the same canonical answer and cannot be rewarded twice. The server owns deadlines, rewards, eliminations and idempotent submission receipts.

Timeout costs one life. A surviving player alone gets their starting time restored, then the next player continues without forced room review. Zero-life players are eliminated. The last survivor wins; solo ends at zero lives. Each prompt lasts one turn per active player (one correct answer or a timeout), so solo advances after every correct answer. All eligible prompts are visited before recycling, with their used-answer sets intact; fully exhausted prompts are removed. Exhausting all selected answers completes the match.

Banks show rarity, aliases, explanations, references, sorting and used markers. Viewing banks keeps the timer running. Opening a bank or review bank marks subsequent responses to that prompt assisted for this match; assistance is UI tracking, not a guarantee against outside help. Personal review never pauses a room. The host explicitly confirms room-wide review, which pauses everyone until the host continues.

## Content and recognition

`taxonomy.js` defines hierarchical multi-selection; counts use distinct prompt IDs, including cross-tags. `content/approved-prompts.json` contains the reviewed examples and additional source-referenced sets. `scripts/build-content.mjs` combines those with the 14 original prompts from `questions.js`, validates aliases and score bounds, and creates the versioned `content/catalog.json`.

Rarity preserves the approved `0.50 A + 0.30 Y + 0.20 P` baseline. A, Y and P are explicitly labeled educational estimates, **not observed MCAT frequencies**. Ten approved examples retain their reviewed values; additional content uses conservative documented estimates. Change the catalog version when modifying a released bank. Continuous rewards are computed on the server rather than trusting the browser.

Matching uses normalization, curated aliases, then conservative unique typo matching. A protected scientific lexicon prevents nearby valid terms being silently corrected into different concepts (e.g. inulin/insulin, thymine/thiamine, PFK-1/PFK-2). Ambiguous van der Waals wording requests specificity. Missing bank answers can be submitted for review; suggestions never change live grading or rewards.

The private source corpus (PDFs, decks, extracted media and `content.sqlite`) is **not deployed or committed**. `scripts/curate-source-store.py /private/content.sqlite` adds an audited, reversible canonical overlay to that existing authoring store and archives this catalog, after making a SQLite backup. Original notes, fields, cards, clozes, tags, media and document pages remain unchanged. Cosmetic equivalence preserves scientific case, cloze syntax, math, superscripts and media identities; only six individually reviewed near-equivalent assertions are grouped across decks. Unique source details remain attached as variants. Inner-ear and misleading counterconditioning candidates remain separate. This is conservative canonicalization, not automatic conversion of every source fact into a playable bank.

## Persistent learning history

`history.js` safely adds prefixed `rp_` tables: migrations, anonymous users, actors, sessions, opportunities, attempts and suggestions. An existing unversioned SQLite file is backed up with `VACUUM INTO` before additive migration. Existing source tables are not replaced. SQLite uses WAL and foreign keys.

History records canonical IDs, raw submissions, outcomes, server response times excluding host pauses, topics, rarity/rewards at the time, assistance, and complete review snapshots. My Performance separates assisted/unassisted cohorts, calculates accuracy, mean/median response speed, distributions, unique answers, rarity/rewards, subject/subtopic results and trends. Weakness suggestions require at least 5 opportunities and 10 scored attempts. Duplicate attempts are recorded but excluded from accuracy errors. One successful response is not permanent mastery.

Identity is an opaque HttpOnly browser cookie, stored as a hash on the server. Return with the same browser/cookie; clearing it loses access. There is no registered account, password recovery or cross-device sync. Shared-device names get separate actors under the owning browser. History is restricted to actors owned by that browser; complete shared-room review includes participant nicknames and match events. Export history as JSON via My Performance.

## Deploy on Railway

Use the existing GitHub-connected service, **one replica**, Node 24, `npm start`, assigned `PORT`, HTTPS and healthcheck `/api/health`. `npm run build` can be the build command; the validated catalog is also committed. Version 2.0.0 health reports catalog counts and whether Railway reports an attached volume.

**Attach a Railway persistent volume at `/data` and set `DATA_DIR=/data`.** The app also honors `RAILWAY_VOLUME_MOUNT_PATH` automatically. Without a volume, SQLite works locally but hosting deployments/replacements can erase history. The default local path is `data/learning.sqlite`; it is ignored by Git. No deployment credentials are stored in the app. Back up the volume/database regularly. For an online backup use SQLite's backup API; do not copy only the main file while WAL writes are in progress.

Example environment settings are in `.env.example`; Node does not automatically load this file. Set production variables in Railway. Preserve `Host` and `X-Forwarded-Proto` at the proxy, disable buffering for `/api/events`, and allow long-lived SSE responses. Do not log the event-stream query string, which includes a temporary seat token. Public static serving is an allowlist; neither SQLite nor the private source corpus is accessible.

Rooms remain in memory and clear after server restart. Reconnect from the original tab; disconnections keep timers running, and host transfer occurs when the host explicitly leaves. Multi-replica deployment requires shared room state and is not supported. Persistent history survives restarts only when the database resides on persistent storage. A cookie in the same browser restores history even after a room disappears.

## Idle costs

Rooms close after **10 minutes** without successful gameplay/keepalive or joins. Automatic timer expiration, bank viewing, SSE heartbeats and reconnects do not extend the window. Clients get a final-two-minute warning and Keep room open action. Expiry closes every room stream; stale reconnects return HTTP 204, ending retries. An optional `ROOM_IDLE_TIMEOUT_MS` overrides the window for tests.

Enable Railway Serverless/App Sleeping in service settings if supported. The app's maintenance timers do not make network requests; once room streams close, heartbeat traffic stops. The platform decides when to sleep; zero cost and exact sleep timing are not guaranteed. Avoid uptime monitors and extra always-on staging services if minimizing pilot costs. Use one production instance and test locally first.
