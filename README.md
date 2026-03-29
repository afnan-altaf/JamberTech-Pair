# JamberTech Pair — WhatsApp Session ID Generator

Official pairing server for **JamberTech-WA** WhatsApp bot.

## Features
- 🔐 Generate WhatsApp Session ID (DJ~ format)
- ⚡ Short pair code (8-digit)
- 🎨 JamberTech branded UI
- 🚀 Deploy on Railway / Render / Koyeb

## Deploy on Railway
1. Fork this repo
2. New project → Deploy from GitHub → select this repo
3. Add env: `PORT=3000` (optional, Railway sets it automatically)
4. Done! Visit your URL to get Session ID

## Deploy on Render
1. New Web Service → Connect this repo
2. Build Command: `npm install`
3. Start Command: `node server.js`
4. Done!

## How it works
1. Enter your WhatsApp number
2. Get 8-digit pair code
3. Link in WhatsApp → Linked Devices → Link with phone number
4. Copy your SESSION_ID and use in JamberTech-WA

---
© 2026 JamberTech Official
