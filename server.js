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
const POWERUP_SPAWN_INTERVAL = 1000; // 1 second (was 5 seconds)
const MAX_POWERUPS = 50; // Much more items on field (was 10)

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
    
    // New stats
    this.damage = 20;
    this.shield = 0; // Absorbs damage before health
    this.armor = 0; // Reduces damage taken
    this.xp = 0;
    this.multishot = 1; // Number of bullets per shot
    this.invincible = 0; // Frames of invincibility
    this.megaDamage = 0; // Frames of mega damage
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
    
    // Decay temporary effects
    if (this.invincible > 0) this.invincible--;
    if (this.megaDamage > 0) this.megaDamage--;
  }

  takeDamage(damage, killerId) {
    if (!this.alive || this.invincible > 0) return false;
    
    // Apply armor reduction
    const reducedDamage = Math.max(1, damage - this.armor);
    
    // Shield absorbs first
    if (this.shield > 0) {
      this.shield -= reducedDamage;
      if (this.shield < 0) {
        this.health += this.shield; // Overflow to health
        this.shield = 0;
      }
    } else {
      this.health -= reducedDamage;
    }
    
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
    this.shield = 0;
    this.invincible = 180; // 3 seconds spawn protection
  }

  powerUp() {
    this.powerLevel++;
    this.maxHealth += 10;
    this.health = this.maxHealth;
    this.speed = Math.min(8, 5 + this.powerLevel * 0.2);
    this.fireRate = Math.max(100, 200 - this.powerLevel * 5);
    this.damage = Math.min(50, 20 + this.powerLevel * 2);
  }
  
  applyPowerup(type, value) {
    switch(type) {
      case 'health_small':
      case 'health_medium':
      case 'health_large':
        this.health = Math.min(this.maxHealth, this.health + value);
        break;
      case 'energy':
        this.xp += value;
        if (this.xp >= 100) {
          this.xp -= 100;
          this.powerUp();
        }
        break;
      case 'shield':
        this.shield += value;
        break;
      case 'speed':
        this.speed += value;
        break;
      case 'firerate':
        this.fireRate = Math.max(50, this.fireRate - value);
        break;
      case 'damage':
        this.damage += value;
        break;
      case 'multishot':
        this.multishot = Math.min(5, this.multishot + 1);
        break;
      case 'maxhealth':
        this.maxHealth += value;
        this.health += value;
        break;
      case 'triple_shot':
        this.multishot = Math.max(this.multishot, 3);
        break;
      case 'rapid_fire':
        this.fireRate = Math.max(50, this.fireRate * 0.5);
        break;
      case 'armor':
        this.armor += value;
        break;
      case 'invincibility':
        this.invincible = value; // frames
        break;
      case 'mega_damage':
        this.megaDamage = 600; // 10 seconds
        this.damage *= 3;
        break;
      case 'nuke':
        // Handled in game loop
        break;
    }
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
      alive: this.alive,
      shield: this.shield,
      armor: this.armor,
      xp: this.xp,
      multishot: this.multishot,
      invincible: this.invincible,
      megaDamage: this.megaDamage
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
    this.type = type;
    this.value = this.getValueForType(type);
  }

  getValueForType(type) {
    const values = {
      // Common (60% chance)
      'health_small': 20,
      'health_medium': 40,
      'energy': 1,
      'shield': 25,
      'xp': 50,
      
      // Uncommon (30% chance)
      'health_large': 75,
      'speed': 0.3,
      'firerate': 10,
      'damage': 5,
      'multishot': 1,
      
      // Rare (8% chance)
      'maxhealth': 20,
      'triple_shot': 1,
      'rapid_fire': 1,
      'armor': 15,
      
      // Epic (2% chance)
      'invincibility': 300,
      'mega_damage': 1,
      'nuke': 1
    };
    return values[type] || 1;
  }

  serialize() {
    return {
      id: this.id,
      x: this.x,
      y: this.y,
      type: this.type,
      value: this.value
    };
  }
}

// Spawn powerup with rarity system
function spawnPowerup() {
  const rand = Math.random();
  let type;
  
  // Rarity tiers
  if (rand < 0.60) {
    // Common (60%)
    const common = ['health_small', 'health_medium', 'energy', 'shield', 'xp'];
    type = common[Math.floor(Math.random() * common.length)];
  } else if (rand < 0.90) {
    // Uncommon (30%)
    const uncommon = ['health_large', 'speed', 'firerate', 'damage', 'multishot'];
    type = uncommon[Math.floor(Math.random() * uncommon.length)];
  } else if (rand < 0.98) {
    // Rare (8%)
    const rare = ['maxhealth', 'triple_shot', 'rapid_fire', 'armor'];
    type = rare[Math.floor(Math.random() * rare.length)];
  } else {
    // Epic (2%)
    const epic = ['invincibility', 'mega_damage', 'nuke'];
    type = epic[Math.floor(Math.random() * epic.length)];
  }
  
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
        player.applyPowerup(powerup.type, powerup.value);
        
        // Special: Nuke kills all nearby players
        if (powerup.type === 'nuke') {
          players.forEach(otherPlayer => {
            if (otherPlayer.id === player.id || !otherPlayer.alive) return;
            const ndx = player.x - otherPlayer.x;
            const ndy = player.y - otherPlayer.y;
            const ndist = Math.sqrt(ndx*ndx + ndy*ndy);
            if (ndist < 500) { // Nuke radius
              otherPlayer.takeDamage(999, player.id);
              player.score += 100;
              player.kills++;
              player.powerUp();
            }
          });
        }
        
        powerups.delete(id);
        
        io.to(player.id).emit('powerup_collected', {
          type: powerup.type,
          value: powerup.value
        });
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
  if (powerups.size < MAX_POWERUPS) {
    // Spawn 2-4 powerups at once for abundance
    const spawnCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < spawnCount && powerups.size < MAX_POWERUPS; i++) {
      spawnPowerup();
    }
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

    // Create bullets based on multishot
    const speed = 20;
    const angle = data.angle;
    const damage = player.megaDamage > 0 ? player.damage * 3 : player.damage;
    
    if (player.multishot === 1) {
      // Single shot
      const bullet = new Bullet(
        bulletIdCounter++,
        socket.id,
        player.x,
        player.y,
        Math.cos(angle) * speed,
        Math.sin(angle) * speed
      );
      bullet.damage = damage;
      bullets.set(bullet.id, bullet);
    } else {
      // Multishot spread
      const spreadAngle = 0.15; // radians between bullets
      const startAngle = angle - (spreadAngle * (player.multishot - 1) / 2);
      
      for (let i = 0; i < player.multishot; i++) {
        const bulletAngle = startAngle + (spreadAngle * i);
        const bullet = new Bullet(
          bulletIdCounter++,
          socket.id,
          player.x,
          player.y,
          Math.cos(bulletAngle) * speed,
          Math.sin(bulletAngle) * speed
        );
        bullet.damage = damage;
        bullets.set(bullet.id, bullet);
      }
    }
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
