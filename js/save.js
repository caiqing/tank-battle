/* ══════════════════════════════════════════════
   save.js — 存档与积分（localStorage 持久化）
   ══════════════════════════════════════════════ */
"use strict";

const SAVE_KEY = "steel_front_save_v1";

const Save = {
  data: null,

  fresh() {
    return {
      points: REWARDS.START_POINTS,
      // 消耗品库存
      inv: { ap: 0, he: 0, sg: 0, ms: 0, mg_ammo: 0, shield_cell: 0, repair: 0 },
      mgOwned: false,        // 首次购买机枪弹药后置 true
      // 永久升级等级
      upgrades: { dmg_up: 0, reload_up: 0, armor_up: 0, plating_up: 0 },
      // 战绩
      stats: { kills: 0, vs1Wins: 0, bestWave: 0, battles: 0 },
      muted: false,
    };
  },

  load() {
    try {
      const raw = localStorage.getItem(SAVE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        // 合并默认结构，防止旧档缺字段
        this.data = Object.assign(this.fresh(), parsed);
        this.data.inv = Object.assign(this.fresh().inv, parsed.inv || {});
        this.data.upgrades = Object.assign(this.fresh().upgrades, parsed.upgrades || {});
        this.data.stats = Object.assign(this.fresh().stats, parsed.stats || {});
      } else {
        this.data = this.fresh();
      }
    } catch (e) {
      console.warn("存档读取失败，使用新档：", e);
      this.data = this.fresh();
    }
    return this.data;
  },

  persist() {
    try { localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); }
    catch (e) { console.warn("存档写入失败：", e); }
  },

  /* 当前升级等级 */
  lv(id) { return this.data.upgrades[id] || 0; },
  /* 升级效果值 */
  eff(id) { return (UPGRADE_EFFECT[id] || (() => 1))(this.lv(id)); },

  /* 尝试购买，返回 {ok, msg} */
  buy(item) {
    const d = this.data;
    if (item.type === "upgrade") {
      const cur = this.lv(item.id);
      if (cur >= item.maxLv) return { ok: false, msg: "已达最高等级" };
      const cost = item.price * (cur + 1); // 价格随等级递增
      if (d.points < cost) return { ok: false, msg: "积分不足" };
      d.points -= cost;
      d.upgrades[item.id] = cur + 1;
      this.persist();
      return { ok: true, msg: `${item.name} 提升至 Lv.${cur + 1}` };
    }
    // 消耗品
    if (d.points < item.price) return { ok: false, msg: "积分不足" };
    d.points -= item.price;
    d.inv[item.id] = (d.inv[item.id] || 0) + item.pack;
    if (item.id === "mg_ammo") d.mgOwned = true;
    this.persist();
    return { ok: true, msg: `已购入 ${item.name} ×${item.pack}` };
  },

  /* 消耗品是否拥有（用于商店展示与开局装载） */
  stock(id) { return this.data.inv[id] || 0; },
};
