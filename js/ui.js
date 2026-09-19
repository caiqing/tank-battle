/* ══════════════════════════════════════════════
   ui.js — 屏幕切换 / 商店 / HUD / 结算
   ══════════════════════════════════════════════ */
"use strict";

const UI = {
  _cache: {},

  /* ── 屏幕切换 ── */
  goto(name) {
    for (const s of ["menu", "shop", "help", "game"]) {
      document.getElementById(`screen-${s}`).classList.toggle("active", s === name);
    }
    if (name === "menu") this.refreshMenu();
    if (name === "shop") this.renderShop();
  },

  /* ── 主菜单 ── */
  refreshMenu() {
    document.getElementById("menu-points").textContent = Save.data.points;
    const st = Save.data.stats;
    document.getElementById("menu-stats").textContent =
      `总击毁 ${st.kills} · 1v1 胜场 ${st.vs1Wins} · 生存最佳 第 ${st.bestWave} 波`;
  },

  /* ── 商店 ── */
  shopTab: "ammo",

  renderShop() {
    document.getElementById("shop-points").textContent = Save.data.points;
    document.querySelectorAll(".shop-tab").forEach((b) => {
      b.classList.toggle("active", b.dataset.tab === this.shopTab);
    });
    const grid = document.getElementById("shop-grid");
    grid.innerHTML = "";
    for (const item of SHOP_ITEMS) {
      if (item.tab !== this.shopTab) continue;
      grid.appendChild(this._shopCard(item));
    }
  },

  _shopCard(item) {
    const card = document.createElement("div");
    card.className = "shop-card";

    let ownText = "", priceText = "", canBuy = true, locked = false;
    if (item.type === "upgrade") {
      const lv = Save.lv(item.id);
      locked = lv >= item.maxLv;
      ownText = locked ? `已满级 Lv.${lv}` : `当前 Lv.${lv} / ${item.maxLv}`;
      priceText = locked ? "已满级" : `🎖️ ${item.price * (lv + 1)}`;
      canBuy = !locked && Save.data.points >= item.price * (lv + 1);
    } else {
      const stock = Save.stock(item.id);
      ownText = `库存 ${stock}`;
      priceText = `🎖️ ${item.price}`;
      canBuy = Save.data.points >= item.price;
      if (item.id === "mg_ammo") ownText += Save.data.mgOwned ? " · 机枪已装配" : "";
    }

    card.innerHTML = `
      <div class="card-head">
        <div class="card-icon">${item.icon}</div>
        <div>
          <div class="card-name">${item.name}</div>
          <div class="card-tag">${item.tag}</div>
        </div>
      </div>
      <div class="card-desc">${item.desc}</div>
      <div class="card-meta">
        <span class="own">${ownText}</span>
        <span>${item.packLabel || ""}</span>
      </div>
      <div class="card-foot">
        <span class="card-price ${canBuy ? "" : "cant"}">${priceText}</span>
        <button class="buy-btn" ${canBuy ? "" : "disabled"}>购买</button>
      </div>`;
    if (locked) card.classList.add("locked");

    card.querySelector(".buy-btn").addEventListener("click", () => {
      const res = Save.buy(item);
      if (res.ok) SFX.buy(); else SFX.deny();
      this._flashTip(res.msg, res.ok);
      this.renderShop();
    });
    return card;
  },

  _flashTip(msg, ok) {
    const tip = document.getElementById("shop-tip");
    tip.innerHTML = `<span style="color:${ok ? "#8fe08f" : "#e2543e"};font-weight:700">${ok ? "✔" : "✘"} ${msg}</span>　—　战斗中按 <b>1~5</b> 切换弹种，按 <b>H</b> 使用维修包，按住 <b>右键/Shift</b> 发射机枪。`;
  },

  /* ── HUD ── */
  refreshHudStatic(game) {
    const label = game.mode === "vs1" ? "1v1 决斗" : "1v多 生存";
    this._setText("hud-mode-label", label);
    this._setText("hud-wave-label", game.mode === "vs1" ? `敌方 ${game.enemies[0]?.def?.name || ""}` : "");
  },

  setWaveLabel(text) {
    this._setText("hud-wave-label", text);
  },

  _setText(id, text) {
    if (this._cache[id] !== text) {
      this._cache[id] = text;
      document.getElementById(id).textContent = text;
    }
  },

  updateHud(game) {
    const p = game.player;
    if (!p) return;
    this._setText("hud-mode-label",
      (game.mode === "vs1" ? "1v1 决斗" : "1v多 生存") + (p.autopilot ? " · 🤖 AI 托管" : ""));
    const hpEl = document.getElementById("hud-hp");
    const hpTxt = document.getElementById("hud-hp-text");
    const hpPct = Math.round(p.hp / p.maxHp * 100);
    if (this._cache.hp !== hpPct) {
      this._cache.hp = hpPct;
      hpEl.style.width = hpPct + "%";
      hpTxt.textContent = `${Math.ceil(p.hp)}/${p.maxHp}`;
    }
    const shPct = p.maxShield ? Math.round(p.shield / p.maxShield * 100) : 0;
    if (this._cache.sh !== shPct) {
      this._cache.sh = shPct;
      document.getElementById("hud-shield").style.width = shPct + "%";
      document.getElementById("hud-shield-text").textContent =
        p.maxShield ? `护盾 ${Math.ceil(p.shield)}` : "无护盾";
    }
    this._setText("hud-repair", String(p.repairKits));
    this._setText("hud-score", String(p.score));
    this._setText("hud-kills", String(p.kills));
    const mg = document.getElementById("mg-cell");
    const showMg = Save.data.mgOwned;
    mg.classList.toggle("hidden", !showMg);
    if (showMg) this._setText("hud-mg-ammo", String(p.mgAmmo));
  },

  refreshAmmoBar(game) {
    const p = game.player;
    const bar = document.getElementById("ammo-bar");
    bar.innerHTML = "";
    for (const key of ["std", "ap", "he", "sg", "ms"]) {
      const a = AMMO[key];
      const count = p.ammo[key];
      const cell = document.createElement("div");
      cell.className = "ammo-cell" + (p.curAmmo === key ? " active" : "") + (count <= 0 ? " empty" : "");
      cell.innerHTML = `
        <span class="ammo-key">${a.slot}</span>
        <span class="ammo-name">${a.name}</span>
        <span class="ammo-count">${a.infinite ? "∞" : count}</span>`;
      // 点击/触点切换弹种（桌面与移动端通用）
      cell.addEventListener("click", () => {
        if (game.player.ammo[key] > 0) {
          game.player.curAmmo = key;
          this.refreshAmmoBar(game);
          SFX.click();
        }
      });
      bar.appendChild(cell);
    }
  },

  /* ── 虚拟摇杆视觉 ── */
  showJoystick(isLeft, x, y) {
    const el = document.getElementById(isLeft ? "joy-left" : "joy-right");
    el.classList.remove("hidden");
    el.style.left = x + "px";
    el.style.top = y + "px";
    this._setNub(isLeft, 0, 0);
  },
  moveJoystick(isLeft, dx, dy) { this._setNub(isLeft, dx, dy); },
  hideJoystick(isLeft) {
    document.getElementById(isLeft ? "joy-left" : "joy-right").classList.add("hidden");
  },
  _setNub(isLeft, dx, dy) {
    const nub = document.querySelector(`#${isLeft ? "joy-left" : "joy-right"} .joy-nub`);
    nub.style.transform = `translate(calc(-50% + ${dx}px), calc(-50% + ${dy}px))`;
  },

  announce(text) {
    const el = document.getElementById("announce");
    el.textContent = text;
    el.classList.remove("hidden");
    // 重启 CSS 动画
    el.style.animation = "none";
    void el.offsetWidth;
    el.style.animation = "";
    clearTimeout(this._annT);
    this._annT = setTimeout(() => el.classList.add("hidden"), 2400);
  },

  showPause(show) {
    document.getElementById("pause-overlay").classList.toggle("hidden", !show);
  },

  showResult(r) {
    this.showPause(false);
    const banner = document.getElementById("result-banner");
    banner.textContent = r.win ? "胜 利" : "战 败";
    banner.className = "result-banner " + (r.win ? "win" : "lose");

    const rows = [];
    rows.push(`模式：${r.mode === "vs1" ? "1v1 决斗" : "1v多 生存"}`);
    if (r.mode === "horde") rows.push(`坚守到 第 ${r.wave} 波`);
    rows.push(`击毁敌车 <b>${r.kills}</b> 辆`);
    if (r.bonus) rows.push(`${r.bonusLabel} <b>+${r.bonus}</b>`);
    rows.push(`<span style="color:#9aa08a">${r.reason}</span>`);
    document.getElementById("result-stats").innerHTML = rows.join("<br>");
    document.getElementById("result-points").textContent = r.score;
    document.getElementById("result-overlay").classList.remove("hidden");
  },

  hideOverlays() {
    document.getElementById("result-overlay").classList.add("hidden");
    document.getElementById("pause-overlay").classList.add("hidden");
  },
};
