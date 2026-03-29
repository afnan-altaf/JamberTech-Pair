const express = require("express");
const path = require("path");
const fs = require("fs");
const pino = require("pino");
const {
  default: makeWASocket,
  useMultiFileAuthState,
  fetchLatestBaileysVersion,
  DisconnectReason,
  makeCacheableSignalKeyStore,
} = require("@whiskeysockets/baileys");

const app = express();
app.use(express.json());
app.use(express.static(path.join(__dirname, "public")));

const PORT = process.env.PORT || 3000;
const SESSIONS_DIR = path.join(__dirname, "pair_sessions");
if (!fs.existsSync(SESSIONS_DIR)) fs.mkdirSync(SESSIONS_DIR, { recursive: true });

// Active pairing sessions in memory
const activeSessions = new Map();

// ── Clean old session folder ─────────────────────────────────────────────────
function cleanSession(id) {
  const dir = path.join(SESSIONS_DIR, id);
  if (fs.existsSync(dir)) fs.rmSync(dir, { recursive: true, force: true });
}

// ── Encode credentials as DJ~ SESSION_ID ─────────────────────────────────────
function encodeSession(credsPath) {
  try {
    const creds = fs.readFileSync(credsPath, "utf-8");
    return "DJ~" + Buffer.from(creds).toString("base64");
  } catch {
    return null;
  }
}

// ── POST /pair — start pairing ────────────────────────────────────────────────
app.post("/pair", async (req, res) => {
  let { number } = req.body;
  if (!number) return res.status(400).json({ error: "Phone number required" });

  // Sanitize: remove +, spaces, dashes
  number = number.replace(/[^0-9]/g, "");
  if (number.length < 10) return res.status(400).json({ error: "Invalid number" });

  const sessionId = `pair_${number}_${Date.now()}`;
  cleanSession(sessionId);

  const sessionDir = path.join(SESSIONS_DIR, sessionId);
  fs.mkdirSync(sessionDir, { recursive: true });

  try {
    const { state, saveCreds } = await useMultiFileAuthState(sessionDir);
    const { version } = await fetchLatestBaileysVersion();

    const sock = makeWASocket({
      version,
      logger: pino({ level: "silent" }),
      auth: {
        creds: state.creds,
        keys: makeCacheableSignalKeyStore(state.keys, pino({ level: "silent" })),
      },
      browser: ["JamberTech-WA", "Chrome", "1.0.0"],
      printQRInTerminal: false,
    });

    sock.ev.on("creds.update", saveCreds);

    // Request pairing code
    await new Promise((r) => setTimeout(r, 1500));
    let pairCode;
    try {
      pairCode = await sock.requestPairingCode(number);
      pairCode = pairCode?.match(/.{1,4}/g)?.join("-") || pairCode;
    } catch (err) {
      cleanSession(sessionId);
      return res.status(500).json({ error: "Could not generate pair code. Try again." });
    }

    // Store session info
    activeSessions.set(sessionId, { sock, sessionDir, number, connected: false, sessionID: null });

    // Listen for connection
    sock.ev.on("connection.update", async ({ connection, lastDisconnect }) => {
      const entry = activeSessions.get(sessionId);
      if (!entry) return;

      if (connection === "open") {
        await new Promise((r) => setTimeout(r, 2000));
        const credsPath = path.join(sessionDir, "creds.json");
        const encoded = encodeSession(credsPath);
        if (encoded) {
          entry.connected = true;
          entry.sessionID = encoded;
          activeSessions.set(sessionId, entry);
        }
        try { sock.end(); } catch {}
      }

      if (connection === "close") {
        const code = lastDisconnect?.error?.output?.statusCode;
        if (code === DisconnectReason.loggedOut) {
          activeSessions.delete(sessionId);
          cleanSession(sessionId);
        }
      }
    });

    // Respond with pair code + session token for polling
    res.json({ pairCode, sessionId });

    // Auto cleanup after 5 minutes
    setTimeout(() => {
      const entry = activeSessions.get(sessionId);
      if (entry && !entry.connected) {
        try { entry.sock.end(); } catch {}
        activeSessions.delete(sessionId);
        cleanSession(sessionId);
      }
    }, 5 * 60 * 1000);

  } catch (err) {
    cleanSession(sessionId);
    res.status(500).json({ error: "Server error. Try again." });
  }
});

// ── GET /status/:sessionId — poll for SESSION_ID ──────────────────────────────
app.get("/status/:sessionId", (req, res) => {
  const entry = activeSessions.get(req.params.sessionId);
  if (!entry) return res.json({ status: "expired" });
  if (entry.connected && entry.sessionID) {
    const sid = entry.sessionID;
    activeSessions.delete(req.params.sessionId);
    cleanSession(entry.sessionDir);
    return res.json({ status: "connected", sessionID: sid });
  }
  res.json({ status: "waiting" });
});

app.listen(PORT, () => {
  console.log(`[JamberTech Pair] Server running on port ${PORT}`);
});
