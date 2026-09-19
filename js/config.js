/* ══════════════════════════════════════════════
   config.js — 全局配置：战场、弹种、商品、敌人
   ══════════════════════════════════════════════ */
"use strict";

const CFG = {
  WORLD_W: 1600,          // 战场逻辑宽度(px)
  WORLD_H: 1000,          // 战场逻辑高度(px)
  TILE: 40,               // 网格尺寸
  COLS: 40, ROWS: 25,     // 40 x 25 格

  // 玩家基础数值
  PLAYER: {
    hp: 100, speed: 195, radius: 20,   // px/s
    reload: 0.55,                       // 主炮冷却(秒)
    bodyColor: "#4e8f5e", turretColor: "#3c6f4a",
  },

  // 机枪
  MG: {
    damage: 7, speed: 560, reload: 0.075,
    spread: 0.09, range: 620, pack: 200, // pack: 每包弹药数
  },

  // 墙体
  WALL: {
    BRICK_HP: 60,
    STEEL: 2, BRICK: 1, EMPTY: 0,
  },

  // 掉落
  DROP_CHANCE: 0.26,
  DROP_LIFE: 25,          // 秒

  // 炮弹弹射（碰墙反弹）与溅射
  BOUNCE: {
    SPLASH_R: 46,         // 弹射落点溅射半径
    SPLASH_MUL: 0.3,      // 溅射伤害 = 直射伤害 × 此倍率
    WALL_MUL: 0.5,        // 弹射时对砖墙的伤害倍率
  },
};

/* ── 弹种定义（主炮）── */
// order 即战斗中按 1~5 切换的顺序；key "std" 为无限标准弹
const AMMO = {
  std: {
    key: "std", slot: 1, name: "标准弹", icon: "●",
    damage: 26, speed: 460, radius: 4.5, reload: 0.55,
    wallDamage: 26, color: "#ffe9a8", infinite: true,
    bounce: 1,   // 可弹射 1 次
    desc: "制式穿甲弹，弹药无限，性能均衡；碰墙可弹射一次。",
  },
  ap: {
    key: "ap", slot: 2, name: "穿甲弹", icon: "➤",
    damage: 62, speed: 640, radius: 5, reload: 0.7,
    wallDamage: 62, color: "#cfe8ff",
    bounce: 1,
    desc: "钨芯穿甲弹，单发伤害极高，几乎一炮拆毁砖墙；碰墙可弹射一次。",
  },
  he: {
    key: "he", slot: 3, name: "高爆弹", icon: "☢",
    damage: 46, speed: 350, radius: 6, reload: 0.85,
    wallDamage: 55, blast: 92, blastDamage: 30, color: "#ffb35c",
    desc: "触地即爆，对墙体与近距离目标造成范围伤害。",
  },
  sg: {
    key: "sg", slot: 4, name: "榴霰弹", icon: "⁙",
    damage: 17, speed: 470, radius: 3.5, reload: 0.8,
    pellets: 5, spread: 0.34, life: 0.42, wallDamage: 12, color: "#ffd7f2",
    desc: "一次齐射 5 枚弹丸呈扇面飞散，近身清场利器（每次射击消耗 1 发）。",
  },
  ms: {
    key: "ms", slot: 5, name: "追踪导弹", icon: "◎",
    damage: 78, speed: 300, maxSpeed: 520, radius: 5.5, reload: 1.0,
    homing: 4.2, blast: 70, blastDamage: 24, wallDamage: 40, color: "#ff8f6b",
    desc: "自动锁定最近的敌车，转弯追踪直至命中。",
  },
};

/* ── 敌人类型 ── */
const ENEMIES = {
  scout: {
    name: "侦察车", hp: 55, speed: 150, radius: 17,
    reload: 1.15, bulletDamage: 9, bulletSpeed: 430,
    engage: 430, keep: 240, score: 40,
    body: "#c9a23a", turret: "#a07f26", size: 0.85,
  },
  standard: {
    name: "主战坦克", hp: 110, speed: 105, radius: 20,
    reload: 1.6, bulletDamage: 15, bulletSpeed: 400,
    engage: 490, keep: 260, score: 50,
    body: "#5f7a4a", turret: "#48603a", size: 1.0,
  },
  heavy: {
    name: "重装坦克", hp: 240, speed: 72, radius: 24,
    reload: 2.3, bulletDamage: 26, bulletSpeed: 360,
    engage: 540, keep: 300, score: 80,
    body: "#a14a3a", turret: "#7e382c", size: 1.22,
  },
  boss: {
    name: "指挥重坦", hp: 520, speed: 55, radius: 30,
    reload: 2.6, bulletDamage: 20, bulletSpeed: 380,
    engage: 620, keep: 340, score: 300,
    body: "#57241f", turret: "#3a1714", size: 1.6,
    burst: [-0.17, 0, 0.17],   // 三连扇形弹幕
  },
};

/* ── 连杀 ── */
const COMBO = {
  WINDOW: 3,      // 连杀计数窗口(秒)
  BONUS_PER: 5,   // 每级连杀奖励积分
};

/* ── 波次规则 ── */
const WAVES = {
  BOSS_EVERY: 5,        // 每 5 波出 Boss
  WAVE_HEAL: 15,        // 清波战地维修量
  ON_FIELD_MAX: 6,      // 同屏敌人上限
};

/* ── 商店货架 ──
   type: consumable 消耗品(有库存) / upgrade 永久升级(有等级上限) */
const SHOP_ITEMS = [
  // 💣 炮弹
  {
    id: "ap", tab: "ammo", icon: "🡆", name: "穿甲弹 AP", tag: "炮弹 · 消耗品",
    price: 200, type: "consumable", pack: 10, packLabel: "10 发/箱",
    desc: AMMO.ap.desc,
  },
  {
    id: "he", tab: "ammo", icon: "☀", name: "高爆弹 HE", tag: "炮弹 · 消耗品",
    price: 250, type: "consumable", pack: 8, packLabel: "8 发/箱",
    desc: AMMO.he.desc,
  },
  {
    id: "sg", tab: "ammo", icon: "⁙", name: "榴霰弹 SG", tag: "炮弹 · 消耗品",
    price: 220, type: "consumable", pack: 8, packLabel: "8 发/箱",
    desc: AMMO.sg.desc,
  },
  {
    id: "ms", tab: "ammo", icon: "◎", name: "追踪导弹 MS", tag: "炮弹 · 消耗品",
    price: 400, type: "consumable", pack: 5, packLabel: "5 枚/组",
    desc: AMMO.ms.desc,
  },

  // 🔫 攻击武器
  {
    id: "mg_ammo", tab: "weapon", icon: "🔫", name: "并联机枪弹药", tag: "攻击武器 · 消耗品",
    price: 150, type: "consumable", pack: CFG.MG.pack, packLabel: `${CFG.MG.pack} 发/箱`,
    desc: "首次购买即装配并联机枪。战斗中按住 右键/Shift 扫射，射速极快，克制侦察车。",
  },
  {
    id: "dmg_up", tab: "weapon", icon: "⚡", name: "炮管强化", tag: "攻击武器 · 永久升级",
    price: 300, type: "upgrade", maxLv: 5,
    desc: "身管与装药全面强化，主炮伤害 +12%/级。",
  },
  {
    id: "reload_up", tab: "weapon", icon: "⏩", name: "自动装弹机", tag: "攻击武器 · 永久升级",
    price: 280, type: "upgrade", maxLv: 4,
    desc: "装填机构优化，主炮冷却 -9%/级。",
  },

  // 🛡️ 防护装备
  {
    id: "shield_cell", tab: "defense", icon: "🛡️", name: "能量护盾电池", tag: "防护 · 消耗品",
    price: 150, type: "consumable", pack: 1, packLabel: "60 护盾/个",
    desc: "开战时自动装载（最多 3 个），生成 60 点能量护盾，先于装甲承受伤害。",
  },
  {
    id: "repair", tab: "defense", icon: "🔧", name: "战地维修包", tag: "防护 · 消耗品",
    price: 120, type: "consumable", pack: 1, packLabel: "回复 40 HP/个",
    desc: "随身携带（每场最多 3 个），战斗中按 H 立即修复 40 点装甲。",
  },
  {
    id: "armor_up", tab: "defense", icon: "🧱", name: "复合装甲", tag: "防护 · 永久升级",
    price: 250, type: "upgrade", maxLv: 5,
    desc: "换装复合装甲模块，最大装甲值 +25/级。",
  },
  {
    id: "plating_up", tab: "defense", icon: "✒", name: "反应装甲", tag: "防护 · 永久升级",
    price: 400, type: "upgrade", maxLv: 3,
    desc: "引爆来袭弹药削减弱点，受到的所有伤害 -8%/级。",
  },
];

/* ── 升级项对玩家属性的影响 ── */
const UPGRADE_EFFECT = {
  dmg_up:    (lv) => 1 + 0.12 * lv,   // 伤害倍率
  reload_up: (lv) => Math.max(0.55, 1 - 0.09 * lv), // 冷却倍率
  armor_up:  (lv) => 25 * lv,         // 最大 HP 增量
  plating_up:(lv) => 1 - 0.08 * lv,   // 受伤倍率
};

/* ── 模式奖励 ── */
const REWARDS = {
  VS1_WIN: 300,            // 1v1 胜利奖励
  WAVE_BASE: 100,          // 1v多 清波基础奖励
  WAVE_STEP: 50,           // 每波增量
  START_POINTS: 100,       // 新档初始积分
  MAX_SHIELD_CELLS: 3,     // 每场最多装载护盾电池
  MAX_REPAIRS: 3,          // 每场最多携带维修包
};

/* 1v1 敌人成长：胜场越多敌人越强 */
const VS1_GROWTH = {
  hpPerWin: 0.08,     // 每胜场 +8% HP
  hpCap: 2.2,         // 上限倍率
  dmgPerWin: 0.05,
  dmgCap: 1.8,
  heavyFrom: 2,       // 第 3 场起（胜场>=2）出重装
};
