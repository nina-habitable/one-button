// =============================================================================
// SCREENS & TEXT OVERLAYS
// =============================================================================
// Small drawing helpers for the non-gameplay text: the title screen, the win
// screen, and the "STAGE CLEAR" banner. Keeping them here keeps the engine file
// focused on logic rather than fonts and positioning.
//
// A note on sizing: font sizes are based on the smaller of the width/height so
// the text looks right on both tall phones and wide desktop windows.
// =============================================================================

// Pick a font size that scales with the screen. "fraction" is how big the text
// should be relative to the shorter side of the screen.
function scaledFont(W, H, fraction) {
  return Math.max(14, Math.min(W, H) * fraction);
}

// The title screen. The brief says it should say ONLY "ONE BUTTON", so that is
// the only prominent text. A gently pulsing hint invites the first tap.
export function drawStartScreen(ctx, W, H) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const titleSize = scaledFont(W, H, 0.13);
  ctx.fillStyle = "#f4f4f8";
  ctx.font = `700 ${titleSize}px system-ui, sans-serif`;
  // Slight letter spacing feel by drawing the two words with a gap.
  ctx.fillText("ONE BUTTON", W / 2, H / 2);

  // A quiet prompt below. Its opacity breathes using a simple time-based wave
  // so the player knows the game is waiting for them, without extra words.
  const t = timeWave();
  const hintSize = scaledFont(W, H, 0.035);
  ctx.fillStyle = `rgba(244, 244, 248, ${0.35 + t * 0.35})`;
  ctx.font = `400 ${hintSize}px system-ui, sans-serif`;
  ctx.fillText("tap to begin", W / 2, H / 2 + titleSize * 0.75);
}

// The victory screen after Stage 5.
export function drawWinScreen(ctx, W, H) {
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";

  const titleSize = scaledFont(W, H, 0.11);
  ctx.fillStyle = "#8ef0c0"; // a soft green for a friendly "you did it"
  ctx.font = `700 ${titleSize}px system-ui, sans-serif`;
  ctx.fillText("YOU WIN", W / 2, H / 2 - titleSize * 0.3);

  const subSize = scaledFont(W, H, 0.038);
  ctx.fillStyle = "rgba(244, 244, 248, 0.75)";
  ctx.font = `400 ${subSize}px system-ui, sans-serif`;
  ctx.fillText("five buttons, five rules", W / 2, H / 2 + titleSize * 0.55);

  const t = timeWave();
  ctx.fillStyle = `rgba(244, 244, 248, ${0.3 + t * 0.35})`;
  ctx.font = `400 ${subSize}px system-ui, sans-serif`;
  ctx.fillText("tap to play again", W / 2, H / 2 + titleSize * 1.15);
}

// The "STAGE CLEAR" banner shown briefly between stages.
export function drawStageBanner(ctx, W, H, text) {
  // Dim the stage behind the banner so the text stands out.
  ctx.fillStyle = "rgba(10, 10, 18, 0.55)";
  ctx.fillRect(0, 0, W, H);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const size = scaledFont(W, H, 0.09);
  ctx.fillStyle = "#f4f4f8";
  ctx.font = `700 ${size}px system-ui, sans-serif`;
  ctx.fillText(text, W / 2, H / 2);
}

// A smooth 0→1→0 value driven by the clock, used to make hint text "breathe".
// We read the time fresh each call so it animates without storing any state.
function timeWave() {
  const ms = performance.now();
  // Sine wave over ~1.6 seconds, remapped from -1..1 into 0..1.
  return (Math.sin(ms / 800) + 1) / 2;
}
