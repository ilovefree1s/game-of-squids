// Snake — arrow keys or WASD. Eat the yellow food, don't hit walls or yourself.
Hub.register({
  id: "snake",
  name: "Snake",
  description: "Eat, grow, don't bite yourself.",
  author: "Player 1",
  color: "#3ddc84",
  art: `<svg viewBox="0 0 120 70"><path d="M14 52 H50 V22 H86 V44 H104" fill="none" stroke="#3ddc84" stroke-width="9"
    stroke-linejoin="round" stroke-linecap="round"/><rect x="100" y="14" width="10" height="10" fill="#ffcc33"/></svg>`,

  start(container, api) {
    const SIZE = 20, CELLS = 20;
    const canvas = document.createElement("canvas");
    canvas.width = canvas.height = SIZE * CELLS;
    container.appendChild(canvas);
    const ctx = canvas.getContext("2d");

    let snake = [{ x: 10, y: 10 }];
    let dir = { x: 1, y: 0 }, nextDir = dir;
    let food = randomFood();
    let over = false;

    function randomFood() {
      let f;
      do { f = { x: rand(CELLS), y: rand(CELLS) }; }
      while (snake.some((s) => s.x === f.x && s.y === f.y));
      return f;
    }
    function rand(n) { return Math.floor(Math.random() * n); }

    function onKey(e) {
      const k = e.key.toLowerCase();
      const map = {
        arrowup: { x: 0, y: -1 }, w: { x: 0, y: -1 },
        arrowdown: { x: 0, y: 1 }, s: { x: 0, y: 1 },
        arrowleft: { x: -1, y: 0 }, a: { x: -1, y: 0 },
        arrowright: { x: 1, y: 0 }, d: { x: 1, y: 0 },
      };
      const d = map[k];
      if (!d) return;
      e.preventDefault();
      if (d.x !== -dir.x || d.y !== -dir.y) nextDir = d; // no instant reverse
    }
    document.addEventListener("keydown", onKey);

    function tick() {
      if (over) return;
      dir = nextDir;
      const head = { x: snake[0].x + dir.x, y: snake[0].y + dir.y };
      const hitWall = head.x < 0 || head.y < 0 || head.x >= CELLS || head.y >= CELLS;
      const hitSelf = snake.some((s) => s.x === head.x && s.y === head.y);
      if (hitWall || hitSelf) {
        over = true;
        api.gameOver();
        return;
      }
      snake.unshift(head);
      if (head.x === food.x && head.y === food.y) {
        api.addScore(1);
        food = randomFood();
      } else {
        snake.pop();
      }
      draw();
    }

    function draw() {
      ctx.fillStyle = "#1a1a2e";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = "#ffcc33";
      ctx.fillRect(food.x * SIZE, food.y * SIZE, SIZE - 1, SIZE - 1);
      ctx.fillStyle = "#3ddc84";
      snake.forEach((s) => ctx.fillRect(s.x * SIZE, s.y * SIZE, SIZE - 1, SIZE - 1));
    }

    draw();
    const timer = setInterval(tick, 120);

    // Cleanup: runs when leaving the game
    return () => {
      clearInterval(timer);
      document.removeEventListener("keydown", onKey);
    };
  },
});
