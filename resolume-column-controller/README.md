# Resolume Column Controller

A small web control panel for Resolume Avenue (7.x and later) that switches back and forth between **two columns** (default 1 and 2). It talks to Resolume's REST API.

| Button | What it does in Resolume |
|---|---|
| **QUEUE** (`Q`) | Sets every clip in the *next* column to **Play Once and Hold**, pauses it and moves it to frame 1, then triggers that column. Each press after that switches to the other column. |
| **PLAY** (`Space` / `P`) | Plays the live column's clips forward. Because they are set to Play Once and Hold, they stop and hold on the last frame. |

The order is QUEUE → PLAY → QUEUE → PLAY …, and the column goes 1 → 2 → 1 → 2 …

## Setup

1. In Resolume, go to **Preferences → Webserver** and turn on the webserver. Note its port (the default is 8080).
2. Install Node.js 18 or newer. There are no npm packages to install.
3. Run:
   ```bash
   node server.js
   # or, if Resolume is on another machine or port:
   RESOLUME_HOST=192.168.1.50 RESOLUME_PORT=8080 PORT=3000 node server.js
   # the same settings as flags:
   node server.js --resolume-host 192.168.1.50 --resolume-port 8080 --port 3000 --columns 1,2
   ```
4. Open `http://<this-machine>:3000` in any browser on the network, such as a tablet at the operator's position.

## Triggering from show control

Each command is a plain HTTP request, sent as GET or POST. This means QLab, Companion, a Stream Deck, or a PLC can fire them:

```
http://<host>:3000/api/queue    # queue/switch to the next column, frozen on frame 1
http://<host>:3000/api/play     # start playback (holds on last frame)
http://<host>:3000/api/status   # JSON state
POST /api/next  {"column": 2}   # choose which column the next QUEUE triggers
POST /api/reset                 # clear controller state (Resolume is not changed)
```

If a command arrives while the previous one is still running, the controller rejects it with HTTP 409. This stops a double press from skipping a column.

## Notes

- Only clips that are loaded in the target column are changed. An empty slot is skipped.
- The controller remembers which column comes next. If someone triggers a column by hand in Resolume, click **Make next** on the column you want to come next, or press **Reset controller**.
- Rehearse without Resolume: run `node tools/mock-resolume.js 8080` in one terminal and `node server.js` in another.
