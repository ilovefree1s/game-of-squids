// Reaction — click as soon as the box turns green. 5 rounds; faster = more points.
Hub.register({
  id: "reaction",
  name: "Reaction Time",
  description: "Click the instant it turns green.",
  author: "Player 2",

  start(container, api) {
    const ROUNDS = 5;
    let round = 0, waiting = false, goTime = 0, timer = null, done = false;

    const box = document.createElement("div");
    Object.assign(box.style, {
      width: "100%", minHeight: "420px", display: "flex",
      alignItems: "center", justifyContent: "center",
      fontSize: "1.6rem", cursor: "pointer", userSelect: "none",
      textAlign: "center", padding: "20px",
    });
    container.appendChild(box);

    function show(text, color) {
      box.textContent = text;
      box.style.background = color;
    }

    function nextRound() {
      if (round >= ROUNDS) {
        done = true;
        api.gameOver();
        return;
      }
      round++;
      waiting = true;
      show(`Round ${round}/${ROUNDS}: wait for green…`, "#7a2a2a");
      timer = setTimeout(() => {
        waiting = false;
        goTime = performance.now();
        show("CLICK!", "#2a8a4a");
      }, 1000 + Math.random() * 2500);
    }

    box.onclick = () => {
      if (done) return;
      if (round === 0) return nextRound();
      if (waiting) {
        clearTimeout(timer);
        show("Too soon! No points. Click to continue.", "#444");
        waiting = null; // paused until next click
        return;
      }
      if (waiting === null) return nextRound();
      const ms = Math.round(performance.now() - goTime);
      api.addScore(Math.max(0, 1000 - ms)); // under 1 second earns points
      show(`${ms} ms! Click for next round.`, "#333");
      waiting = null;
    };

    show("Click to start", "#333");

    return () => clearTimeout(timer);
  },
});
