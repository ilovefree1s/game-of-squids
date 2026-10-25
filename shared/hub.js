// Shared hub: the home screen, score display, THE GAUNTLET, and the API every mini-game uses.
// Change this file carefully and tell your teammate first — everyone depends on it.
//
// Hub.register({
//   id: "my-game", name: "My Game", description: "One line.", author: "You",
//   color: "#5ad1ff",        // optional: neon color for its home-screen button
//   art: "<svg>…</svg>",     // optional: little picture on the right of its button
//   start(container, api) { … return cleanup; },
// });

const Hub = (() => {
  const games = [];
  let current = null; // { game, cleanup }
  let run = null; // THE GAUNTLET in progress: { i, total, scores }

  const $ = (id) => document.getElementById(id);

  // Each mini-game calls this once to add itself to the home screen.
  function register(game) {
    if (!game.id || !game.start) {
      console.error("Hub.register needs at least an id and a start() function", game);
      return;
    }
    games.push(game);
  }

  // ---------- home screen ----------
  function showMenu() {
    if (current && typeof current.cleanup === "function") current.cleanup();
    current = null;
    run = null;

    $("stage").hidden = true;
    $("back").hidden = true;
    $("fs").hidden = true;
    setFullscreen(false);
    document.body.classList.add("home-mode");
    $("menu").hidden = false;
    $("game").innerHTML = "";

    const menu = $("menu");
    menu.innerHTML = "";
    const home = el("div", "home");
    home.innerHTML = `
      <h1 class="home-title"><span class="w1">GAME</span><span class="w2">of</span><span class="w3">SQUIDS</span></h1>
      <p class="home-sub">${games.length} games · one winner</p>`;
    const list = el("div", "home-buttons");

    // THE GAUNTLET: every game, one after another, scores add up
    const g = bigButton({
      name: "THE GAUNTLET",
      description: `Play all ${games.length} games in a row`,
      color: "#ff2e88",
      art: GAUNTLET_ART,
      extra: getBest("gauntlet") ? `Best total: ${getBest("gauntlet")}` : "",
    }, startGauntlet);
    g.classList.add("gauntlet");
    list.append(g);

    games.forEach((game) => {
      const best = getBest(game.id);
      list.append(bigButton({ ...game, extra: best ? `Best: ${best}` : "" }, () => play(game)));
    });
    home.append(list);
    menu.append(home);
  }

  function bigButton(info, onClick) {
    const b = el("button", "gbtn");
    if (info.color) b.style.setProperty("--c", info.color);
    const text = el("div", "gbtn-text");
    text.append(el("div", "gbtn-name", info.name || info.id));
    const sub = [info.description, info.extra].filter(Boolean).join(" · ");
    if (sub) text.append(el("div", "gbtn-sub", sub));
    const art = el("div", "gbtn-art");
    art.innerHTML = info.art || defaultArt(info.color);
    b.append(text, art);
    b.onclick = onClick;
    return b;
  }

  // ---------- playing a game ----------
  function play(game) {
    document.body.classList.remove("home-mode");
    $("menu").hidden = true;
    $("stage").hidden = false;
    $("back").hidden = false;
    $("fs").hidden = false;
    $("game-name").textContent = run ? `Gauntlet ${run.i + 1}/${games.length} · ${game.name || game.id}` : game.name || game.id;
    setScore(0);

    const container = $("game");
    container.innerHTML = "";

    // The API handed to every mini-game
    const api = {
      setScore,
      addScore: (n = 1) => setScore(score + n),
      // Call when the round ends; shows a game-over screen and saves the best score
      gameOver: () => {
        const best = Math.max(getBest(game.id), score);
        saveBest(game.id, best);
        const o = el("div", "overlay");
        if (run) return gauntletStep(o, container);
        o.innerHTML = `<div>Game over! Score: ${score}</div><div>Best: ${best}</div>`;
        o.append(button("Play again", () => play(game)), button("Menu", showMenu));
        container.appendChild(o);
      },
    };

    if (current && typeof current.cleanup === "function") current.cleanup();
    // start() may return a cleanup function (stop timers, remove key listeners)
    current = { game, cleanup: game.start(container, api) };
  }

  // ---------- THE GAUNTLET ----------
  function startGauntlet() {
    if (!games.length) return;
    run = { i: 0, total: 0, scores: [] };
    play(games[0]);
  }

  function gauntletStep(o, container) {
    run.total += score;
    run.scores.push(score);
    const last = run.i >= games.length - 1;
    if (!last) {
      const next = games[run.i + 1];
      o.innerHTML = `<div>${games[run.i].name}: ${score} points</div><div class="big">Total: ${run.total}</div>`;
      o.append(button(`Next: ${next.name} ▶`, () => { run.i++; play(next); }), button("Quit the Gauntlet", showMenu));
    } else {
      const best = Math.max(getBest("gauntlet"), run.total);
      saveBest("gauntlet", best);
      const lines = games.map((g, k) => `${g.name}: ${run.scores[k]}`).join("<br>");
      o.innerHTML = `<div class="big">🏆 Gauntlet complete!</div><div>${lines}</div><div class="big">Total: ${run.total}</div><div>Best total: ${best}</div>`;
      o.append(button("Run it again", startGauntlet), button("Menu", showMenu));
    }
    container.appendChild(o);
  }

  // ---------- full screen ----------
  // The game area fills the whole screen. Uses the browser's real full screen where it's
  // allowed (computers, Android); iPhones fall back to filling the page.
  function setFullscreen(on) {
    const was = document.body.classList.contains("gos-fs");
    document.body.classList.toggle("gos-fs", on);
    $("fs").textContent = on ? "✕ Exit full screen" : "⛶ Full screen";
    try {
      if (on && !document.fullscreenElement && document.documentElement.requestFullscreen) {
        document.documentElement.requestFullscreen().catch(() => {});
      } else if (!on && document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    } catch {}
    if (was !== on) {
      // let games resize their canvas
      setTimeout(() => window.dispatchEvent(new Event("resize")), 60);
      setTimeout(() => window.dispatchEvent(new Event("resize")), 400);
    }
  }

  // ---------- helpers ----------
  let score = 0;
  function setScore(n) {
    score = n;
    $("score").textContent = score;
  }
  function getBest(id) {
    try { return Number(localStorage.getItem("best:" + id)) || 0; } catch { return 0; }
  }
  function saveBest(id, n) {
    try { localStorage.setItem("best:" + id, n); } catch {}
  }
  function el(tag, cls, text) {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (text != null) e.textContent = text;
    return e;
  }
  function button(text, onClick) {
    const b = el("button", "", text);
    b.onclick = onClick;
    return b;
  }

  // pictures for buttons
  const GAUNTLET_ART = `<svg viewBox="0 0 120 70"><g fill="none" stroke-width="5">
    <circle cx="25" cy="35" r="16" stroke="#ff2e88"/><path d="M60 18 L78 50 L42 50 Z" stroke="#ffffff"/>
    <rect x="86" y="20" width="28" height="28" stroke="#2de1c2"/></g></svg>`;
  function defaultArt(color = "#ffcc33") {
    return `<svg viewBox="0 0 120 70"><g fill="none" stroke="${color}" stroke-width="4" opacity=".9">
      <circle cx="60" cy="35" r="20"/></g></svg>`;
  }

  document.addEventListener("DOMContentLoaded", () => {
    $("back").onclick = showMenu;
    $("fs").onclick = () => setFullscreen(!document.body.classList.contains("gos-fs"));
    // leaving browser full screen (Esc) also leaves our full screen layout
    document.addEventListener("fullscreenchange", () => {
      if (!document.fullscreenElement && document.body.classList.contains("gos-fs")) setFullscreen(false);
    });
  });

  return { register, showMenu };
})();
