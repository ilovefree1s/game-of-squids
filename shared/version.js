// Game version, shown in the bottom-right corner.
// Bump this every time you merge a change, so everyone can tell if they have the newest version:
//   bug fix -> 0.4.0 to 0.4.1     new feature -> 0.4.1 to 0.5.0
const VERSION = "0.9.5";

document.addEventListener("DOMContentLoaded", () => {
  const el = document.getElementById("version");
  if (el) el.textContent = "v" + VERSION;
});
