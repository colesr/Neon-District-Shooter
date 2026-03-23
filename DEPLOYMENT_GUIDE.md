# 🎮 NEON DISTRICT SHOOTER - MULTIPLAYER DEPLOYMENT GUIDE

## 📦 What You Have

**3 Files:**
1. `server.js` - Node.js WebSocket server (authoritative game state)
2. `package.json` - Server dependencies
3. `public/index.html` - Multiplayer client (browser game)

## 🚀 Quick Start (Local Testing)

### Step 1: Install Node.js
- Download from https://nodejs.org/ (v14 or higher)
- Verify: `node --version`

### Step 2: Install Dependencies
```bash
cd /path/to/your/game/folder
npm install
```

### Step 3: Start Server
```bash
npm start
```

### Step 4: Play
- Open browser: `http://localhost:3000`
- Open multiple tabs/browsers to test multiplayer
- Enter callsign and click "JOIN BATTLE"

## 🌐 Deploy to Production (Free Options)

### Option A: Railway.app (RECOMMENDED - Easiest)

**Steps:**
1. Create account at https://railway.app
2. Click "New Project" → "Deploy from GitHub repo"
3. Push your game files to GitHub
4. Railway auto-detects Node.js and deploys
5. Get your URL: `https://your-game.railway.app`

**No configuration needed!** Railway reads `package.json` automatically.

### Option B: Render.com

**Steps:**
1. Create account at https://render.com
2. Click "New +" → "Web Service"
3. Connect GitHub repo
4. Settings:
   - Build Command: `npm install`
   - Start Command: `npm start`
5. Deploy!

### Option C: Heroku

**Steps:**
1. Install Heroku CLI: https://devcenter.heroku.com/articles/heroku-cli
2. Create account and login: `heroku login`
3. In your game folder:
```bash
git init
heroku create your-game-name
git add .
git commit -m "Initial commit"
git push heroku main
```

## 🔧 Configuration

### Change Server URL (for production)

In `public/index.html`, find this code:
```javascript
const serverUrl = window.location.hostname === 'localhost' 
  ? 'http://localhost:3000' 
  : window.location.origin;
```

It automatically uses production URL when deployed!

### Custom Domain

After deploying to Railway/Render/Heroku, you can add your custom domain:
- Railway: Project Settings → Domains
- Render: Settings → Custom Domain
- Heroku: Settings → Domains

## 🎯 Embed in WordPress

### Option 1: Direct Embed
```html
<iframe 
  src="https://your-game.railway.app" 
  width="100%" 
  height="800px"
  style="border: none;"
  allow="autoplay">
</iframe>
```

### Option 2: Custom HTML Block
1. Add "Custom HTML" block in WordPress
2. Paste the iframe code above
3. Adjust width/height as needed

## 🎮 How It Works

### Server (Authoritative)
- Runs at 60 ticks/second
- All game logic happens here (prevents cheating)
- Validates hits, calculates damage, spawns powerups
- Broadcasts game state to all clients

### Client (Thin)
- Sends input (WASD + mouse aim)
- Receives game state
- Renders everything
- Camera follows your player

### Flow
```
Player → Input → Server → Validation → Game State → All Players
```

## 📊 Game Mechanics

### Combat
- Hold mouse to shoot
- Aim with mouse
- Move with WASD
- 20 damage per hit
- 100 starting health

### Progression
- Kill players to gain score (+100 per kill)
- Each kill increases your power level
- Higher power = faster ship, faster fire rate, more health

### Powerups
- 🔴 Health - Restore 30 HP
- 💠 Speed - Permanent speed boost
- 💥 Damage - Increase bullet damage

### World
- 10,000 x 10,000 unit battlefield
- Respawn at random location
- Powerups spawn every 5 seconds

## 🔍 Troubleshooting

### "Cannot connect to server"
- Check server is running: `npm start`
- Check firewall allows port 3000
- In production, check deployment logs

### "Players lag/rubber-banding"
- Server tick rate is 60fps
- Check your internet connection
- Server location matters (deploy near players)

### "Game feels delayed"
- This is authoritative server (prevents cheating)
- Consider adding client-side prediction (advanced)

## 🛠 Customization Ideas

### Easy Changes
- Fire rate: Edit `fireRate` in `server.js` Player class
- World size: Change `WORLD_SIZE` constant
- Player speed: Adjust `speed` property
- Health: Modify `maxHealth`

### Advanced Features
- Add more powerup types
- Create teams/clans
- Add special abilities
- Implement zones/territories
- Add NPCs/enemies

## 📈 Scaling

### Small (1-50 players)
- Free tier Railway/Render works fine

### Medium (50-200 players)
- Upgrade to paid tier ($5-10/month)
- Add Redis for session storage

### Large (200+ players)
- Multiple server instances
- Load balancer
- Consider dedicated hosting

## 🎨 Customization

### Colors
Edit CSS variables in `public/index.html`:
- `#00ffcc` - Cyan (friendly)
- `#ff2d78` - Pink (enemy)
- `#04010a` - Background

### Fonts
Currently using "Orbitron" - change in `<style>` section

### UI
All UI is in the HTML - easy to modify!

## 🚨 Important Notes

1. **Don't expose port directly** - Use the provided server setup
2. **CORS is enabled** - Required for iframe embedding
3. **No authentication yet** - Add if needed for persistent accounts
4. **Single server instance** - All players connect to same server

## 📞 Support

Check server logs:
```bash
npm start
# Watch console for connections and errors
```

Browser console:
- F12 → Console tab
- Look for connection status messages

## 🎉 You're Done!

Deploy and share your multiplayer game URL!
Players can join from anywhere in the world!

---

**Built with:** Node.js + Express + Socket.io + HTML5 Canvas
**Architecture:** Authoritative server (anti-cheat)
**Style:** .io game (agar.io, slither.io style)
