// Shared hub: the menu, score display, and the API every mini-game uses.
// Change this file carefully and tell your teammate first — everyone depends on it.

const Hub = (() => {
  const games = [];
  let current = null; // { game, cleanup }

  const $ = (id) => document.getElementById(id);

  // Each mini-game calls this once to add itself to the menu.
  function register(game) {
    // game = { id, name, description, author, start(container, api) }
    if (!game.id || !game.start) {
      console.error("Hub.register needs at least an id and a start() function", game);
      return;
    }
    games.push(game);
  }

  function showMenu() {
    if (current && typeof current.cleanup === "function") current.cleanup();
    current = null;

    $("stage").hidden = true;
    $("back").hidden = true;
    $("fs").hidden = true;
    setFullscreen(false);
    $("menu").hidden = false;
    $("game").innerHTML = "";

    const menu = $("menu");
    menu.innerHTML = "";
    games.forEach((g) => {
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `
        <h2>${g.name || g.id}</h2>
        <p>${g.description || ""}</p>
        <small>Best: ${getBest(g.id)} · by ${g.author || "?"}</small>`;
      card.onclick = () => play(g);
      menu.appendChild(card);
    });
  }

  function play(game) {
    $("menu").hidden = true;
    $("stage").hidden = false;
    $("back").hidden = false;
    $("fs").hidden = false;
    $("game-name").textContent = game.name || game.id;
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
        const o = document.createElement("div");
        o.className = "overlay";
        o.innerHTML = `<div>Game over! Score: ${score}</div><div>Best: ${best}</div>`;
        const again = document.createElement("button");
        again.textContent = "Play again";
        again.onclick = () => play(game);
        const menuBtn = document.createElement("button");
        menuBtn.textContent = "Menu";
        menuBtn.onclick = showMenu;
        o.append(again, menuBtn);
        container.appendChild(o);
      },
    };

    if (current && typeof current.cleanup === "function") current.cleanup();
    // start() may return a cleanup function (stop timers, remove key listeners)
    current = { game, cleanup: game.start(container, api) };
  }

  // Full screen: the game area fills the whole screen. Uses the browser's real full screen where
  // it's allowed (computers, Android); iPhones fall back to filling the page.
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
