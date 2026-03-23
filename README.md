# 🎮 NEON DISTRICT SHOOTER - MULTIPLAYER

## .IO-STYLE MULTIPLAYER SPACE SHOOTER

Live multiplayer battle arena where players compete in real-time!

---

## 📁 FILE STRUCTURE

Your game has 4 files:

```
neon-multiplayer/
├── server.js              # Backend server (Node.js)
├── package.json           # Server dependencies
├── public/
│   └── index.html        # Client game (or use multiplayer-client.html)
└── DEPLOYMENT_GUIDE.md   # Full deployment instructions
```

---

## ⚡ QUICK START (3 STEPS)

### 1. Download All Files
Create a folder with these files:
- `server.js`
- `package.json`
- `multiplayer-client.html` (rename to `index.html` and put in `public/` folder)

### 2. Install & Run
```bash
# Open terminal in your game folder
npm install
npm start
```

### 3. Play!
Open browser: **http://localhost:3000**

Open multiple tabs/browsers to test multiplayer! 🎉

---

## 🎮 HOW TO PLAY

**Controls:**
- **WASD / Arrow Keys** - Move your ship
- **Mouse** - Aim
- **Mouse Click (hold)** - Shoot

**Goal:**
- Destroy other players
- Collect powerups (health, speed, damage)
- Climb the leaderboard
- Power up with each kill!

**Mechanics:**
- Kill players → Gain score (+100)
- Each kill → Power level increases
- Higher power → Bigger ship, faster fire, more health
- Die → Lose power level → Respawn at level 1

---

## 🌐 DEPLOY TO INTERNET

See **DEPLOYMENT_GUIDE.md** for full instructions.

**Recommended: Railway.app** (Free, 1-click deploy)

1. Push files to GitHub
2. Connect GitHub to Railway
3. Deploy!
4. Get URL: `https://your-game.railway.app`
5. Share with friends!

---

## 🎨 GAME FEATURES

✅ Real-time multiplayer (WebSocket)
✅ Authoritative server (anti-cheat)
✅ Live leaderboard (top 10)
✅ Kill feed notifications
✅ Power progression system
✅ Three powerup types
✅ Smooth camera following
✅ Responsive controls
✅ Death/respawn system
✅ Cyberpunk neon aesthetic

---

## 💠 EMBED IN WORDPRESS

After deploying, add this to a Custom HTML block:

```html
<iframe 
  src="https://your-game-url.railway.app" 
  width="100%" 
  height="800px"
  style="border: none;"
  allow="autoplay">
</iframe>
```

---

## 🔧 TECH STACK

**Server:** Node.js + Express + Socket.io
**Client:** HTML5 Canvas + JavaScript
**Architecture:** Authoritative server (all game logic server-side)
**Style:** .io game (agar.io style arena)

---

## 📊 CURRENT SETTINGS

- **World Size:** 10,000 x 10,000 units
- **Max Players:** Unlimited (scales with server)
- **Tick Rate:** 60 updates/second
- **Starting Health:** 100 HP
- **Bullet Damage:** 20 HP
- **Powerup Spawn:** Every 5 seconds

---

## 🎯 NEXT STEPS

1. **Test locally** - Run and play with multiple browsers
2. **Deploy** - Use Railway.app (free)
3. **Share** - Get friends to play!
4. **Customize** - Edit colors, speeds, damage in code

---

## 🚀 YOU'RE READY!

This is a complete, working multiplayer game!

**Local test:** `npm start` → `http://localhost:3000`
**Deploy:** Push to GitHub → Railway.app → Share URL

**Have fun!** 🎮✨
