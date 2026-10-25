// HOW TO ADD A NEW MINI-GAME
// 1. Copy this whole _template folder and rename it, e.g. minigames/whack-a-mole/
// 2. Rename this file to match, e.g. whack-a-mole.js
// 3. Change the id, name, description and author below
// 4. Add one line to index.html in the mini-games section:
//      <script src="minigames/whack-a-mole/whack-a-mole.js"></script>
// 5. Put images/sounds for your game in your own folder too.
// Controls: Input.create(container) gives keyboard + controller + phone controls (see README).
// Online:   Net.joinRoom(...) gives multiplayer rooms (see README and glass-bridge.js).

Hub.register({
  id: "my-game",            // unique, lowercase, no spaces
  name: "My Game",
  description: "One line about the game.",
  author: "Your name",

  // container: the <div> to draw your game in
  // api.addScore(n), api.setScore(n), api.gameOver()
  start(container, api) {
    const btn = document.createElement("button");
    btn.textContent = "Click me for a point";
    btn.onclick = () => api.addScore(1);

    const end = document.createElement("button");
    end.textContent = "End game";
    end.onclick = () => api.gameOver();

    container.append(btn, " ", end);

    // Return a cleanup function: stop timers, remove key listeners, etc.
    return () => {};
  },
});
