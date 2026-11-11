# Reaction Party

Organic Chemistry I category recall, for one shared device or private online rooms.

## Run

Node.js 20+ is required. There are no runtime dependencies or API keys.

```sh
npm start
```

Open the server on port 3000. `PORT` overrides the default. Run `npm test` for answer-bank and multiplayer state-machine tests.

## Online classroom pilot

Choose **Create or join a room**. A host creates a four-letter code; 2–8 players join from their own browsers using unique nicknames. The host selects syllabus-based topics, a 30–90 second time bank per player per question, and 1–3 lives (default 3).

The server owns the timer, player order, answer validation, and life deductions. Each player has a personal time bank that counts down only during their turn. A valid unused answer passes the flask and freezes that player’s remaining time; their clock resumes when the flask returns. Finding every answer automatically advances to a new question, gives the next player the flask, and refreshes everyone’s time bank. Only the current player may answer. When a player’s bank expires, that player loses a life. The last player with lives wins. After a timeout, the host starts the next question with fresh clocks, pauses/resumes discussion, and can end a round without deducting a life.

State updates use Server-Sent Events with HTTP POST actions. WebSockets are not required. A temporary player token in sessionStorage restores a session after reloading the original tab; click **Reconnect to my room**. Connection loss disables answering until the connection returns. Closing the tab or clearing browser storage can lose your seat; host transfer and removing players are not included. Timers continue while players are disconnected.

Rooms live in server memory, expire after 10 minutes without gameplay, and vanish on server restart. No accounts, persistent leaderboards, or public matchmaking. This is a classroom pilot, not a measured production concurrency guarantee.

## Deploy

Use a Node web service that supports long-lived HTTP responses (for example Render or Railway). Run `npm start`; configure the host's assigned `PORT`, HTTPS, and **one server instance**. No build step, database, or paid AI service is required. Static-only hosting cannot run the room server. Free hosting availability/limits must be checked with the provider; sleeping services and restarts interrupt rooms.

If using a reverse proxy, disable response buffering for `/api/events`, allow streaming, and retain the `Host` header and correct `X-Forwarded-Proto`. The server sends SSE heartbeats every 15 seconds. Do not log query strings for `/api/events` because its reconnect URL includes a temporary room token. Keep the app and API on the same origin.

Before a class, create a room and join from a second device on the actual deployed HTTPS URL. Start a round; submit a valid answer, pause/resume, reload/reconnect, and verify expiration and review on both screens. Multiple server replicas require shared room state/routing and are not supported by this version. No hosting deployment or account provisioning is performed by the repository itself.

## Teaching content

Six topic packs and 14 original prompts follow the supplied Fall 2026 OChem I syllabus's chapter scope. The syllabus itself, assessments, and course administration details are not served. Answer banks use explicit synonyms and normalized matching, not AI grading; a missing answer is not necessarily incorrect. Have a TA review the starter banks before classroom use. The host can pause to discuss an out-of-bank answer but cannot award an override during a live round.

Shared-device mode and untimed practice remain available. Fonts use Google Fonts with system fallbacks. No structure drawing or automated mechanism grading.

## Idle hosting costs

Enable Railway’s Serverless/App Sleeping option in the service settings if your plan supports it. The application does not turn this hosting setting on automatically. An idle room closes after 10 minutes without a successful player action or a new player joining. Automatic game timer expiration, SSE heartbeats, reading state, and reconnects do not extend that window. This applies to lobbies, paused games, reviews, and completed games too.

Connected players get a warning during the final two minutes with a **Keep room open** button; using it starts another 10-minute window. Successful game actions also refresh the window. On expiry the server removes the room, sends a terminal event, and closes every room stream. The client stops reconnecting and clears its stale session. A reconnect to a missing/expired room returns HTTP 204 so EventSource also stops retrying if the browser missed the terminal event. Closure runs on the maintenance cycle (up to 15 seconds after the deadline).

Once no rooms have open connections, their SSE heartbeats stop. Static pages and shared-device practice do not keep a background room connection. The app stays running until the hosting platform decides to sleep it; this change makes idle rooms stop generating traffic, but does not guarantee zero charges or a particular sleep time. Avoid external uptime monitors that continually hit the app if you want it to sleep. A first visit after sleep may take longer, and sleeping/restarting clears in-memory rooms. Keep one production replica and skip an always-on staging service to minimize pilot costs.

The optional positive integer `ROOM_IDLE_TIMEOUT_MS` overrides the 10-minute timeout (in milliseconds), primarily for fast local validation. No extra environment variable is needed in production.
