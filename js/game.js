/* ══════════════════════════════════════════════
   game.js — 战斗引擎：实体 / AI / 碰撞 / 渲染
   上帝视角：1600x1000 战场整屏可见，等比缩放
   ══════════════════════════════════════════════ */
"use strict";

/* ────────── 小工具 ────────── */
const clamp = (v, a, b) => v < a ? a : (v > b ? b : v);
const dist = (x1, y1, x2, y2) => Math.hypot(x2 - x1, y2 - y1);
const rand = (a, b) => a + Math.random() * (b - a);
const randi = (a, b) => Math.floor(rand(a, b + 1));
const TAU = Math.PI * 2;

/* 角度平滑转向（走最短弧） */
function turnToward(cur, target, maxStep) {
  let d = (target - cur) % TAU;
  if (d > Math.PI) d -= TAU;
  if (d < -Math.PI) d += TAU;
  return cur + clamp(d, -maxStep, maxStep);
}

/* 触屏设备检测（用于初始展示触控 UI 与特效减量） */
const TOUCH_DEVICE = ("ontouchstart" in window) || (navigator.maxTouchPoints > 0);

/* ────────── 输入 ────────── */
const Input = {
  keys: new Set(),
  mouseX: 800, mouseY: 500,
  mouseDown: false,   // 左键
  auxDown: false,     // 右键或 Shift

  // 触屏状态
  touchMode: false,   // 首次触摸后激活（覆盖键鼠输入源）
  leftStick: { id: null, cx: 0, cy: 0, dx: 0, dy: 0, active: false },
  rightStick: { id: null, cx: 0, cy: 0, dx: 0, dy: 0, active: false },
  JOY_MAX: 56,        // 摇杆最大行程(px)
  JOY_DEAD: 14,       // 死区(px)

  attach(canvas) {
    window.addEventListener("keydown", (e) => {
      const k = e.key.toLowerCase();
      this.keys.add(k);
      // 阻止空格/方向键滚动页面
      if ([" ", "arrowup", "arrowdown", "arrowleft", "arrowright"].includes(k)) e.preventDefault();
      if (window.Game && Game.onKey) Game.onKey(k, e);
    });
    window.addEventListener("keyup", (e) => this.keys.delete(e.key.toLowerCase()));
    window.addEventListener("blur", () => { this.keys.clear(); this.mouseDown = false; this.auxDown = false; });

    const toLocal = (e) => {
      const rect = canvas.getBoundingClientRect();
      this.mouseX = (e.clientX - rect.left) / rect.width * CFG.WORLD_W;
      this.mouseY = (e.clientY - rect.top) / rect.height * CFG.WORLD_H;
    };
    canvas.addEventListener("mousemove", toLocal);
    canvas.addEventListener("mousedown", (e) => {
      toLocal(e);
      SFX.resume();
      if (e.button === 0) this.mouseDown = true;
      if (e.button === 2) this.auxDown = true;
    });
    window.addEventListener("mouseup", (e) => {
      if (e.button === 0) this.mouseDown = false;
      if (e.button === 2) this.auxDown = false;
    });
    canvas.addEventListener("contextmenu", (e) => e.preventDefault());
    this.attachTouch(canvas);
  },

  /* ── 触屏：动态双摇杆（左半屏驾驶 / 右半屏瞄准开火） ──
     无条件绑定（桌面浏览器不会触发 touch 事件，无副作用）；
     touchMode 仅在真实触摸发生时激活，覆盖键鼠输入源 */
  attachTouch(canvas) {
    const start = (e) => {
      e.preventDefault();
      SFX.resume();
      if (!this.touchMode) {
        this.touchMode = true;
        UI.announce("🕹 左侧驾驶 · 右侧瞄准开火");
      }
      const rect = canvas.getBoundingClientRect();
      const midX = rect.width > 0 ? rect.left + rect.width / 2 : window.innerWidth / 2;
      for (const t of e.changedTouches) {
        const isLeft = t.clientX < midX;
        const stick = isLeft ? this.leftStick : this.rightStick;
        if (stick.id !== null) continue;
        stick.id = t.identifier;
        stick.cx = t.clientX; stick.cy = t.clientY;
        stick.dx = 0; stick.dy = 0; stick.active = false;
        UI.showJoystick(isLeft, t.clientX, t.clientY);
      }
    };
    const move = (e) => {
      e.preventDefault();
      for (const t of e.changedTouches) {
        for (const stick of [this.leftStick, this.rightStick]) {
          if (stick.id !== t.identifier) continue;
          const dx = t.clientX - stick.cx, dy = t.clientY - stick.cy;
          const d = Math.hypot(dx, dy);
          const cl = Math.min(d, this.JOY_MAX);
          stick.dx = d > 0 ? (dx / d) * cl : 0;
          stick.dy = d > 0 ? (dy / d) * cl : 0;
          stick.active = d > this.JOY_DEAD;
          UI.moveJoystick(stick === this.leftStick, stick.dx, stick.dy);
        }
      }
    };
    const end = (e) => {
      for (const t of e.changedTouches) {
        for (const stick of [this.leftStick, this.rightStick]) {
          if (stick.id !== t.identifier) continue;
          stick.id = null; stick.dx = stick.dy = 0; stick.active = false;
          UI.hideJoystick(stick === this.leftStick);
        }
      }
    };
    canvas.addEventListener("touchstart", start, { passive: false });
    canvas.addEventListener("touchmove", move, { passive: false });
    canvas.addEventListener("touchend", end);
    canvas.addEventListener("touchcancel", end);
  },

  /* 当前移动轴：触屏用左摇杆，否则键盘 */
  axis() {
    if (this.touchMode) {
      const s = this.leftStick;
      if (s.id !== null && s.active) {
        const d = Math.hypot(s.dx, s.dy);
        const n = Math.min(1, d / this.JOY_MAX);
        return { x: (s.dx / d) * n, y: (s.dy / d) * n, active: true };
      }
      return { x: 0, y: 0, active: false };
    }
    let x = 0, y = 0;
    if (this.keys.has("w") || this.keys.has("arrowup")) y -= 1;
    if (this.keys.has("s") || this.keys.has("arrowdown")) y += 1;
    if (this.keys.has("a") || this.keys.has("arrowleft")) x -= 1;
    if (this.keys.has("d") || this.keys.has("arrowright")) x += 1;
    const len = Math.hypot(x, y);
    return len > 0 ? { x: x / len, y: y / len, active: true } : { x: 0, y: 0, active: false };
  },

  /* 主炮开火意图：触屏 = 右摇杆推出死区（瞄准即自动开火） */
  fireWanted() {
    return this.touchMode ? this.rightStick.active : this.mouseDown;
  },

  /* 机枪意图：触屏 = 🔫 按钮按下；键鼠 = 右键/Shift */
  mgWanted() {
    return this.touchMode ? this.auxDown : (this.auxDown || this.keys.has("shift"));
  },
};

/* ────────── 地图 ────────── */
const Map = {
  grid: null, // Uint8Array，0 空 1 砖 2 钢
  brickHp: null,

  at(cx, cy) {
    if (cx < 0 || cy < 0 || cx >= CFG.COLS || cy >= CFG.ROWS) return CFG.WALL.STEEL; // 世界外视为钢墙
    return this.grid[cy * CFG.COLS + cx];
  },
  solid(cx, cy) { return this.at(cx, cy) !== CFG.WALL.EMPTY; },
  brickHpAt(cx, cy) { return this.brickHp[cy * CFG.COLS + cx]; },
  damageBrick(cx, cy, dmg) {
    const i = cy * CFG.COLS + cx;
    if (this.grid[i] !== CFG.WALL.BRICK) return false;
    this.brickHp[i] -= dmg;
    if (this.brickHp[i] <= 0) { this.grid[i] = CFG.WALL.EMPTY; return true; }
    return false;
  },

  /* 生成中心对称地图，保证出生区连通 */
  generate(density) {
    const { COLS, ROWS, TILE } = CFG;
    const playerZone = { x0: COLS / 2 - 3, y0: ROWS - 5, x1: COLS / 2 + 2, y1: ROWS - 1 };  // 下中
    const enemyZone  = { x0: COLS / 2 - 3, y0: 0, x1: COLS / 2 + 2, y1: 4 };                 // 上中

    for (let attempt = 0; attempt < 14; attempt++) {
      const grid = new Uint8Array(COLS * ROWS);
      const put = (x, y, v) => {
        if (x < 1 || y < 1 || x >= COLS - 1 || y >= ROWS - 1) return; // 最外圈留空走廊
        grid[y * COLS + x] = v;
        grid[(ROWS - 1 - y) * COLS + (COLS - 1 - x)] = v;             // 中心对称
      };
      const blocks = Math.floor(COLS * ROWS * density);
      for (let i = 0; i < blocks; i++) {
        const x = randi(1, COLS - 2), y = randi(1, ROWS - 2);
        const steel = Math.random() < 0.22;
        const v = steel ? CFG.WALL.STEEL : CFG.WALL.BRICK;
        put(x, y, v);
        if (Math.random() < 0.4) put(x + 1, y, v); // 偶尔横向加长
      }
      // 清空出生区
      const clear = (z) => { for (let y = z.y0; y <= z.y1; y++) for (let x = z.x0; x <= z.x1; x++) grid[y * COLS + x] = 0; };
      clear(playerZone); clear(enemyZone);

      // 连通性检查（BFS 玩家区 → 敌人区）
      const start = (playerZone.y0 + 2) * COLS + (playerZone.x0 + 3);
      const target = 2 * COLS + (enemyZone.x0 + 3);
      const seen = new Uint8Array(COLS * ROWS);
      const q = [start]; seen[start] = 1;
      let ok = false;
      while (q.length) {
        const c = q.pop();
        if (c === target) { ok = true; break; }
        const cx = c % COLS, cy = (c - cx) / COLS;
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = cx + dx, ny = cy + dy;
          if (nx < 0 || ny < 0 || nx >= COLS || ny >= ROWS) continue;
          const n = ny * COLS + nx;
          if (seen[n] || grid[n]) continue;
          seen[n] = 1; q.push(n);
        }
      }
      if (ok || attempt === 13) {
        this.grid = grid;
        this.brickHp = new Float32Array(COLS * ROWS);
        for (let i = 0; i < grid.length; i++) if (grid[i] === CFG.WALL.BRICK) this.brickHp[i] = CFG.WALL.BRICK_HP;
        return;
      }
    }
  },

  /* 视线检测：A→B 是否无墙阻挡 */
  los(x1, y1, x2, y2) {
    const d = dist(x1, y1, x2, y2);
    const steps = Math.max(1, Math.ceil(d / (CFG.TILE * 0.5)));
    for (let i = 1; i < steps; i++) {
      const t = i / steps;
      const x = x1 + (x2 - x1) * t, y = y1 + (y2 - y1) * t;
      if (this.solid(Math.floor(x / CFG.TILE), Math.floor(y / CFG.TILE))) return false;
    }
    return true;
  },

  /* 圆形实体与墙体碰撞：逐格分离推出 */
  resolveCircle(ent) {
    const T = CFG.TILE, r = ent.radius;
    ent.x = clamp(ent.x, r + 2, CFG.WORLD_W - r - 2);
    ent.y = clamp(ent.y, r + 2, CFG.WORLD_H - r - 2);
    const cx0 = Math.floor((ent.x - r) / T), cx1 = Math.floor((ent.x + r) / T);
    const cy0 = Math.floor((ent.y - r) / T), cy1 = Math.floor((ent.y + r) / T);
    for (let cy = cy0; cy <= cy1; cy++) {
      for (let cx = cx0; cx <= cx1; cx++) {
        if (!this.solid(cx, cy)) continue;
        const nx = clamp(ent.x, cx * T, cx * T + T);
        const ny = clamp(ent.y, cy * T, cy * T + T);
        const dx = ent.x - nx, dy = ent.y - ny;
        const d2 = dx * dx + dy * dy;
        if (d2 < r * r) {
          const d = Math.sqrt(d2) || 0.001;
          const push = r - d;
          ent.x += (dx / d) * push;
          ent.y += (dy / d) * push;
        }
      }
    }
  },
};

/* ────────── 实体 ────────── */
let BULLET_ID = 0;

class Bullet {
  constructor(cfg) {
    this.id = ++BULLET_ID;
    Object.assign(this, cfg); // x,y,vx,vy,dmg,radius,color,owner('player'|'enemy'),ammo(AMMO key),life
    this.dead = false;
    this.px = this.x; this.py = this.y; // 上一帧位置（拖尾/弹射法线判定）
    this.bounces = 0;
    this.bounced = false;
  }

  update(dt, game) {
    this.px = this.x; this.py = this.y;

    // 追踪导弹
    if (this.homing) {
      const target = this.owner === "player" ? game.nearestEnemy(this.x, this.y) : game.player;
      if (target && target.alive) {
        const want = Math.atan2(target.y - this.y, target.x - this.x);
        const cur = Math.atan2(this.vy, this.vx);
        const ang = turnToward(cur, want, this.homing * dt);
        const sp = Math.min(this.maxSpeed || 520, Math.hypot(this.vx, this.vy) + 300 * dt);
        this.vx = Math.cos(ang) * sp; this.vy = Math.sin(ang) * sp;
      }
      if (Math.random() < 0.6) game.addParticle(this.x, this.y, rand(-15, 15), rand(-15, 15), 0.3, 3, "#8a8a8a");
    }

    this.x += this.vx * dt;
    this.y += this.vy * dt;
    if (this.life !== undefined) {
      this.life -= dt;
      if (this.life <= 0) { this.dead = true; return; }
    }
    if (this.x < -30 || this.y < -30 || this.x > CFG.WORLD_W + 30 || this.y > CFG.WORLD_H + 30) this.dead = true;

    // 撞墙
    const cx = Math.floor(this.x / CFG.TILE), cy = Math.floor(this.y / CFG.TILE);
    if (Map.solid(cx, cy)) {
      const tile = Map.at(cx, cy);

      // ── 弹射：可反弹弹种（标准弹/穿甲弹）碰墙镜面反弹 ──
      if (this.bounce > 0 && this.bounces < this.bounce) {
        this.bounces++;
        this.bounced = true;
        const T = CFG.TILE, L = cx * T, Tp = cy * T, R = L + T, B = Tp + T;
        let flipX = false;
        if (this.px < L && this.vx > 0) flipX = true;              // 从左侧撞入
        else if (this.px > R && this.vx < 0) flipX = true;         // 从右侧撞入
        else if (this.py < Tp && this.vy > 0) flipX = false;       // 从上方撞入
        else if (this.py > B && this.vy < 0) flipX = false;        // 从下方撞入
        else flipX = Math.abs(this.vx) >= Math.abs(this.vy);       // 角碰撞：按主轴
        if (flipX) this.vx = -this.vx; else this.vy = -this.vy;
        this.x = this.px; this.y = this.py;                        // 退回墙外
        // 弹射落点溅射（不伤发射方）
        game.splash(this.x, this.y, this);
        if (tile === CFG.WALL.BRICK && this.wallDamage) {
          Map.damageBrick(cx, cy, this.wallDamage * CFG.BOUNCE.WALL_MUL);
          game.debris(cx, cy, 3);
        } else {
          game.sparks(this.x, this.y, 4);
        }
        SFX.hit();
        return;
      }

      this.dead = true;
      if (tile === CFG.WALL.BRICK && this.wallDamage) {
        const destroyed = Map.damageBrick(cx, cy, this.wallDamage);
        SFX.brick();
        game.debris(cx, cy, destroyed ? 10 : 4);
      } else {
        SFX.hit();
        game.sparks(this.x, this.y, 3);
      }
      if (this.blast) game.explode(this.x, this.y, this.blast, this.blastDamage, this.owner, this);
      return;
    }

    // 命中坦克
    const victims = this.owner === "player" ? game.enemies : [game.player];
    for (const t of victims) {
      if (!t || !t.alive || t.spawnGrace > 0) continue;
      if (dist(this.x, this.y, t.x, t.y) < t.radius + this.radius) {
        this.dead = true;
        t.takeHit(this.dmg, game, this);
        game.sparks(this.x, this.y, 5);
        if (this.blast) game.explode(this.x, this.y, this.blast, this.blastDamage, this.owner, this);
        return;
      }
    }
  }
}

class Tank {
  constructor(opts) {
    Object.assign(this, {
      x: 0, y: 0, angle: 0, turret: 0,
      hp: 100, maxHp: 100, shield: 0, maxShield: 0,
      radius: 20, speed: 150, size: 1,
      reload: 0, reloadTime: 0.6,
      alive: true, isPlayer: false,
      bodyColor: "#555", turretColor: "#333",
      flash: 0, hurtFlash: 0, shieldFlash: 0,
      spawnGrace: 0, trackTimer: 0,
    }, opts);
    this.muzzleLen = 30 * this.size;
  }

  takeHit(dmg, game, src) {
    if (!this.alive || this.spawnGrace > 0) return;
    let remain = dmg;
    if (this.shield > 0) {
      this.shieldFlash = 0.25;
      const absorbed = Math.min(this.shield, remain);
      this.shield -= absorbed;
      remain -= absorbed;
    }
    if (remain > 0) {
      if (this.isPlayer) remain *= Save.eff("plating_up"); // 反应装甲减伤
      this.hp -= remain;
      this.hurtFlash = 0.22;
    }
    SFX.hit();
    if (this.hp <= 0) {
      this.hp = 0;
      this.alive = false;
      game.onTankDeath(this, src);
    }
  }

  /* 从炮口发射子弹 */
  fire(game, ammoKey, overrides) {
    const a = AMMO[ammoKey];
    const ang = this.turret;
    const def = {
      x: this.x + Math.cos(ang) * this.muzzleLen,
      y: this.y + Math.sin(ang) * this.muzzleLen,
      vx: Math.cos(ang) * a.speed,
      vy: Math.sin(ang) * a.speed,
      dmg: a.damage, radius: a.radius, color: a.color,
      owner: this.isPlayer ? "player" : "enemy",
      ammo: ammoKey, life: a.life,
      wallDamage: a.wallDamage, blast: a.blast, blastDamage: a.blastDamage,
      homing: a.homing, maxSpeed: a.maxSpeed,
      bounce: a.bounce || 0,
    };
    Object.assign(def, overrides || {});
    game.bullets.push(new Bullet(def));
    this.flash = 0.09;
    this.kick = 3;
  }
}

/* ────────── 玩家 ────────── */
class PlayerTank extends Tank {
  constructor() {
    const armorBonus = Save.eff("armor_up");
    super({
      isPlayer: true,
      x: CFG.WORLD_W / 2, y: CFG.WORLD_H - 110,
      maxHp: CFG.PLAYER.hp + armorBonus,
      speed: CFG.PLAYER.speed,
      radius: CFG.PLAYER.radius,
      bodyColor: CFG.PLAYER.bodyColor, turretColor: CFG.PLAYER.turretColor,
    });
    this.hp = this.maxHp;
    this.ammo = { std: Infinity, ap: 0, he: 0, sg: 0, ms: 0 };
    this.curAmmo = "std";
    this.mgAmmo = 0;
    this.mgReload = 0;
    this.repairKits = 0;
    this.score = 0;
    this.kills = 0;
    this.combo = 0;
    this.comboTimer = 0;
    // AI 托管状态
    this.autopilot = false;
    this.aiAim = { x: 0, y: 0 };
    this.aiMove = { x: 0, y: 0, active: false };
    this.aiFire = false;
    this.aiMg = false;
    this.aiTimer = 0;
    this.aiRepairCd = 0;
    this.aiStrafeDir = 1;
    this.aiStrafeTimer = 0;
    this.aiUnstickT = 0;
    this.aiUnstickA = 0;
    this._lastPos = null;
  }

  /* 开局装载存档中的装备 */
  equip() {
    this.ammo.ap = Save.stock("ap");
    this.ammo.he = Save.stock("he");
    this.ammo.sg = Save.stock("sg");
    this.ammo.ms = Save.stock("ms");
    this.mgAmmo = Save.data.mgOwned ? Save.stock("mg_ammo") : 0;
    this.repairKits = Math.min(REWARDS.MAX_REPAIRS, Save.stock("repair"));
    const cells = Math.min(REWARDS.MAX_SHIELD_CELLS, Save.stock("shield_cell"));
    if (cells > 0) {
      this.maxShield = this.shield = cells * 60;
      Save.data.inv.shield_cell -= cells; // 电池开战即激活消耗
      Save.persist();
    }
    if (!this.ammo[this.curAmmo]) this.curAmmo = "std";
  }

  get reloadMul() { return Save.eff("reload_up"); }
  get dmgMul() { return Save.eff("dmg_up"); }

  update(dt, game) {
    if (!this.alive) return;
    if (this.spawnGrace > 0) this.spawnGrace -= dt;
    if (this.comboTimer > 0) {
      this.comboTimer -= dt;
      if (this.comboTimer <= 0) this.combo = 0;
    }

    // ── 控制源：手动键鼠 / 触屏摇杆 / AI 托管 ──
    let aimX, aimY;
    let move, wantFire, wantMg;
    if (this.autopilot) {
      this._aiPerFrame(game);
      this._aiDecide(game, dt);
      aimX = this.aiAim.x; aimY = this.aiAim.y;
      move = this.aiMove;
      wantFire = this.aiFire;
      wantMg = this.aiMg;
    } else if (Input.touchMode) {
      move = Input.axis();
      wantFire = Input.fireWanted();
      wantMg = Input.mgWanted();
      if (Input.rightStick.active) {
        // 瞄准点 = 玩家位置沿右摇杆方向延伸
        const ang = Math.atan2(Input.rightStick.dy, Input.rightStick.dx);
        aimX = this.x + Math.cos(ang) * 400;
        aimY = this.y + Math.sin(ang) * 400;
      } else {
        // 未触瞄准：保持炮塔当前朝向
        aimX = this.x + Math.cos(this.turret) * 400;
        aimY = this.y + Math.sin(this.turret) * 400;
      }
    } else {
      aimX = Input.mouseX; aimY = Input.mouseY;
      move = Input.axis();
      wantFire = Input.mouseDown;
      wantMg = Input.mgWanted();
    }

    // ── 移动 ──
    if (move.active) {
      const want = Math.atan2(move.y, move.x);
      this.angle = turnToward(this.angle, want, 8.5 * dt);
      const vx = Math.cos(this.angle) * this.speed * dt;
      const vy = Math.sin(this.angle) * this.speed * dt;
      this.x += vx; this.y += vy;
      Map.resolveCircle(this);
      // 履带印
      this.trackTimer -= dt;
      if (this.trackTimer <= 0) {
        this.trackTimer = 0.055;
        game.addTrack(this);
      }
    }
    this.turret = Math.atan2(aimY - this.y, aimX - this.x);

    // ── 主炮 ──
    this.reload -= dt;
    const ammo = AMMO[this.curAmmo];
    if (wantFire && this.reload <= 0) {
      if (this.ammo[this.curAmmo] > 0) {
        const shots = ammo.pellets || 1;
        for (let i = 0; i < shots; i++) {
          const spread = ammo.pellets ? (i - (shots - 1) / 2) * ammo.spread : 0;
          this.fire(game, this.curAmmo, {
            vx: Math.cos(this.turret + spread) * ammo.speed * rand(0.94, 1.06),
            vy: Math.sin(this.turret + spread) * ammo.speed * rand(0.94, 1.06),
            dmg: ammo.damage * this.dmgMul,
          });
        }
        if (this.curAmmo !== "std") {
          this.ammo[this.curAmmo]--;
          if (this.ammo[this.curAmmo] <= 0) UI.refreshAmmoBar(game);
        }
        this.reload = ammo.reload * this.reloadMul;
        if (this.curAmmo === "ms") SFX.missile(); else SFX.shoot();
        game.shake(this.curAmmo === "std" ? 2 : 4);
      } else {
        // 该弹种耗尽 → 自动切回标准弹
        this.curAmmo = "std";
        UI.refreshAmmoBar(game);
      }
    }

    // ── 机枪 ──
    this.mgReload -= dt;
    if (wantMg && this.mgAmmo > 0 && this.mgReload <= 0) {
      const spread = rand(-CFG.MG.spread, CFG.MG.spread);
      this.fire(game, "std", {
        x: this.x + Math.cos(this.turret) * (this.muzzleLen - 6),
        y: this.y + Math.sin(this.turret) * (this.muzzleLen - 6),
        vx: Math.cos(this.turret + spread) * CFG.MG.speed,
        vy: Math.sin(this.turret + spread) * CFG.MG.speed,
        dmg: CFG.MG.damage * this.dmgMul, radius: 2.4, color: "#ffe27a",
        wallDamage: 4, blast: 0, blastDamage: 0, life: CFG.MG.range / CFG.MG.speed,
        bounce: 0,
      });
      this.mgAmmo--;
      this.mgReload = CFG.MG.reload;
      SFX.mg();
      if (this.mgAmmo === 0) UI.refreshAmmoBar(game);
    }

    // ── 拾取 ──
    for (const d of game.drops) {
      if (!d.dead && dist(this.x, this.y, d.x, d.y) < this.radius + 16) {
        d.dead = true;
        SFX.pickup();
        game.floatText(d.x, d.y - 14, d.label, "#8fe3ff");
        if (d.kind === "repair") this.hp = Math.min(this.maxHp, this.hp + 25);
        if (d.kind === "shield") this.shield = Math.min(this.maxShield || 60, this.shield + 25);
        if (d.kind === "ammo") {
          const special = ["ap", "he", "sg", "ms"].find((k) => this.ammo[k] > 0);
          if (special) this.ammo[special] += 2;
          else this.ammo.ap += 1;
          UI.refreshAmmoBar(game);
        }
      }
    }
  }

  /* ══ AI 托管：每帧瞄准与开火判定 ══ */
  _aiPerFrame(game) {
    const target = game.nearestEnemy(this.x, this.y);
    this.aiFire = false;
    this.aiMg = false;
    if (!target || !target.alive) {
      // 无目标：炮塔缓慢巡逻
      this.aiAim.x = this.x + Math.cos(this.turret + 0.02) * 200;
      this.aiAim.y = this.y + Math.sin(this.turret + 0.02) * 200;
      return;
    }
    // 提前量预判：按当前弹速与目标速度外推
    const ammo = AMMO[this.curAmmo];
    const d = dist(this.x, this.y, target.x, target.y);
    const bt = d / ammo.speed;
    this.aiAim.x = target.x + (target.vx || 0) * bt * 0.85;
    this.aiAim.y = target.y + (target.vy || 0) * bt * 0.85;
    if (!Map.los(this.x, this.y, target.x, target.y)) return;
    const aimAng = Math.atan2(this.aiAim.y - this.y, this.aiAim.x - this.x);
    let diff = Math.abs(((aimAng - this.turret) % TAU + TAU) % TAU);
    if (diff > Math.PI) diff = TAU - diff;
    this.aiFire = d < 540 && diff < 0.13;
    this.aiMg = this.mgAmmo > 0 && d < 300 && diff < 0.22;
  }

  /* ══ AI 托管：移动/弹种/维修决策（0.15s 节流）══ */
  _aiDecide(game, dt) {
    this.aiTimer -= dt;
    this.aiRepairCd -= dt;
    this.aiStrafeTimer -= dt;
    if (this.aiStrafeTimer <= 0) {
      this.aiStrafeTimer = rand(1.6, 3.2);
      this.aiStrafeDir = Math.random() < 0.5 ? 1 : -1;
    }
    if (this.aiTimer > 0) return;
    this.aiTimer = 0.15;

    const target = game.nearestEnemy(this.x, this.y);

    // ── 卡墙脱困：脱困期内强制使用偏转方向 ──
    let stuckOverride = false;
    if (this.aiUnstickT > 0) {
      this.aiUnstickT -= 0.15;
      stuckOverride = true;
      this.aiMove = { x: Math.cos(this.aiUnstickA), y: Math.sin(this.aiUnstickA), active: true };
    }

    // ── 威胁躲避：0.6s 内会掠过本体的敌方弹道 ──
    let dodgeX = 0, dodgeY = 0, threat = false;
    if (!stuckOverride) {
      for (const b of game.bullets) {
        if (b.owner !== "enemy") continue;
        const spd = Math.hypot(b.vx, b.vy) || 1;
        const dx = this.x - b.x, dy = this.y - b.y;
        const along = (dx * b.vx + dy * b.vy) / spd;         // 在弹道前方的投影距离
        const perp = Math.abs(dx * b.vy - dy * b.vx) / spd;   // 距弹道的垂直距离
        if (along > 0 && along < spd * 0.6 && perp < 52) {
          threat = true;
          const nx = -b.vy / spd, ny = b.vx / spd;            // 弹道法向
          const side = (dx * nx + dy * ny) >= 0 ? 1 : -1;     // 往远离一侧闪
          dodgeX += nx * side * 1.6;
          dodgeY += ny * side * 1.6;
        }
      }
    }

    // ── 与目标的相对机动：接近 / 拉距 / 环绕 ──
    let mx = 0, my = 0;
    if (!stuckOverride) {
      if (target) {
        const d = dist(this.x, this.y, target.x, target.y);
        const ang = Math.atan2(target.y - this.y, target.x - this.x);
        const hasLos = Map.los(this.x, this.y, target.x, target.y);
        if (!hasLos || d > 430) {                       // 接近（无视线时沿墙绕行）
          const navA = this._navAround(ang);
          mx = Math.cos(navA); my = Math.sin(navA);
        } else if (d < 190) {                           // 太近后撤
          mx = -Math.cos(ang) * 0.8; my = -Math.sin(ang) * 0.8;
        } else {                                        // 交战距离环绕走位
          const sa = ang + (Math.PI / 2) * this.aiStrafeDir;
          mx = Math.cos(sa) * 0.7; my = Math.sin(sa) * 0.7;
        }
      }

      // ── 补给拾取（无威胁时顺路去捡）──
      if (!threat) {
        let best = null, bd = 230;
        for (const dr of game.drops) {
          const d = dist(this.x, this.y, dr.x, dr.y);
          if (d < bd) { bd = d; best = dr; }
        }
        if (best) {
          const ang = Math.atan2(best.y - this.y, best.x - this.x);
          mx += Math.cos(ang) * 0.9; my += Math.sin(ang) * 0.9;
        }
      }

      // 合成移动向量（躲避优先）
      mx += dodgeX; my += dodgeY;
      const len = Math.hypot(mx, my);
      this.aiMove = len > 0.01 ? { x: mx / len, y: my / len, active: true } : { x: 0, y: 0, active: false };
    }

    // ── 卡墙检测：决策周期内实际位移不足 → 进入脱困 ──
    const prev = this._lastPos || { x: this.x, y: this.y };
    const movedD = dist(prev.x, prev.y, this.x, this.y);
    if (this.aiMove.active && movedD < this.speed * 0.15 * 0.3) {
      this.aiUnstickT = rand(0.5, 0.9);
      const baseA = Math.atan2(this.aiMove.y, this.aiMove.x);
      this.aiUnstickA = baseA + (Math.random() < 0.5 ? 1 : -1) * rand(1.0, 2.0);
    }
    this._lastPos = { x: this.x, y: this.y };

    // ── 弹种选择 ──
    if (target) {
      const d = dist(this.x, this.y, target.x, target.y);
      let want = "std";
      if (d < 180 && this.ammo.sg > 0) want = "sg";
      else if (d > 340 && this.ammo.ms > 0) want = "ms";
      else if (d > 340 && this.ammo.ap > 0) want = "ap";
      else if (d < 320 && this.ammo.he > 0) want = "he";
      if (want !== this.curAmmo) {
        this.curAmmo = want;
        UI.refreshAmmoBar(game);
      }
    }

    // ── 低血量自动维修 ──
    if (this.hp < this.maxHp * 0.42 && this.repairKits > 0 && this.aiRepairCd <= 0) {
      if (this.useRepair(game)) this.aiRepairCd = 4;
    }
  }

  /* ══ AI 托管：无视线时的贪婪避障导航 ══
     以目标方向为基准，向两侧展开候选角；采样点可达（无墙阻挡）
     且朝目标分量最大的方向胜出 → 产生"沿墙滑行绕行"行为 */
  _navAround(targetAng) {
    let bestA = targetAng, bestScore = -Infinity;
    for (const off of [0, 0.55, -0.55, 1.1, -1.1, 1.7, -1.7, 2.4, -2.4]) {
      const a = targetAng + off;
      const sx = this.x + Math.cos(a) * 90;
      const sy = this.y + Math.sin(a) * 90;
      if (sx < 30 || sy < 30 || sx > CFG.WORLD_W - 30 || sy > CFG.WORLD_H - 30) continue;
      if (Map.solid(Math.floor(sx / CFG.TILE), Math.floor(sy / CFG.TILE))) continue;
      if (!Map.los(this.x, this.y, sx, sy)) continue;
      const score = Math.cos(a - targetAng) + rand(-0.06, 0.06);
      if (score > bestScore) { bestScore = score; bestA = a; }
    }
    return bestA;
  }

  useRepair(game) {
    if (!this.alive || this.repairKits <= 0 || this.hp >= this.maxHp) return false;
    this.repairKits--;
    this.hp = Math.min(this.maxHp, this.hp + 40);
    Save.data.inv.repair = Math.max(0, Save.stock("repair") - 1); // 消耗档案库存
    Save.persist();
    SFX.pickup();
    game.floatText(this.x, this.y - 30, "+40 🔧", "#7ee87e");
    return true;
  }
}

/* ────────── 敌人 AI ────────── */
class EnemyTank extends Tank {
  constructor(type, x, y, buffs) {
    const t = ENEMIES[type];
    super({
      x, y,
      maxHp: Math.round(t.hp * (buffs?.hp || 1)),
      speed: t.speed * (buffs?.speed || 1),
      radius: t.radius, size: t.size,
      reloadTime: t.reload * (buffs?.reload || 1),
      bodyColor: t.body, turretColor: t.turret,
      angle: Math.PI / 2,
    });
    this.type = type;
    this.def = t;
    this.bulletDamage = t.bulletDamage * (buffs?.dmg || 1);
    this.hp = this.maxHp;
    this.reload = rand(1.5, 2.4);   // 首发延迟：给玩家反应窗口
    this.vx = 0; this.vy = 0;       // 供托管 AI 预判
    this.strafeDir = Math.random() < 0.5 ? 1 : -1;
    this.strafeTimer = rand(1.5, 3.5);
    this.stuck = 0;
    this.unstickTimer = 0;
    this.unstickAngle = 0;
    this.spawnGrace = 0.9;
    this.showHpUntil = 0;
  }

  fireAt(game) {
    const p = game.player;
    const base = Math.atan2(p.y - this.y, p.x - this.x);
    this.turret = base;
    const offsets = this.def.burst || [0];
    for (const off of offsets) {
      const ang = base + off + rand(-0.05, 0.05);
      this.fire(game, "std", {
        vx: Math.cos(ang) * this.def.bulletSpeed,
        vy: Math.sin(ang) * this.def.bulletSpeed,
        dmg: this.bulletDamage, radius: this.type === "boss" ? 5 : 4,
        color: this.type === "boss" ? "#ff6b52" : "#ff9d6b",
        wallDamage: 8, blast: 0, blastDamage: 0,
      });
    }
    SFX.shoot();
  }

  update(dt, game) {
    if (!this.alive) return;
    if (this.spawnGrace > 0) { this.spawnGrace -= dt; this.turret = Math.atan2(game.player.y - this.y, game.player.x - this.x); return; }

    const p = game.player;
    const d = dist(this.x, this.y, p.x, p.y);
    const angToP = Math.atan2(p.y - this.y, p.x - this.x);
    const hasLos = Map.los(this.x, this.y, p.x, p.y);
    this.turret = turnToward(this.turret, angToP, 5 * dt);

    // ── 决定移动方向 ──
    let want;
    if (this.unstickTimer > 0) {
      this.unstickTimer -= dt;
      want = this.unstickAngle; // 脱困方向
    } else if (!hasLos || d > this.def.engage) {
      want = angToP;                                    // 追击
    } else if (d < this.def.keep * 0.65) {
      want = angToP + Math.PI * 0.85 * this.strafeDir;  // 太近，拉开并侧移
    } else {
      want = angToP + (Math.PI / 2) * this.strafeDir;   // 交战距离，环绕走位
    }

    this.strafeTimer -= dt;
    if (this.strafeTimer <= 0) {
      this.strafeTimer = rand(1.8, 4);
      if (Math.random() < 0.55) this.strafeDir *= -1;
    }

    const speedMul = (!hasLos || d > this.def.engage) ? 1 : 0.62; // 交战时慢速走位
    const before = { x: this.x, y: this.y };
    this.angle = turnToward(this.angle, want, 5.2 * dt);
    // 只有车身大致对准目标才全速（履带手感）
    let diff = Math.abs(((want - this.angle) % TAU + TAU) % TAU);
    if (diff > Math.PI) diff = TAU - diff;
    const eff = diff < 1.1 ? speedMul : speedMul * 0.35;
    this._eff = eff;
    this.x += Math.cos(this.angle) * this.speed * eff * dt;
    this.y += Math.sin(this.angle) * this.speed * eff * dt;
    Map.resolveCircle(this);
    this.vx = (this.x - before.x) / dt;
    this.vy = (this.y - before.y) / dt;

    // ── 卡墙检测（任何移动状态）──
    const moved = dist(before.x, before.y, this.x, this.y);
    if (moved < this.speed * eff * dt * 0.3) {
      this.stuck += dt;
      if (this.stuck > 0.45) {
        this.stuck = 0;
        this.unstickTimer = rand(0.5, 0.9);
        this.unstickAngle = want + (Math.random() < 0.5 ? 1 : -1) * rand(1.2, 2.1);
      }
    } else this.stuck = Math.max(0, this.stuck - dt);

    // ── 开火 ──
    this.reload -= dt;
    if (this.reload <= 0 && hasLos && d < this.def.engage && p.alive) {
      this.reload = this.reloadTime * rand(0.85, 1.2);
      this.fireAt(game);
    }
  }
}

/* ────────── 战斗主控 ────────── */
const Game = {
  state: "idle",          // idle | running | paused | over
  mode: null,             // "vs1" | "horde"
  player: null,
  enemies: [],
  bullets: [],
  drops: [],
  particles: [],
  floats: [],
  tracks: [],
  shakeAmt: 0,
  wave: 0,
  waveQueue: [],
  waveState: "idle",      // idle | fighting | intermission
  interTimer: 0,
  spawnTimer: 0,
  time: 0,
  _raf: 0,
  _lastTs: 0,
  groundCanvas: null,

  /* ── 开战 ── */
  start(mode) {
    this.mode = mode;
    this.state = "running";
    this.enemies = []; this.bullets = []; this.drops = [];
    this.particles = []; this.floats = []; this.tracks = [];
    this.shakeAmt = 0; this.time = 0;
    this.wave = 0; this.waveQueue = []; this.waveState = "idle"; this.interTimer = 0;

    Map.generate(mode === "vs1" ? 0.10 : 0.115);
    this.buildGround();

    this.player = new PlayerTank();
    this.player.equip();

    if (mode === "vs1") {
      const wins = Save.data.stats.vs1Wins;
      const type = wins >= VS1_GROWTH.heavyFrom ? "heavy" : "standard";
      const hpMul = Math.min(VS1_GROWTH.hpCap, 1 + wins * VS1_GROWTH.hpPerWin);
      const dmgMul = Math.min(VS1_GROWTH.dmgCap, 1 + wins * VS1_GROWTH.dmgPerWin);
      const e = new EnemyTank(type, CFG.WORLD_W / 2, 110, { hp: hpMul, dmg: dmgMul });
      this.enemies.push(e);
      UI.announce(`敌 ${e.def.name} · ${wins > 0 ? `强化 ×${wins}` : "标准战力"}`, 1800);
    } else {
      this.nextWave();
    }
    Save.data.stats.battles++;
    Save.persist();
    UI.refreshHudStatic(this);
    UI.refreshAmmoBar(this);
    this.loopStart();
  },

  loopStart() {
    cancelAnimationFrame(this._raf);
    this._lastTs = performance.now();
    const tick = (ts) => {
      this._raf = requestAnimationFrame(tick);
      const dt = Math.min(0.033, (ts - this._lastTs) / 1000);
      this._lastTs = ts;
      if (this.state === "running") this.update(dt);
      this.render();
    };
    this._raf = requestAnimationFrame(tick);
  },

  stop() {
    cancelAnimationFrame(this._raf);
    this.state = "idle";
  },

  pause() {
    if (this.state === "running") { this.state = "paused"; UI.showPause(true); }
  },
  resume() {
    if (this.state === "paused") { this.state = "running"; UI.showPause(false); }
  },

  /* ── 波次（1v多）── */
  nextWave() {
    this.wave++;
    const w = this.wave;
    const isBossWave = w % WAVES.BOSS_EVERY === 0;
    const q = [];
    // Boss 波：1 个指挥重坦 + 少量护卫；普通波：标准配置
    const nStd = isBossWave ? Math.min(4, Math.floor(w / 5)) : Math.min(8, 1 + Math.ceil(w / 2));
    const nScout = isBossWave ? 2 : Math.min(6, Math.floor(w / 2));
    const nHeavy = (!isBossWave && w >= 3) ? Math.min(4, Math.floor((w - 1) / 3)) : 0;
    if (isBossWave) q.push("boss");
    for (let i = 0; i < nStd; i++) q.push("standard");
    for (let i = 0; i < nScout; i++) q.push("scout");
    for (let i = 0; i < nHeavy; i++) q.push("heavy");
    // 打乱顺序（Boss 固定首位出场）
    const rest = q.slice(isBossWave ? 1 : 0);
    for (let i = rest.length - 1; i > 0; i--) {
      const j = randi(0, i);
      [rest[i], rest[j]] = [rest[j], rest[i]];
    }
    this.waveQueue = isBossWave ? ["boss", ...rest] : rest;

    // 组成预览文本
    const parts = [];
    if (isBossWave) parts.push("⚠ 指挥重坦");
    if (nStd) parts.push(`主战×${nStd}`);
    if (nScout) parts.push(`侦察×${nScout}`);
    if (nHeavy) parts.push(`重装×${nHeavy}`);
    this.wavePreview = parts.join(" ");

    this.waveState = "intermission";
    this.interTimer = 3.2;
    UI.announce(isBossWave ? `⚠ 第 ${this.wave} 波 · 指挥重坦来袭` : `第 ${this.wave} 波`, 1600);
    UI.refreshHudStatic(this);
    SFX.wave();
  },

  spawnPoint() {
    // 上边三处 + 左右两侧各一处，选距玩家最远且无遮挡的
    const pts = [
      { x: CFG.WORLD_W * 0.2, y: 70 }, { x: CFG.WORLD_W * 0.5, y: 70 }, { x: CFG.WORLD_W * 0.8, y: 70 },
      { x: 70, y: CFG.WORLD_H * 0.25 }, { x: CFG.WORLD_W - 70, y: CFG.WORLD_H * 0.25 },
    ];
    let best = pts[0], bestD = -1;
    for (const p of pts) {
      const d = dist(p.x, p.y, this.player.x, this.player.y) + rand(0, 150);
      if (d > bestD) { bestD = d; best = p; }
    }
    return best;
  },

  update(dt) {
    this.time += dt;
    const p = this.player;

    p.update(dt, this);
    for (const e of this.enemies) e.update(dt, this);
    for (const b of this.bullets) b.update(dt, this);

    // 坦克间推开
    const tanks = [p, ...this.enemies].filter((t) => t.alive);
    for (let i = 0; i < tanks.length; i++) {
      for (let j = i + 1; j < tanks.length; j++) {
        const a = tanks[i], b2 = tanks[j];
        const d = dist(a.x, a.y, b2.x, b2.y);
        const min = a.radius + b2.radius;
        if (d < min && d > 0.01) {
          const push = (min - d) / 2;
          const nx = (b2.x - a.x) / d, ny = (b2.y - a.y) / d;
          a.x -= nx * push; a.y -= ny * push;
          b2.x += nx * push; b2.y += ny * push;
          Map.resolveCircle(a); Map.resolveCircle(b2);
        }
      }
    }

    // 清理（被击毁的敌车保留为残骸）
    this.bullets = this.bullets.filter((b) => !b.dead);
    this.enemies = this.enemies.filter((e) => e.alive || e.wreck);

    // 粒子/飘字/掉落寿命
    for (const pt of this.particles) {
      pt.life -= dt;
      pt.x += pt.vx * dt; pt.y += pt.vy * dt;
      pt.vx *= 0.92; pt.vy *= 0.92;
    }
    this.particles = this.particles.filter((pt) => pt.life > 0);
    for (const f of this.floats) { f.life -= dt; f.y -= 34 * dt; }
    this.floats = this.floats.filter((f) => f.life > 0);
    for (const d of this.drops) d.life -= dt;
    this.drops = this.drops.filter((d) => !d.dead && d.life > 0);

    this.shakeAmt *= Math.pow(0.02, dt);

    // ── 波次推进 ──
    if (this.mode === "horde" && this.state === "running") {
      if (this.waveState === "intermission") {
        this.interTimer -= dt;
        UI.setWaveLabel(`第 ${this.wave} 波来袭 ${Math.max(0, this.interTimer).toFixed(1)}s · ${this.wavePreview || ""}`);
        if (this.interTimer <= 0) {
          this.waveState = "fighting";
          this.spawnTimer = 0.4;
          UI.setWaveLabel(`第 ${this.wave} 波 · 残敌 ${this.waveQueue.length + this.enemies.filter(e => e.alive).length}`);
        }
      } else if (this.waveState === "fighting") {
        // 补兵：场上上限
        const alive = this.enemies.filter((e) => e.alive).length;
        if (this.waveQueue.length && alive < Math.min(WAVES.ON_FIELD_MAX, this.waveQueue.length + alive)) {
          this.spawnTimer -= dt;
          if (this.spawnTimer <= 0) {
            this.spawnTimer = this.waveQueue[0] === "boss" ? 0.1 : rand(0.9, 1.6);
            const type = this.waveQueue.shift();
            const sp = this.spawnPoint();
            // Boss 随波次成长
            const buffs = type === "boss"
              ? { hp: 1 + (this.wave - WAVES.BOSS_EVERY) * 0.06, dmg: 1 + (this.wave - WAVES.BOSS_EVERY) * 0.03 }
              : {};
            this.enemies.push(new EnemyTank(type, sp.x + rand(-20, 20), sp.y + rand(-14, 14), buffs));
          }
        }
        if (!this.waveQueue.length && !this.enemies.some((e) => e.alive)) {
          // 清波奖励 + 战地维修
          const bonus = REWARDS.WAVE_BASE + REWARDS.WAVE_STEP * this.wave;
          p.score += bonus;
          this.floatText(CFG.WORLD_W / 2, CFG.WORLD_H / 2, `清波奖励 +${bonus}`, "#ffd76b");
          const heal = Math.min(WAVES.WAVE_HEAL, p.maxHp - p.hp);
          if (heal > 0) {
            p.hp += heal;
            this.floatText(p.x, p.y - 36, `战地维修 +${Math.round(heal)}`, "#7ee87e");
          }
          SFX.win();
          if (this.wave > Save.data.stats.bestWave) Save.data.stats.bestWave = this.wave;
          this.nextWave();
        } else {
          UI.setWaveLabel(`第 ${this.wave} 波 · 残敌 ${this.waveQueue.length + this.enemies.filter(e => e.alive).length}`);
        }
      }
    }

    // ── 胜负 ──
    if (this.state === "running") {
      if (!p.alive) this.finish(false, "装甲尽毁，战车损毁");
      else if (this.mode === "vs1" && !this.enemies.some((e) => e.alive)) this.finish(true, "敌方指挥车已被歼灭");
    }

    UI.updateHud(this);
  },

  /* ── 死亡处理 ── */
  onTankDeath(tank, src) {
    const px = tank.x, py = tank.y;
    tank.wreck = true;
    this.explodeFX(px, py, tank.size);
    SFX.explode(tank.size > 1.1);
    this.shake(tank.size > 1.1 ? 10 : 6);

    if (!tank.isPlayer) {
      this.player.kills++;
      Save.data.stats.kills++;
      const gain = tank.def.score;
      this.player.score += gain;
      this.floatText(px, py - 26, `+${gain}`, "#ffd76b");

      // 连杀奖励（时间窗口内连续击毁）
      const p = this.player;
      p.combo = p.comboTimer > 0 ? p.combo + 1 : 1;
      p.comboTimer = COMBO.WINDOW;
      if (p.combo >= 2) {
        const comboBonus = COMBO.BONUS_PER * p.combo;
        p.score += comboBonus;
        this.floatText(px, py - 50, `×${p.combo} 连杀 +${comboBonus}`, "#ff9d6b");
      }

      // 掉落：Boss 必掉双份；普通敌概率掉落
      if (this.mode === "horde") {
        const drops = tank.type === "boss" ? 2 : (Math.random() < CFG.DROP_CHANCE ? 1 : 0);
        for (let i = 0; i < drops; i++) {
          const kinds = ["repair", "ammo", "shield"];
          const kind = kinds[randi(0, 2)];
          const label = kind === "repair" ? "+25 🔧" : kind === "shield" ? "+25 🛡" : "弹药 +2";
          this.drops.push({ x: px + rand(-22, 22), y: py + rand(-22, 22), kind, label, life: CFG.DROP_LIFE, t: rand(0, TAU) });
        }
      }
    }
  },

  /* ── 结算 ── */
  finish(win, reason) {
    if (this.state === "over") return;
    this.state = "over";
    const p = this.player;
    let bonus = 0, bonusLabel = "";
    if (win) {
      if (this.mode === "vs1") {
        bonus = REWARDS.VS1_WIN;
        bonusLabel = "1v1 胜利奖励";
        Save.data.stats.vs1Wins++;
      }
      // horde 无"最终胜利"，不会走到这（除非后续加无尽层数封顶）
    }
    if (bonus) p.score += bonus;

    Save.data.points += p.score;
    if (this.mode === "horde" && this.wave > Save.data.stats.bestWave) Save.data.stats.bestWave = this.wave;
    Save.persist();
    SFX[win ? "win" : "lose"]();

    UI.showResult({
      win, mode: this.mode, reason, bonus, bonusLabel,
      kills: p.kills, score: p.score,
      wave: this.mode === "horde" ? this.wave : 0,
    });
  },

  /* ── 按键事件（由 Input 转发）── */
  toggleAutopilot() {
    const p = this.player;
    if (!p || !p.alive || this.state !== "running") return;
    p.autopilot = !p.autopilot;
    SFX.click();
    UI.announce(p.autopilot ? "🤖 AI 托管已开启 · 按 T 或点 🤖 切回" : "🎮 已切回手动操控");
  },

  onKey(k) {
    if (this.state === "over") {
      // 结算界面：Esc 直接返回基地
      if (k === "escape") {
        this.stop();
        UI.hideOverlays();
        UI.goto("menu");
      }
      return;
    }
    if (this.state !== "running" && this.state !== "paused") {
      // 菜单界面 Esc 无操作
      return;
    }
    if (k === "p" || k === "escape") {
      this.state === "paused" ? this.resume() : this.pause();
      return;
    }
    if (this.state !== "running") return;
    // 切换 AI 托管
    if (k === "t") { this.toggleAutopilot(); return; }
    // 切换弹种
    const slotKey = { 1: "std", 2: "ap", 3: "he", 4: "sg", 5: "ms" }[k];
    if (slotKey && this.player.ammo[slotKey] > 0) {
      this.player.curAmmo = slotKey;
      UI.refreshAmmoBar(this);
      SFX.click();
    }
    if (k === "h") this.player.useRepair(this);
  },

  /* ── 特效工具 ── */
  nearestEnemy(x, y) {
    let best = null, bd = Infinity;
    for (const e of this.enemies) {
      if (!e.alive) continue;
      const d = dist(x, y, e.x, e.y);
      if (d < bd) { bd = d; best = e; }
    }
    return best;
  },

  addParticle(x, y, vx, vy, life, size, color) {
    if (this.particles.length > (TOUCH_DEVICE ? 230 : 420)) return;
    this.particles.push({ x, y, vx, vy, life, maxLife: life, size, color });
  },

  sparks(x, y, n) {
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(60, 220);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.15, 0.35), rand(1.5, 3), Math.random() < 0.5 ? "#ffd76b" : "#ff9d6b");
    }
  },

  debris(cx, cy, n) {
    const x = cx * CFG.TILE + CFG.TILE / 2, y = cy * CFG.TILE + CFG.TILE / 2;
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(40, 160);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.7), rand(2, 5), Math.random() < 0.7 ? "#9c6b4a" : "#7a5238");
    }
  },

  explodeFX(x, y, size) {
    const n = Math.round((16 + size * 12) * (TOUCH_DEVICE ? 0.6 : 1));
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU), sp = rand(30, 260 * size);
      const c = Math.random() < 0.35 ? "#ffe8a8" : (Math.random() < 0.5 ? "#ff9d3c" : "#e2543e");
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.3, 0.9), rand(2, 6 * size), c);
    }
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.16, maxLife: 0.16, size: 34 * size, color: "#fff3c4", flash: true });
  },

  /* 弹射落点溅射：小范围伤害 + 冲击环特效（不伤发射方） */
  splash(x, y, src) {
    const r = CFG.BOUNCE.SPLASH_R;
    const mul = CFG.BOUNCE.SPLASH_MUL;
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.2, maxLife: 0.2, size: r * 0.45, color: src?.color || "#ffe9a8", flash: true });
    this.particles.push({ x, y, vx: 0, vy: 0, life: 0.32, maxLife: 0.32, size: r, color: src?.color || "#ffe9a8", ring: true });
    for (let i = 0; i < 4; i++) {
      const a = rand(0, TAU), sp = rand(40, 130);
      this.addParticle(x, y, Math.cos(a) * sp, Math.sin(a) * sp, rand(0.12, 0.28), rand(1.5, 3), "#ffd76b");
    }
    const victims = src && src.owner === "player" ? this.enemies : [this.player];
    for (const t of victims) {
      if (!t || !t.alive || t.spawnGrace > 0) continue;
      const d = dist(x, y, t.x, t.y);
      if (d < r + t.radius) {
        const fall = 1 - clamp((d - t.radius) / r, 0, 1) * 0.5;
        t.takeHit((src?.dmg || 0) * mul * fall, this, src);
      }
    }
  },

  explode(x, y, radius, dmg, owner, srcBullet) {
    this.explodeFX(x, y, srcBullet && srcBullet.blast > 80 ? 0.8 : 0.55);
    SFX.explode(radius > 85);
    this.shake(5);
    const victims = owner === "player" ? this.enemies : [this.player];
    for (const t of victims) {
      if (!t || !t.alive || t.spawnGrace > 0) continue;
      const d = dist(x, y, t.x, t.y);
      if (d < radius + t.radius) {
        const fall = 1 - clamp((d - t.radius) / radius, 0, 1) * 0.55;
        t.takeHit(dmg * fall, this, srcBullet);
      }
    }
    // 范围拆墙
    const c0x = Math.floor((x - radius) / CFG.TILE), c1x = Math.floor((x + radius) / CFG.TILE);
    const c0y = Math.floor((y - radius) / CFG.TILE), c1y = Math.floor((y + radius) / CFG.TILE);
    for (let cy = c0y; cy <= c1y; cy++) {
      for (let cx = c0x; cx <= c1x; cx++) {
        if (Map.at(cx, cy) !== CFG.WALL.BRICK) continue;
        const d = dist(x, y, cx * CFG.TILE + 20, cy * CFG.TILE + 20);
        if (d < radius + 18) Map.damageBrick(cx, cy, dmg);
      }
    }
  },

  floatText(x, y, text, color) {
    this.floats.push({ x, y, text, color, life: 1.1 });
  },

  addTrack(tank) {
    if (this.tracks.length > 460) this.tracks.splice(0, 60);
    const side = 14 * tank.size;
    const px = Math.cos(tank.angle + Math.PI / 2), py = Math.sin(tank.angle + Math.PI / 2);
    this.tracks.push({ x: tank.x + px * side, y: tank.y + py * side, a: tank.angle, life: 6 });
    this.tracks.push({ x: tank.x - px * side, y: tank.y - py * side, a: tank.angle, life: 6 });
  },

  shake(amt) { this.shakeAmt = Math.min(14, this.shakeAmt + amt); },

  /* ── 地面预渲染 ── */
  buildGround() {
    const c = this.groundCanvas || (this.groundCanvas = document.createElement("canvas"));
    c.width = CFG.WORLD_W; c.height = CFG.WORLD_H;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, CFG.WORLD_H);
    grd.addColorStop(0, "#252a1d");
    grd.addColorStop(0.5, "#2b3122");
    grd.addColorStop(1, "#232819");
    g.fillStyle = grd;
    g.fillRect(0, 0, CFG.WORLD_W, CFG.WORLD_H);
    // 网格
    g.strokeStyle = "rgba(255,255,255,0.03)";
    g.lineWidth = 1;
    for (let x = 0; x <= CFG.WORLD_W; x += CFG.TILE) { g.beginPath(); g.moveTo(x + .5, 0); g.lineTo(x + .5, CFG.WORLD_H); g.stroke(); }
    for (let y = 0; y <= CFG.WORLD_H; y += CFG.TILE) { g.beginPath(); g.moveTo(0, y + .5); g.lineTo(CFG.WORLD_W, y + .5); g.stroke(); }
    // 随机地面污渍
    for (let i = 0; i < 46; i++) {
      g.fillStyle = `rgba(${randi(10, 30)},${randi(16, 34)},10,${rand(0.05, 0.13)})`;
      g.beginPath();
      g.ellipse(rand(0, CFG.WORLD_W), rand(0, CFG.WORLD_H), rand(18, 90), rand(12, 60), rand(0, TAU), 0, TAU);
      g.fill();
    }
    // 中线战术标记
    g.strokeStyle = "rgba(201,179,126,0.07)";
    g.setLineDash([14, 18]);
    g.lineWidth = 2;
    g.beginPath(); g.moveTo(CFG.WORLD_W / 2, 0); g.lineTo(CFG.WORLD_W / 2, CFG.WORLD_H); g.stroke();
    g.setLineDash([]);
  },

  /* ────────── 渲染 ────────── */
  render() {
    const canvas = document.getElementById("game-canvas");
    const g = canvas.getContext("2d");
    const W = CFG.WORLD_W, H = CFG.WORLD_H;

    g.save();
    // 屏幕震动
    if (this.shakeAmt > 0.3) {
      g.translate(rand(-this.shakeAmt, this.shakeAmt), rand(-this.shakeAmt, this.shakeAmt));
    }

    g.drawImage(this.groundCanvas, 0, 0);

    // 履带印
    g.fillStyle = "rgba(18, 20, 12, 0.35)";
    for (const t of this.tracks) {
      t.life -= 0.016;
      if (t.life <= 0) continue;
      g.save();
      g.translate(t.x, t.y);
      g.rotate(t.a);
      g.globalAlpha = clamp(t.life / 6, 0, 1) * 0.5;
      g.fillRect(-4, -2.4, 8, 4.8);
      g.restore();
    }
    this.tracks = this.tracks.filter((t) => t.life > 0);
    g.globalAlpha = 1;

    // 掉落物
    for (const d of this.drops) {
      const bob = Math.sin(this.time * 4 + d.t) * 3;
      g.save();
      g.translate(d.x, d.y + bob);
      g.fillStyle = "rgba(0,0,0,0.3)";
      g.beginPath(); g.ellipse(0, 12 - bob, 11, 4, 0, 0, TAU); g.fill();
      g.fillStyle = "rgba(30,36,24,0.92)";
      g.strokeStyle = "#8fa06e";
      g.lineWidth = 1.5;
      g.beginPath(); g.roundRect(-11, -11, 22, 22, 4); g.fill(); g.stroke();
      g.font = "13px sans-serif";
      g.textAlign = "center"; g.textBaseline = "middle";
      g.fillStyle = "#ffd76b";
      g.fillText(d.kind === "repair" ? "🔧" : d.kind === "shield" ? "🛡" : "📦", 0, 1);
      // 寿命提示
      if (d.life < 5) {
        g.globalAlpha = 0.4 + 0.4 * Math.sin(this.time * 10);
        g.strokeStyle = "#e2543e";
        g.beginPath(); g.roundRect(-11, -11, 22, 22, 4); g.stroke();
        g.globalAlpha = 1;
      }
      g.restore();
    }

    // 墙体
    for (let cy = 0; cy < CFG.ROWS; cy++) {
      for (let cx = 0; cx < CFG.COLS; cx++) {
        const v = Map.at(cx, cy);
        if (v === CFG.WALL.EMPTY) continue;
        const x = cx * CFG.TILE, y = cy * CFG.TILE;
        if (v === CFG.WALL.BRICK) {
          const hpRatio = Map.brickHpAt(cx, cy) / CFG.WALL.BRICK_HP;
          g.fillStyle = "#7a4a34";
          g.fillRect(x, y, CFG.TILE, CFG.TILE);
          // 砖缝
          g.strokeStyle = "rgba(0,0,0,0.35)";
          g.lineWidth = 2;
          g.beginPath();
          g.moveTo(x, y + 13); g.lineTo(x + CFG.TILE, y + 13);
          g.moveTo(x, y + 27); g.lineTo(x + CFG.TILE, y + 27);
          g.moveTo(x + 20, y); g.lineTo(x + 20, y + 13);
          g.moveTo(x + 10, y + 13); g.lineTo(x + 10, y + 27);
          g.moveTo(x + 30, y + 13); g.lineTo(x + 30, y + 27);
          g.moveTo(x + 20, y + 27); g.lineTo(x + 20, y + CFG.TILE);
          g.stroke();
          // 受损裂纹
          if (hpRatio < 0.66) {
            g.strokeStyle = "rgba(0,0,0,0.55)";
            g.beginPath();
            g.moveTo(x + 8, y + 4); g.lineTo(x + 16, y + 18); g.lineTo(x + 10, y + 32);
            if (hpRatio < 0.33) { g.moveTo(x + 30, y + 6); g.lineTo(x + 24, y + 20); g.lineTo(x + 32, y + 34); }
            g.stroke();
          }
          g.strokeStyle = "rgba(0,0,0,0.4)";
          g.strokeRect(x + .5, y + .5, CFG.TILE - 1, CFG.TILE - 1);
        } else {
          // 钢墙
          g.fillStyle = "#5b6570";
          g.fillRect(x, y, CFG.TILE, CFG.TILE);
          g.fillStyle = "#48515b";
          g.fillRect(x + 4, y + 4, CFG.TILE - 8, CFG.TILE - 8);
          g.fillStyle = "#6e7a86";
          // 铆钉
          for (const [rx, ry] of [[9, 9], [31, 9], [9, 31], [31, 31]]) {
            g.beginPath(); g.arc(x + rx, y + ry, 2.4, 0, TAU); g.fill();
          }
          g.strokeStyle = "#2f353c";
          g.lineWidth = 1.5;
          g.strokeRect(x + .75, y + .75, CFG.TILE - 1.5, CFG.TILE - 1.5);
        }
      }
    }

    // 坦克
    for (const t of [...this.enemies, this.player]) {
      if (!t) continue;
      this.drawTank(g, t);
    }

    // 子弹
    for (const b of this.bullets) {
      // 拖尾
      g.strokeStyle = b.color;
      g.globalAlpha = 0.4;
      g.lineWidth = b.radius * 1.4;
      g.beginPath();
      g.moveTo(b.px, b.py);
      g.lineTo(b.x, b.y);
      g.stroke();
      g.globalAlpha = 1;
      g.fillStyle = b.color;
      g.beginPath();
      g.arc(b.x, b.y, b.radius, 0, TAU);
      g.fill();
      // 弹射过的炮弹加白色描边提示
      if (b.bounced) {
        g.strokeStyle = "rgba(255,255,255,0.8)";
        g.lineWidth = 1.5;
        g.beginPath(); g.arc(b.x, b.y, b.radius + 2.2, 0, TAU); g.stroke();
      }
      if (b.homing) { // 导弹尾焰
        g.fillStyle = "#ffb35c";
        const a = Math.atan2(b.vy, b.vx);
        g.beginPath();
        g.arc(b.x - Math.cos(a) * 8, b.y - Math.sin(a) * 8, 2.6, 0, TAU);
        g.fill();
      }
    }

    // 粒子
    for (const p of this.particles) {
      const a = clamp(p.life / p.maxLife, 0, 1);
      if (p.flash) {
        g.globalAlpha = a * 0.85;
        g.fillStyle = p.color;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1.4 - a * 0.4), 0, TAU); g.fill();
      } else if (p.ring) {
        // 溅射冲击环：向外扩散淡出
        g.globalAlpha = a * 0.8;
        g.strokeStyle = p.color;
        g.lineWidth = 2.5;
        g.beginPath(); g.arc(p.x, p.y, p.size * (1.35 - a), 0, TAU); g.stroke();
      } else {
        g.globalAlpha = a;
        g.fillStyle = p.color;
        g.fillRect(p.x - p.size / 2, p.y - p.size / 2, p.size, p.size);
      }
    }
    g.globalAlpha = 1;

    // 飘字
    g.font = "bold 17px 'PingFang SC', sans-serif";
    g.textAlign = "center";
    for (const f of this.floats) {
      g.globalAlpha = clamp(f.life, 0, 1);
      g.fillStyle = "#000";
      g.fillText(f.text, f.x + 1, f.y + 1);
      g.fillStyle = f.color;
      g.fillText(f.text, f.x, f.y);
    }
    g.globalAlpha = 1;

    g.restore();
  },

  drawTank(g, t) {
    if (!t.alive) {
      // 残骸：烧黑的车体
      g.save();
      g.translate(t.x, t.y);
      g.rotate(t.angle);
      g.fillStyle = "rgba(20,18,14,0.85)";
      const s = t.size;
      g.beginPath(); g.roundRect(-22 * s, -16 * s, 44 * s, 32 * s, 5); g.fill();
      g.restore();
      return;
    }

    const s = t.size;
    g.save();
    g.translate(t.x, t.y);

    // 出生护罩
    if (t.spawnGrace > 0) {
      g.globalAlpha = 0.35 + 0.25 * Math.sin(this.time * 18);
      g.strokeStyle = "#8fe3ff";
      g.lineWidth = 2.5;
      g.beginPath(); g.arc(0, 0, t.radius + 8, 0, TAU); g.stroke();
      g.globalAlpha = 1;
    }

    // 阴影
    g.fillStyle = "rgba(0,0,0,0.32)";
    g.save();
    g.rotate(t.angle);
    g.beginPath();
    g.roundRect(-21 * s + 3, -17 * s + 4, 42 * s, 34 * s, 6);
    g.fill();
    g.restore();

    g.rotate(t.angle);

    // 履带
    g.fillStyle = "#22251b";
    g.beginPath(); g.roundRect(-22 * s, -18 * s, 44 * s, 10 * s, 3); g.fill();
    g.beginPath(); g.roundRect(-22 * s, 8 * s, 44 * s, 10 * s, 3); g.fill();
    // 履带齿
    g.fillStyle = "rgba(255,255,255,0.08)";
    for (let i = -3; i <= 3; i++) {
      g.fillRect(i * 6.4 * s - 1, -18 * s, 2, 10 * s);
      g.fillRect(i * 6.4 * s - 1, 8 * s, 2, 10 * s);
    }

    // 车身
    const grad = g.createLinearGradient(0, -14 * s, 0, 14 * s);
    grad.addColorStop(0, t.bodyColor);
    grad.addColorStop(1, this.shade(t.bodyColor, -22));
    g.fillStyle = grad;
    g.strokeStyle = "rgba(0,0,0,0.5)";
    g.lineWidth = 2;
    g.beginPath(); g.roundRect(-19 * s, -13 * s, 38 * s, 26 * s, 4); g.fill(); g.stroke();

    // 受击闪红
    if (t.hurtFlash > 0) {
      t.hurtFlash -= 0.016;
      g.fillStyle = `rgba(255,80,60,${t.hurtFlash * 2})`;
      g.beginPath(); g.roundRect(-19 * s, -13 * s, 38 * s, 26 * s, 4); g.fill();
    }

    g.rotate(-t.angle);
    // 炮塔
    g.rotate(t.turret);
    // 炮管后座
    const kick = t.kick > 0 ? (t.kick--, t.kick * 0.8) : 0;
    g.fillStyle = this.shade(t.turretColor, -18);
    g.fillRect(8 * s - kick, -3.2 * s, t.muzzleLen, 6.4 * s);
    g.fillStyle = t.turretColor;
    g.beginPath(); g.arc(0, 0, 10.5 * s, 0, TAU); g.fill();
    g.strokeStyle = "rgba(0,0,0,0.45)";
    g.lineWidth = 1.6;
    g.stroke();
    // 舱盖
    g.fillStyle = this.shade(t.turretColor, 16);
    g.beginPath(); g.arc(-2 * s, 0, 4.5 * s, 0, TAU); g.fill();

    // 炮口闪光
    if (t.flash > 0) {
      t.flash -= 0.016;
      g.globalAlpha = clamp(t.flash / 0.09, 0, 1);
      g.fillStyle = "#fff3c4";
      g.beginPath(); g.arc(t.muzzleLen + 8 * s, 0, 8 * s, 0, TAU); g.fill();
      g.fillStyle = "#ffb35c";
      g.beginPath(); g.arc(t.muzzleLen + 3 * s, 0, 11 * s, 0, TAU); g.fill();
      g.globalAlpha = 1;
    }
    g.rotate(-t.turret);
    g.restore();

    // 玩家护盾圈
    if (t.isPlayer && t.shield > 0) {
      g.save();
      const a = t.shieldFlash > 0 ? (t.shieldFlash -= 0.016, 0.75) : 0.3;
      g.strokeStyle = `rgba(109,193,255,${a})`;
      g.lineWidth = t.shieldFlash > 0 ? 3.5 : 2;
      g.beginPath(); g.arc(t.x, t.y, t.radius + 7, 0, TAU); g.stroke();
      g.restore();
    }

    // 敌人血条（Boss 常显加宽；普通敌人受击后 3 秒内显示）
    if (!t.isPlayer) {
      if (t.hp < t.maxHp) t.showHpUntil = this.time + 3;
      if (this.time < t.showHpUntil || t.type === "boss") {
        const w = t.type === "boss" ? 56 : 40 * s;
        g.fillStyle = "rgba(0,0,0,0.65)";
        g.fillRect(t.x - w / 2, t.y - t.radius - 14, w, 5);
        g.fillStyle = t.hp / t.maxHp > 0.4 ? "#5fd35f" : "#e2543e";
        g.fillRect(t.x - w / 2, t.y - t.radius - 14, w * (t.hp / t.maxHp), 5);
        if (t.type === "boss") {
          g.font = "bold 11px 'PingFang SC', sans-serif";
          g.textAlign = "center";
          g.fillStyle = "#ff8f7a";
          g.fillText("指挥重坦", t.x, t.y - t.radius - 19);
        }
      }
    }
  },

  shade(hex, amt) {
    const n = parseInt(hex.slice(1), 16);
    const r = clamp(((n >> 16) & 255) + amt, 0, 255);
    const gg = clamp(((n >> 8) & 255) + amt, 0, 255);
    const b = clamp((n & 255) + amt, 0, 255);
    return `rgb(${r},${gg},${b})`;
  },
};

// Input 按键回调入口
window.Game = Game;
