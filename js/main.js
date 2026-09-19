/* ══════════════════════════════════════════════
   main.js — 入口：加载存档、绑定事件
   ══════════════════════════════════════════════ */
"use strict";

(function boot() {
  Save.load();
  SFX.setMuted(!!Save.data.muted);

  const canvas = document.getElementById("game-canvas");
  Input.attach(canvas);

  /* ── 全局按钮（data-action 委托）── */
  document.addEventListener("click", (e) => {
    const btn = e.target.closest("[data-action]");
    if (!btn) return;
    SFX.resume();
    SFX.click();
    const act = btn.dataset.action;

    switch (act) {
      case "start-1v1":
      case "start-horde": {
        UI.hideOverlays();
        UI.goto("game");
        Game.start(act === "start-1v1" ? "vs1" : "horde");
        break;
      }
      case "open-shop":
        UI.shopTab = "ammo";
        UI.goto("shop");
        break;
      case "open-help":
        UI.goto("help");
        break;
      case "goto-menu":
        Game.stop();
        UI.hideOverlays();
        UI.goto("menu");
        break;
      case "resume":
        Game.resume();
        break;
      case "abandon":
        // 主动撤退：已获积分入账后结算
        if (Game.state === "running" || Game.state === "paused") {
          Game.finish(false, "主动撤退，战场移交");
        }
        break;
      case "retry": {
        UI.hideOverlays();
        Game.start(Game.mode);
        break;
      }
      case "result-shop":
        Game.stop();
        UI.hideOverlays();
        UI.shopTab = "ammo";
        UI.goto("shop");
        break;
    }
  });

  /* ── 商店 tab ── */
  document.querySelectorAll(".shop-tab").forEach((b) => {
    b.addEventListener("click", () => {
      SFX.resume();
      SFX.click();
      UI.shopTab = b.dataset.tab;
      UI.renderShop();
    });
  });

  /* ── 战斗内按钮 ── */
  document.getElementById("btn-pause").addEventListener("click", () => {
    SFX.click();
    Game.state === "paused" ? Game.resume() : Game.pause();
  });
  document.getElementById("btn-mute").addEventListener("click", function () {
    const muted = !Save.data.muted;
    Save.data.muted = muted;
    Save.persist();
    SFX.setMuted(muted);
    this.textContent = muted ? "🔇" : "🔊";
  });
  document.getElementById("btn-mute").textContent = Save.data.muted ? "🔇" : "🔊";

  /* ── 重置存档 ── */
  document.getElementById("btn-reset").addEventListener("click", () => {
    SFX.click();
    if (confirm("确定要重置存档吗？积分、库存、升级与战绩将全部清空，且无法恢复。")) {
      localStorage.removeItem("steel_front_save_v1");
      location.reload();
    }
  });

  /* ── 初始进入主菜单 ── */
  UI.goto("menu");
})();
