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
const POWERUP_SPAWN_INTERVAL = 1000; // 1 second
const MAX_POWERUPS = 50;

// ============ WEAPON DEFINITIONS ============
const WEAPONS = {
  default: { name: 'Blaster', speed: 20, damageMult: 1.0, fireRateMult: 1.0, bullets: 1, spread: 0, lifetime: 3000, ammo: Infinity },
  shotgun: { name: 'Shotgun', speed: 15, damageMult: 0.6, fireRateMult: 1.8, bullets: 6, spread: 0.5, lifetime: 1500, ammo: 30 },
  sniper: { name: 'Sniper', speed: 35, damageMult: 3.0, fireRateMult: 3.0, bullets: 1, spread: 0, lifetime: 5000, ammo: 15 },
  laser: { name: 'Laser', speed: 40, damageMult: 0.4, fireRateMult: 0.25, bullets: 1, spread: 0, lifetime: 1500, ammo: 60 },
  homing: { name: 'Homing', speed: 10, damageMult: 1.5, fireRateMult: 2.5, bullets: 1, spread: 0, lifetime: 4000, ammo: 12 }
};

// ============ ABILITY DEFINITIONS ============
const ABILITIES = {
  dash: { name: 'Dash', cooldown: 900, duration: 0, description: 'Teleport forward 250 units' },
  emp: { name: 'EMP Blast', cooldown: 1200, duration: 180, radius: 350, description: 'Slow nearby enemies for 3s' },
  cloak: { name: 'Cloak', cooldown: 1500, duration: 300, description: 'Turn invisible for 5s' }
};

// ============ SKIN DEFINITIONS ============
const SKINS = {
  default: { name: 'Standard', color: null, kills: 0 },
  crimson: { name: 'Crimson', color: '#ff2244', kills: 0 },
  azure: { name: 'Azure', color: '#2288ff', kills: 0 },
  gold: { name: 'Gold', color: '#ffaa00', kills: 10 },
  purple: { name: 'Purple Haze', color: '#aa00ff', kills: 25 },
  toxic: { name: 'Toxic', color: '#00ff44', kills: 50 },
  ice: { name: 'Ice', color: '#00ccff', kills: 100 },
  inferno: { name: 'Inferno', color: '#ff4400', kills: 200 },
  void: { name: 'Void', color: '#8800ff', kills: 500 }
};

// ============ AI CONFIG ============
const AI_COUNT = 8; // Number of AI bots in the world
const AI_NAMES = ['CIPHER', 'GHOST', 'VIPER', 'PHANTOM', 'REAPER', 'NOVA', 'STATIC', 'GLITCH',
  'HAVOC', 'BLITZ', 'WRAITH', 'DAEMON', 'SURGE', 'ECHO', 'ZERO', 'FLUX'];
const AI_SKINS = ['crimson', 'azure', 'gold', 'purple', 'toxic', 'inferno'];
let aiIdCounter = 0;

// AI Enemy class
class AIEnemy {
  constructor() {
    this.id = 'ai_' + aiIdCounter++;
    this.name = AI_NAMES[Math.floor(Math.random() * AI_NAMES.length)];
    this.x = Math.random() * WORLD_SIZE - WORLD_SIZE / 2;
    this.y = Math.random() * WORLD_SIZE - WORLD_SIZE / 2;
    this.vx = 0;
    this.vy = 0;
    this.angle = Math.random() * Math.PI * 2;
    this.health = 60;
    this.maxHealth = 60;
    this.speed = 3;
    this.damage = 10;
    this.alive = true;
    this.skin = AI_SKINS[Math.floor(Math.random() * AI_SKINS.length)];
    this.isAI = true;

    // AI behavior
    this.targetAngle = this.angle;
    this.changeTimer = 0;
    this.shootTimer = 0;
    this.state = 'roam'; // roam, chase, flee
    this.targetId = null;
    this.empSlowed = 0;
  }

  update(dt) {
    if (!this.alive) return;

    this.changeTimer--;
    this.shootTimer--;
    if (this.empSlowed > 0) this.empSlowed--;

    // Find nearest player
    let nearestPlayer = null;
    let nearestDist = Infinity;
    players.forEach(p => {
      if (!p.alive || p.cloaked) return;
      const dx = p.x - this.x;
      const dy = p.y - this.y;
      const dist = Math.sqrt(dx * dx + dy * dy);
      if (dist < nearestDist) {
        nearestDist = dist;
        nearestPlayer = p;
      }
    });

    // State transitions
    if (nearestPlayer && nearestDist < 600) {
      if (this.health < 20) {
        this.state = 'flee';
        this.targetAngle = Math.atan2(this.y - nearestPlayer.y, this.x - nearestPlayer.x);
      } else {
        this.state = 'chase';
        this.targetAngle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x);
        this.targetId = nearestPlayer.id;
      }
    } else {
      this.state = 'roam';
    }

    // Roaming: pick random direction periodically
    if (this.state === 'roam' && this.changeTimer <= 0) {
      this.targetAngle = Math.random() * Math.PI * 2;
      this.changeTimer = Math.floor(Math.random() * 180) + 60; // 1-4 seconds
    }

    // Smooth angle turning
    let angleDiff = this.targetAngle - this.angle;
    while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
    while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
    this.angle += angleDiff * 0.05;

    // Move
    const empMult = this.empSlowed > 0 ? 0.3 : 1.0;
    const moveSpeed = (this.state === 'flee' ? this.speed * 1.3 : this.speed) * empMult;
    this.vx = Math.cos(this.angle) * moveSpeed;
    this.vy = Math.sin(this.angle) * moveSpeed;
    this.x += this.vx * dt;
    this.y += this.vy * dt;

    // Keep in bounds
    const margin = WORLD_SIZE / 2;
    if (this.x < -margin || this.x > margin || this.y < -margin || this.y > margin) {
      this.x = Math.max(-margin, Math.min(margin, this.x));
      this.y = Math.max(-margin, Math.min(margin, this.y));
      this.targetAngle = Math.atan2(-this.y, -this.x); // Turn toward center
    }

    // Shoot at nearby players
    if (this.state === 'chase' && nearestPlayer && nearestDist < 500 && this.shootTimer <= 0) {
      this.shootTimer = 30; // ~0.5 second between shots
      const shootAngle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x);
      const bullet = new Bullet(bulletIdCounter++, this.id, this.x, this.y,
        Math.cos(shootAngle) * 18, Math.sin(shootAngle) * 18, 'default');
      bullet.damage = this.damage;
      bullets.set(bullet.id, bullet);
    }
  }

  takeDamage(damage, killerId) {
    if (!this.alive) return null;
    this.health -= damage;
    if (this.health <= 0) {
      this.alive = false;
      return killerId;
    }
    return null;
  }

  serialize() {
    return {
      id: this.id,
      name: this.name,
      x: this.x,
      y: this.y,
      angle: this.angle,
      health: this.health,
      maxHealth: this.maxHealth,
      alive: this.alive,
      skin: this.skin,
      isAI: true,
      score: 0, kills: 0, totalKills: 0, powerLevel: 1,
      shield: 0, armor: 0, xp: 0, multishot: 1,
      invincible: 0, megaDamage: 0, gang: [],
      weapon: 'default', weaponAmmo: -1, weaponInventory: [], weaponIndex: 0,
      ability: 'dash', abilityCooldown: 0, abilityActive: 0,
      cloaked: false, empSlowed: 0
    };
  }
}

// AI enemies collection
const aiEnemies = new Map();

function spawnAIEnemy() {
  const ai = new AIEnemy();
  aiEnemies.set(ai.id, ai);
}

// Spawn initial AI enemies
for (let i = 0; i < AI_COUNT; i++) {
  spawnAIEnemy();
}

// Respawn dead AI after a delay
function respawnDeadAI() {
  if (aiEnemies.size < AI_COUNT) {
    const needed = AI_COUNT - aiEnemies.size;
    for (let i = 0; i < needed; i++) {
      spawnAIEnemy();
    }
  }
}

// Drop a powerup where an AI died
function dropAILoot(x, y) {
  const lootTypes = ['health_medium', 'energy', 'shield', 'speed', 'firerate', 'damage',
    'weapon_shotgun', 'weapon_sniper', 'weapon_laser', 'weapon_homing'];
  const type = lootTypes[Math.floor(Math.random() * lootTypes.length)];
  const powerup = new Powerup(powerupIdCounter++, x, y, type);
  powerups.set(powerup.id, powerup);
}

// Player class
class Player {
  constructor(id, name, skin, ability) {
    this.id = id;
    this.name = name;
    this.x = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.y = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.vx = 0;
    this.vy = 0;
    this.angle = 0;
    this.score = 0;
    this.kills = 0;
    this.totalKills = 0; // Persistent across respawns for skin unlocks
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 5;
    this.fireRate = 200; // ms between shots
    this.lastShot = 0;
    this.powerLevel = 1; // Grows with kills
    this.alive = true;

    // Stats
    this.damage = 20;
    this.shield = 0;
    this.armor = 0;
    this.xp = 0;
    this.multishot = 1;
    this.invincible = 0;
    this.megaDamage = 0;

    // GANG SYSTEM
    this.gang = [];
    this.gangTrail = [];

    // SKIN SYSTEM
    this.skin = (skin && SKINS[skin]) ? skin : 'default';

    // WEAPON SYSTEM - inventory of collected weapons
    this.weapon = 'default';
    this.weaponAmmo = Infinity;
    this.weaponInventory = [{ type: 'default', ammo: Infinity }]; // Always have blaster
    this.weaponIndex = 0;

    // ABILITY SYSTEM
    this.ability = (ability && ABILITIES[ability]) ? ability : 'dash';
    this.abilityCooldown = 0; // Remaining cooldown frames
    this.abilityActive = 0; // Remaining active frames
    this.cloaked = false;
    this.empSlowed = 0; // Frames of being EMP slowed
  }

  update(dt) {
    if (!this.alive) return;

    // EMP slow effect
    const speedMult = this.empSlowed > 0 ? 0.3 : 1.0;

    // Apply velocity
    this.x += this.vx * dt * this.speed * speedMult;
    this.y += this.vy * dt * this.speed * speedMult;

    // Keep in bounds
    const margin = WORLD_SIZE / 2;
    this.x = Math.max(-margin, Math.min(margin, this.x));
    this.y = Math.max(-margin, Math.min(margin, this.y));

    // Update gang trail
    this.gangTrail.push({ x: this.x, y: this.y, angle: this.angle });
    const maxTrailLength = this.gang.length * 3 + 50;
    if (this.gangTrail.length > maxTrailLength) {
      this.gangTrail.shift();
    }

    // Update gang member positions
    const spacing = 40;
    this.gang.forEach((member, i) => {
      const targetIndex = Math.floor((i + 1) * spacing / 2);
      if (targetIndex < this.gangTrail.length) {
        const target = this.gangTrail[this.gangTrail.length - 1 - targetIndex];
        member.x = target.x;
        member.y = target.y;
        member.angle = target.angle;
      }
    });

    // Decay temporary effects
    if (this.invincible > 0) this.invincible--;
    if (this.megaDamage > 0) this.megaDamage--;
    if (this.empSlowed > 0) this.empSlowed--;

    // Ability cooldown
    if (this.abilityCooldown > 0) this.abilityCooldown--;

    // Ability active duration
    if (this.abilityActive > 0) {
      this.abilityActive--;
      if (this.abilityActive <= 0) {
        // Ability ended
        if (this.ability === 'cloak') {
          this.cloaked = false;
        }
      }
    }
  }

  addGangMember() {
    this.gang.push({
      x: this.x,
      y: this.y,
      angle: this.angle,
      lastShot: 0
    });
  }

  takeDamage(damage, killerId) {
    if (!this.alive || this.invincible > 0) return false;

    // Apply armor reduction
    const reducedDamage = Math.max(1, damage - this.armor);

    // Shield absorbs first
    if (this.shield > 0) {
      this.shield -= reducedDamage;
      if (this.shield < 0) {
        this.health += this.shield;
        this.shield = 0;
      }
    } else {
      this.health -= reducedDamage;
    }

    // Getting hit breaks cloak
    if (this.cloaked) {
      this.cloaked = false;
      this.abilityActive = 0;
    }

    if (this.health <= 0) {
      this.alive = false;
      return killerId;
    }
    return null;
  }

  respawn() {
    this.x = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.y = Math.random() * WORLD_SIZE - WORLD_SIZE/2;
    this.alive = true;
    this.vx = 0;
    this.vy = 0;
    // Reset all combat stats to base
    this.health = 100;
    this.maxHealth = 100;
    this.speed = 5;
    this.fireRate = 200;
    this.damage = 20;
    this.powerLevel = 1;
    this.shield = 0;
    this.armor = 0;
    this.multishot = 1;
    this.xp = 0;
    this.invincible = 180;
    this.megaDamage = 0;
    this.gang = [];
    this.gangTrail = [];
    this.weapon = 'default';
    this.weaponAmmo = Infinity;
    this.weaponInventory = [{ type: 'default', ammo: Infinity }];
    this.weaponIndex = 0;
    this.cloaked = false;
    this.abilityActive = 0;
    this.empSlowed = 0;
  }

  powerUp() {
    this.powerLevel++;
    this.maxHealth += 10;
    this.health = this.maxHealth;
    this.speed = Math.min(8, 5 + this.powerLevel * 0.2);
    this.fireRate = Math.max(100, 200 - this.powerLevel * 5);
    this.damage = Math.min(50, 20 + this.powerLevel * 2);
  }

  equipWeapon(weaponType) {
    if (!WEAPONS[weaponType]) return;
    // Check if we already have this weapon — refill ammo
    const existing = this.weaponInventory.find(w => w.type === weaponType);
    if (existing) {
      existing.ammo = WEAPONS[weaponType].ammo;
    } else {
      this.weaponInventory.push({ type: weaponType, ammo: WEAPONS[weaponType].ammo });
    }
    // Switch to the new weapon
    const idx = this.weaponInventory.findIndex(w => w.type === weaponType);
    this.weaponIndex = idx >= 0 ? idx : 0;
    this.weapon = weaponType;
    this.weaponAmmo = WEAPONS[weaponType].ammo;
  }

  switchWeapon(direction) {
    if (this.weaponInventory.length <= 1) return;
    this.weaponIndex = (this.weaponIndex + direction + this.weaponInventory.length) % this.weaponInventory.length;
    const slot = this.weaponInventory[this.weaponIndex];
    this.weapon = slot.type;
    this.weaponAmmo = slot.ammo;
  }

  useAbility() {
    if (this.abilityCooldown > 0 || !this.alive) return null;

    const abilityDef = ABILITIES[this.ability];
    if (!abilityDef) return null;

    this.abilityCooldown = abilityDef.cooldown;

    switch (this.ability) {
      case 'dash': {
        // Teleport forward 250 units
        const dashDist = 250;
        this.x += Math.cos(this.angle) * dashDist;
        this.y += Math.sin(this.angle) * dashDist;
        // Keep in bounds
        const margin = WORLD_SIZE / 2;
        this.x = Math.max(-margin, Math.min(margin, this.x));
        this.y = Math.max(-margin, Math.min(margin, this.y));
        // Brief invincibility during dash
        this.invincible = Math.max(this.invincible, 15);
        return { type: 'dash', x: this.x, y: this.y };
      }
      case 'emp': {
        this.abilityActive = abilityDef.duration;
        return { type: 'emp', x: this.x, y: this.y, radius: abilityDef.radius };
      }
      case 'cloak': {
        this.abilityActive = abilityDef.duration;
        this.cloaked = true;
        return { type: 'cloak' };
      }
    }
    return null;
  }

  applyPowerup(type, value) {
    switch(type) {
      case 'health_small':
      case 'health_medium':
      case 'health_large':
        this.health = Math.min(this.maxHealth, this.health + value);
        break;
      case 'energy':
      case 'xp':
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
        this.speed = Math.min(10, this.speed + value);
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
        this.invincible = value;
        break;
      case 'mega_damage':
        this.megaDamage = 600;
        // Damage boost applied dynamically in shoot handler, not permanently
        break;
      case 'nuke':
        // Handled in game loop
        break;
      // WEAPON PICKUPS
      case 'weapon_shotgun':
        this.equipWeapon('shotgun');
        break;
      case 'weapon_sniper':
        this.equipWeapon('sniper');
        break;
      case 'weapon_laser':
        this.equipWeapon('laser');
        break;
      case 'weapon_homing':
        this.equipWeapon('homing');
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
      totalKills: this.totalKills,
      health: this.health,
      maxHealth: this.maxHealth,
      powerLevel: this.powerLevel,
      alive: this.alive,
      shield: this.shield,
      armor: this.armor,
      xp: this.xp,
      multishot: this.multishot,
      invincible: this.invincible,
      megaDamage: this.megaDamage,
      gang: this.gang.map(m => ({ x: m.x, y: m.y, angle: m.angle })),
      // New fields
      skin: this.skin,
      weapon: this.weapon,
      weaponAmmo: this.weaponAmmo === Infinity ? -1 : this.weaponAmmo,
      weaponInventory: this.weaponInventory.map(w => ({ type: w.type, ammo: w.ammo === Infinity ? -1 : w.ammo })),
      weaponIndex: this.weaponIndex,
      ability: this.ability,
      abilityCooldown: this.abilityCooldown,
      abilityActive: this.abilityActive,
      cloaked: this.cloaked,
      empSlowed: this.empSlowed
    };
  }
}

// Bullet class
class Bullet {
  constructor(id, playerId, x, y, vx, vy, weapon) {
    this.id = id;
    this.playerId = playerId;
    this.x = x;
    this.y = y;
    this.vx = vx;
    this.vy = vy;
    this.weapon = weapon || 'default';
    this.lifetime = WEAPONS[this.weapon] ? WEAPONS[this.weapon].lifetime : 3000;
    this.damage = 20;
    this.createdAt = Date.now();
    this.homing = this.weapon === 'homing';
  }

  update(dt) {
    // Homing behavior: steer toward nearest enemy (players + AI)
    if (this.homing) {
      let nearestDist = Infinity;
      let nearestPlayer = null;
      const checkTarget = (p) => {
        if (!p.alive || p.id === this.playerId) return;
        if (p.cloaked) return;
        const dx = p.x - this.x;
        const dy = p.y - this.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < nearestDist && dist < 800) {
          nearestDist = dist;
          nearestPlayer = p;
        }
      };
      players.forEach(checkTarget);
      aiEnemies.forEach(checkTarget);

      if (nearestPlayer) {
        const targetAngle = Math.atan2(nearestPlayer.y - this.y, nearestPlayer.x - this.x);
        const currentAngle = Math.atan2(this.vy, this.vx);
        let angleDiff = targetAngle - currentAngle;
        // Normalize angle
        while (angleDiff > Math.PI) angleDiff -= Math.PI * 2;
        while (angleDiff < -Math.PI) angleDiff += Math.PI * 2;
        // Steer
        const turnRate = 0.06;
        const newAngle = currentAngle + Math.sign(angleDiff) * Math.min(Math.abs(angleDiff), turnRate);
        const speed = Math.sqrt(this.vx*this.vx + this.vy*this.vy);
        this.vx = Math.cos(newAngle) * speed;
        this.vy = Math.sin(newAngle) * speed;
      }
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;

    return Date.now() - this.createdAt < this.lifetime;
  }

  serialize() {
    return {
      id: this.id,
      playerId: this.playerId,
      x: this.x,
      y: this.y,
      vx: this.vx,
      vy: this.vy,
      weapon: this.weapon
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
      // Common (55% chance)
      'health_small': 20,
      'health_medium': 40,
      'energy': 50,
      'shield': 25,
      'xp': 50,

      // Uncommon (25% chance)
      'health_large': 75,
      'speed': 0.3,
      'firerate': 10,
      'damage': 5,
      'multishot': 1,

      // Rare (10% chance) - includes weapons
      'maxhealth': 20,
      'triple_shot': 1,
      'rapid_fire': 1,
      'armor': 15,
      'weapon_shotgun': 1,
      'weapon_sniper': 1,
      'weapon_laser': 1,
      'weapon_homing': 1,

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

  if (rand < 0.55) {
    // Common (55%)
    const common = ['health_small', 'health_medium', 'energy', 'shield', 'xp'];
    type = common[Math.floor(Math.random() * common.length)];
  } else if (rand < 0.80) {
    // Uncommon (25%)
    const uncommon = ['health_large', 'speed', 'firerate', 'damage', 'multishot'];
    type = uncommon[Math.floor(Math.random() * uncommon.length)];
  } else if (rand < 0.98) {
    // Rare (18%) - includes weapon drops
    const rare = ['maxhealth', 'triple_shot', 'rapid_fire', 'armor', 'weapon_shotgun', 'weapon_sniper', 'weapon_laser', 'weapon_homing'];
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
  const dt = (now - lastUpdate) / 16.67;
  lastUpdate = now;

  // Update all players
  players.forEach(player => player.update(dt));

  // Update all AI enemies and remove dead ones
  aiEnemies.forEach((ai, id) => {
    if (!ai.alive) {
      aiEnemies.delete(id);
      return;
    }
    ai.update(dt);
  });

  // Update all bullets
  bullets.forEach((bullet, id) => {
    const alive = bullet.update(dt);
    if (!alive) {
      bullets.delete(id);
      return;
    }

    let bulletConsumed = false;

    // Check bullet collision with players
    players.forEach(player => {
      if (bulletConsumed) return;
      if (!player.alive || player.id === bullet.playerId) return;
      if (player.cloaked) return;

      const dx = bullet.x - player.x;
      const dy = bullet.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < 30) {
        bulletConsumed = true;
        const killerId = player.takeDamage(bullet.damage, bullet.playerId);
        bullets.delete(id);

        if (killerId) {
          const killer = players.get(killerId);
          if (killer) {
            killer.score += 100;
            killer.kills++;
            killer.totalKills++;
            killer.powerUp();
            killer.addGangMember();

            io.emit('player_killed', {
              killedId: player.id,
              killerId: killerId,
              killerName: killer.name,
              killedName: player.name,
              gangSize: killer.gang.length
            });
          }
        }
      }
    });

    // Check bullet collision with AI enemies (only if bullet wasn't already consumed)
    if (!bulletConsumed) {
      aiEnemies.forEach(ai => {
        if (bulletConsumed) return;
        if (!ai.alive || ai.id === bullet.playerId) return;
        // Prevent AI friendly fire — AI bullets can't hit other AI
        if (typeof bullet.playerId === 'string' && bullet.playerId.startsWith('ai_')) return;

        const dx = bullet.x - ai.x;
        const dy = bullet.y - ai.y;
        const dist = Math.sqrt(dx * dx + dy * dy);

        if (dist < 30) {
          bulletConsumed = true;
          const killerId = ai.takeDamage(bullet.damage, bullet.playerId);
          bullets.delete(id);

          if (killerId) {
            dropAILoot(ai.x, ai.y);
            aiEnemies.delete(ai.id);

            const killer = players.get(killerId);
            if (killer) {
              killer.score += 50;
              killer.kills++;
              killer.totalKills++;

              io.emit('player_killed', {
                killedId: ai.id,
                killerId: killerId,
                killerName: killer.name,
                killedName: ai.name,
                gangSize: killer.gang.length,
                wasAI: true
              });
            }
          }
        }
      });
    }
  });

  // Check powerup collection
  powerups.forEach((powerup, id) => {
    players.forEach(player => {
      if (!player.alive) return;

      const dx = powerup.x - player.x;
      const dy = powerup.y - player.y;
      const dist = Math.sqrt(dx*dx + dy*dy);

      if (dist < 40) {
        // Prevent two players collecting same powerup
        if (!powerups.has(id)) return;
        player.applyPowerup(powerup.type, powerup.value);

        // Nuke kills all nearby players and AI
        if (powerup.type === 'nuke') {
          players.forEach(otherPlayer => {
            if (otherPlayer.id === player.id || !otherPlayer.alive) return;
            const ndx = player.x - otherPlayer.x;
            const ndy = player.y - otherPlayer.y;
            const ndist = Math.sqrt(ndx*ndx + ndy*ndy);
            if (ndist < 500) {
              const wasKilled = otherPlayer.takeDamage(999, player.id);
              if (wasKilled) {
                player.score += 100;
                player.kills++;
                player.totalKills++;
                player.powerUp();
                player.addGangMember();
                io.emit('player_killed', {
                  killedId: otherPlayer.id,
                  killerId: player.id,
                  killerName: player.name,
                  killedName: otherPlayer.name,
                  gangSize: player.gang.length
                });
              }
            }
          });
          // Nuke also kills AI enemies
          aiEnemies.forEach(ai => {
            if (!ai.alive) return;
            const ndx = player.x - ai.x;
            const ndy = player.y - ai.y;
            const ndist = Math.sqrt(ndx*ndx + ndy*ndy);
            if (ndist < 500) {
              dropAILoot(ai.x, ai.y);
              ai.alive = false;
              player.score += 50;
              player.kills++;
              player.totalKills++;
              io.emit('player_killed', {
                killedId: ai.id,
                killerId: player.id,
                killerName: player.name,
                killedName: ai.name,
                gangSize: player.gang.length,
                wasAI: true
              });
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

  // Broadcast game state (include AI enemies as players)
  const allPlayers = [
    ...Array.from(players.values()).map(p => p.serialize()),
    ...Array.from(aiEnemies.values()).map(a => a.serialize())
  ];
  io.emit('game_state', {
    players: allPlayers,
    bullets: Array.from(bullets.values()).map(b => b.serialize()),
    powerups: Array.from(powerups.values()).map(p => p.serialize())
  });

}, 1000 / TICK_RATE);

// Spawn powerups periodically
setInterval(() => {
  if (powerups.size < MAX_POWERUPS) {
    const spawnCount = Math.floor(Math.random() * 3) + 2;
    for (let i = 0; i < spawnCount && powerups.size < MAX_POWERUPS; i++) {
      spawnPowerup();
    }
  }
}, POWERUP_SPAWN_INTERVAL);

// Respawn AI enemies every 5 seconds
setInterval(() => {
  respawnDeadAI();
}, 5000);

// Socket.io events
io.on('connection', (socket) => {
  console.log(`Player connected: ${socket.id}`);

  socket.on('join', (data) => {
    const skin = data.skin || 'default';
    const ability = data.ability || 'dash';
    const player = new Player(socket.id, data.name || 'Anonymous', skin, ability);
    players.set(socket.id, player);

    console.log(`${player.name} joined (skin: ${skin}, ability: ${ability})`);

    socket.emit('init', {
      playerId: socket.id,
      worldSize: WORLD_SIZE,
      player: player.serialize(),
      skins: SKINS,
      weapons: WEAPONS,
      abilities: ABILITIES
    });

    io.emit('player_joined', {
      id: player.id,
      name: player.name
    });
  });

  socket.on('input', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    player.vx = Math.max(-1, Math.min(1, Number(data.vx) || 0));
    player.vy = Math.max(-1, Math.min(1, Number(data.vy) || 0));
    player.angle = Number(data.angle) || 0;
  });

  socket.on('shoot', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    const now = Date.now();
    const weaponDef = WEAPONS[player.weapon] || WEAPONS.default;
    const effectiveFireRate = player.fireRate * weaponDef.fireRateMult;

    if (now - player.lastShot < effectiveFireRate) return;
    player.lastShot = now;

    // Shooting breaks cloak
    if (player.cloaked) {
      player.cloaked = false;
      player.abilityActive = 0;
    }

    const speed = weaponDef.speed;
    const angle = typeof data.angle === 'number' ? data.angle : player.angle;
    let baseDamage = player.megaDamage > 0 ? player.damage * 3 : player.damage;
    baseDamage *= weaponDef.damageMult;

    // Calculate total bullets: weapon bullets * multishot
    const weaponBullets = weaponDef.bullets;
    const totalBullets = player.multishot > 1 ? player.multishot : weaponBullets;
    const spread = weaponBullets > 1 ? weaponDef.spread : (player.multishot > 1 ? 0.15 : 0);

    if (totalBullets === 1) {
      const bullet = new Bullet(bulletIdCounter++, socket.id, player.x, player.y,
        Math.cos(angle) * speed, Math.sin(angle) * speed, player.weapon);
      bullet.damage = baseDamage;
      bullets.set(bullet.id, bullet);
    } else {
      const startAngle = angle - (spread * (totalBullets - 1) / 2);
      for (let i = 0; i < totalBullets; i++) {
        const bulletAngle = startAngle + (spread * i);
        const bullet = new Bullet(bulletIdCounter++, socket.id, player.x, player.y,
          Math.cos(bulletAngle) * speed, Math.sin(bulletAngle) * speed, player.weapon);
        bullet.damage = baseDamage;
        bullets.set(bullet.id, bullet);
      }
    }

    // Consume ammo and sync with inventory
    if (player.weaponAmmo !== Infinity) {
      player.weaponAmmo--;
      const slot = player.weaponInventory[player.weaponIndex];
      if (slot) slot.ammo = player.weaponAmmo;
      if (player.weaponAmmo <= 0) {
        // Remove empty weapon from inventory
        player.weaponInventory.splice(player.weaponIndex, 1);
        player.weaponIndex = 0;
        const fallback = player.weaponInventory[0] || { type: 'default', ammo: Infinity };
        player.weapon = fallback.type;
        player.weaponAmmo = fallback.ammo;
      }
    }

    // Gang shoots in same direction
    if (player.gang && player.gang.length > 0) {
      player.gang.forEach((member) => {
        const gangBullet = new Bullet(bulletIdCounter++, socket.id, member.x, member.y,
          Math.cos(angle) * 20, Math.sin(angle) * 20, 'default');
        gangBullet.damage = player.megaDamage > 0 ? player.damage * 3 : player.damage;
        bullets.set(gangBullet.id, gangBullet);
      });
    }
  });

  socket.on('use_ability', () => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;

    const result = player.useAbility();
    if (!result) return;

    // Handle EMP effect on other players and AI
    if (result.type === 'emp') {
      players.forEach(otherPlayer => {
        if (otherPlayer.id === player.id || !otherPlayer.alive) return;
        const dx = player.x - otherPlayer.x;
        const dy = player.y - otherPlayer.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < result.radius) {
          otherPlayer.empSlowed = ABILITIES.emp.duration;
        }
      });
      aiEnemies.forEach(ai => {
        if (!ai.alive) return;
        const dx = player.x - ai.x;
        const dy = player.y - ai.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        if (dist < result.radius) {
          ai.empSlowed = ABILITIES.emp.duration;
        }
      });
    }

    // Notify all clients of the ability use for visual effects
    io.emit('ability_used', {
      playerId: player.id,
      ability: result.type,
      x: result.x || player.x,
      y: result.y || player.y,
      radius: result.radius || 0
    });
  });

  socket.on('switch_weapon', (data) => {
    const player = players.get(socket.id);
    if (!player || !player.alive) return;
    const dir = data.direction === 'prev' ? -1 : 1;
    player.switchWeapon(dir);
  });

  socket.on('select_skin', (data) => {
    const player = players.get(socket.id);
    if (!player) return;
    const skinId = data.skin;
    if (SKINS[skinId] && player.totalKills >= SKINS[skinId].kills) {
      player.skin = skinId;
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
