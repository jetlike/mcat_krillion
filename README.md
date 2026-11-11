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

Rooms live in server memory, expire after six hours of inactivity, and vanish on server restart. No accounts, persistent leaderboards, or public matchmaking. This is a classroom pilot, not a measured production concurrency guarantee.

## Deploy

Use a Node web service that supports long-lived HTTP responses (for example Render or Railway). Run `npm start`; configure the host's assigned `PORT`, HTTPS, and **one server instance**. No build step, database, or paid AI service is required. Static-only hosting cannot run the room server. Free hosting availability/limits must be checked with the provider; sleeping services and restarts interrupt rooms.

If using a reverse proxy, disable response buffering for `/api/events`, allow streaming, and retain the `Host` header and correct `X-Forwarded-Proto`. The server sends SSE heartbeats every 15 seconds. Do not log query strings for `/api/events` because its reconnect URL includes a temporary room token. Keep the app and API on the same origin.

Before a class, create a room and join from a second device on the actual deployed HTTPS URL. Start a round; submit a valid answer, pause/resume, reload/reconnect, and verify expiration and review on both screens. Multiple server replicas require shared room state/routing and are not supported by this version. No hosting deployment or account provisioning is performed by the repository itself.

## Teaching content

Six topic packs and 14 original prompts follow the supplied Fall 2026 OChem I syllabus's chapter scope. The syllabus itself, assessments, and course administration details are not served. Answer banks use explicit synonyms and normalized matching, not AI grading; a missing answer is not necessarily incorrect. Have a TA review the starter banks before classroom use. The host can pause to discuss an out-of-bank answer but cannot award an override during a live round.

Shared-device mode and untimed practice remain available. Fonts use Google Fonts with system fallbacks. No structure drawing or automated mechanism grading.
