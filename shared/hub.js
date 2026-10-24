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
  });

  return { register, showMenu };
})();
