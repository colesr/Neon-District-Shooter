// NEON DISTRICT SHOOTER - MULTIPLAYER SERVER
// Node.js + Socket.io backend for .io-style gameplay

const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIo(server, {
  cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }
});

// Serve static files
app.use(express.static('public'));

// Game state
const players = new Map();
const bullets = new Map();
const powerups = new Map();
let bulletIdCounter = 0;
let powerupIdCounter = 0;

// Config
const WORLD_SIZE = 10000; // Large battlefield
const TICK_RATE = 60;
const POWERUP_SPAWN_INTERVAL = 5000; // 5 seconds

// Player class
class Player {
  constructor(id, name) {
    this.id = id;
    this.name = name;
    this.x = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.y = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.score = 0;
    this.kills = 0;
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 5;
    this.fireRate = 200; // ms between shots
    this.lastShot = 0;
    this.powerLevel = 1; // Grows with kills
    this.alive = true;
  }

  update(dt) {
    if (!this.alive) return;
    
    // Apply velocity
    this.x += this.vx * dt * this.speed;
    this.y += this.vy * dt * this.speed;
    
    // Keep in bounds
    const margin = WORLD_SIZE / 2;
    this.x = Math.max(-margin, Math.min(margin, this.x));
    this.y = Math.max(-margin, Math.min(margin, this.y));
  }

  takeDamage(damage, killerId) {
    if (!this.alive) return false;
    
    this.health -= damage;
    if (this.health <= 0) {
      this.alive = false;
      return killerId; // Return killer ID
    }
    return null;
  }

  respawn() {
    this.x = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.y = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.health = this.maxHealth;
    this.alive = true;
    this.vx = 0;
    this.vy = 0;
  }

  powerUp() {
    this.powerLevel++;
    this.maxHealth += 10;
    this.health = this.maxHealth;
    this.speed = Math.min(8, 5 + this.powerLevel * 0.2);
    this.fireRate = Math.max(100, 200 - this.powerLevel * 5);
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      angle: this.angle,
      score: this.score,
      kills: this.kills,
      health: this.health,
      maxHealth: this.maxHealth,
      powerLevel: this.powerLevel,
      alive: this.alive
    };
  }
}

// Bullet class
class Bullet {
  constructor(id, playerId, x, y, vx, vy) {
    this.id = id;
    this.playerId = playerId;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.lifetime = 3000; // 3 seconds
    this.damage = 20;
    this.createdAt = Date.now();
  }

  update(dt) {
    this.x += this.vx * dt;
    this.y += this.vy * dt;
    
    // Check if expired
    return Date.now() - this.createdAt < this.lifetime;
  }

  serialize() {
    return {
      id: this.id,
      playerId: this.playerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy
    };
  }
}

// Powerup class
class Powerup {
  constructor(id, x, y, type) {
    this.id = id;
    this.x = x;
    this.y = y;
    this.type = type; // 'health', 'speed', 'damage'
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      type: this.type
    };
  }
}

// Spawn powerup
function spawnPowerup() {
  const types = ['health', 'speed', 'damage'];
  const type = types[Math.floor(Math.random() * types.length)];
  const x = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
  const y = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
  const powerup = new Powerup(powerupIdCounter++, x, y, type);
  powerups.set(powerup.id, powerup);
}

// Game loop
let lastUpdate = Date.now();
setInterval(() => {
  const now = Date.now();
  const dt = (now - lastUpdate) / 16.67; // Delta in frames (60fps)
  lastUpdate = now;

  // Update all players
  players.forEach(player => player.update(dt));

  // Update all bullets
  bullets.forEach((bullet, id) => {
    const alive = bullet.update(dt);
    if (!alive) {
      bullets.delete(id);
      return;
    }

    // Check bullet collision with players
    players.forEach(player => {
      if (!player.alive || player.id === bullet.playerId) return;
      
      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 30) { // Hit radius
        const killerId = player.takeDamage(bullet.damage, bullet.playerId);
        bullets.delete(id);
        
        if (killerId) {
          // Player was killed
          const killer = players.get(killerId);
          if (killer) {
            killer.score += 100;
            killer.kills++;
            killer.powerUp();
            
            io.emit('player_killed', {
              killedId: player.id,
              killerId: killerId,
              killerName: killer.name
            });
          }
        }
      }
    });
  });

  // Check powerup collection
  powerups.forEach((powerup, id) => {
    players.forEach(player => {
      if (!player.alive) return;
      
      const dx = powerup.x - player.x;
      const dy = powerup.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      
      if (dist < 40) {
        // Collect powerup
        if (powerup.type === 'health') {
          player.health = Math.min(player.maxHealth, player.health + 30);
        } else if (powerup.type === 'speed') {
          player.speed += 0.5;
        }
        powerups.delete(id);
        
        io.to(player.id).emit('powerup_collected', powerup.type);
      }
    });
  });

  // Broadcast game state to all clients
  io.emit('game_state', {
    players: Array.from(players.values()).map(p => p.serialize()),
    bullets: Array.from(bullets.values()).map(b => b.serialize()),
    powerups: Array.from(powerups.values()).map(p => p.serialize())
  });

}, 1000 / TICK_RATE);

// Spawn powerups periodically
setInterval(() => {
  if (powerups.size < 10) {
    spawnPowerup();
  }
}, POWERUP_SPAWN_INTERVAL);

// Socket.io events
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (data) => {
    const player = new Player(socket.id, data.name || 'Anonymous');
    players.set(socket.id, player);
    
    console.log(`${player.name} joined the game`);
    
    // Send initial game state to new player
    socket.emit('init', {
      playerId: socket.id,
      worldSize: WORLD_SIZE,
      player: player.serialize()
    });

    // Notify all players
    io.emit('player_joined', {
      id: player.id,
      name: player.name
    });
  });

  socket.on('input', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    // Update player velocity
    player.vx = data.vx || 0;
    player.vy = data.vy || 0;
    player.angle = data.angle || 0;
  });

  socket.on('shoot', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    const now = Date.now();
    if (now - player.lastShot < player.fireRate) return;
    
    player.lastShot = now;

    // Create bullet
    const speed = 20;
    const angle = data.angle;
    const bullet = new Bullet(
      bulletIdCounter++,
      socket.id,
      player.x,
      player.y,
      Math.cos(angle) * speed,
      Math.sin(angle) * speed
    );
    
    bullets.set(bullet.id, bullet);
  });

  socket.on('respawn', () => {
    const player = players.get(socket.id);
    if (player) {
      player.respawn();
      socket.emit('respawned', player.serialize());
    }
  });

  socket.on('disconnect', () => {
    const player = players.get(socket.id);
    if (player) {
      console.log(`${player.name} left the game`);
      players.delete(socket.id);
      io.emit('player_left', socket.id);
    }
  });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`🎮 NEON DISTRICT SHOOTER Server running on port ${PORT}`);
  console.log(`Players: ${players.size}`);
});
