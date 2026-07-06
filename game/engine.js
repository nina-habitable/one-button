// =============================================================================
// THE GAME ENGINE
// =============================================================================
// This is the "conductor" of the whole game. It does not know the rules of any
// individual stage — each stage handles its own rules. Instead, the engine is
// responsible for the things every stage shares:
//
//   • Sizing the canvas to fill the screen (and staying sharp on phones).
//   • Running the animation loop (~60 times per second).
//   • Turning a tap OR a spacebar press into one single "the button was pressed"
//     event, and showing a visual pulse every time.
//   • Managing the screens: START  →  play the 5 stages  →  WIN.
//   • Restarting a stage when you fail, and moving on when you clear one.
//
// The stages themselves live in game/stages/. Each is a small self-contained
// file. To add or change a stage, you edit that stage's file — not this one.
// =============================================================================

import { createStage1 } from "./stages/stage1";
import { drawStartScreen, drawWinScreen, drawStageBanner } from "./screens";

// The list of stages, in order. Each entry is a function that builds a fresh
// copy of that stage. Right now only Stage 1 exists; Milestone 2 adds the rest
// by simply appending them to this array.
const STAGE_FACTORIES = [createStage1];

export function createGame(canvas) {
  const ctx = canvas.getContext("2d");

  // ---------------------------------------------------------------------------
  // GAME STATE
  // ---------------------------------------------------------------------------
  // "screen" is which of the three big modes we are in.
  //   "start"   → the title screen that only says ONE BUTTON
  //   "playing" → actively playing one of the stages
  //   "win"     → the victory screen after clearing Stage 5
  const state = {
    screen: "start",
    stageIndex: 0, // which stage (0 = first) we are on while playing
    stage: null, // the live stage object we are currently running

    // W and H are the canvas size in CSS pixels (what the player sees).
    W: 0,
    H: 0,

    // "phase" is a smaller state used only while playing, to handle the short
    // pauses when you fail or when you clear a stage:
    //   "run"      → normal play
    //   "dead"     → frozen scene under a red wash; holds until the player
    //                presses the button to try again (no auto-restart)
    //   "clearing" → brief "STAGE CLEAR" banner, then advance to next stage
    phase: "run",
    phaseTimer: 0, // counts down the seconds left in the "clearing" banner

    // Visual feedback for every button press: a list of expanding rings, plus a
    // quick full-screen flash that fades out.
    pulses: [],
    flash: 0, // 0 = no flash, 1 = full white flash; fades toward 0 each frame
  };

  // ---------------------------------------------------------------------------
  // CANVAS SIZING (mobile-first, stays sharp on high-resolution screens)
  // ---------------------------------------------------------------------------
  // Phones have "retina" screens where one CSS pixel is really 2 or 3 device
  // pixels. If we ignore that, everything looks blurry. So we make the canvas's
  // internal size bigger by the device pixel ratio, then scale the drawing back
  // down. The result: crisp visuals at any size, and we still get to think in
  // simple CSS pixels (state.W by state.H) everywhere else.
  function resize() {
    const ratio = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth;
    const cssH = canvas.clientHeight;

    canvas.width = Math.floor(cssW * ratio);
    canvas.height = Math.floor(cssH * ratio);

    // Reset the drawing scale, then apply the ratio so 1 unit = 1 CSS pixel.
    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);

    state.W = cssW;
    state.H = cssH;
  }

  // ---------------------------------------------------------------------------
  // INPUT — one button, many sources
  // ---------------------------------------------------------------------------
  // A tap on the screen and a press of the spacebar both funnel into this one
  // function. That is the whole point of the game: there is only ever ONE input.
  function press(x, y) {
    // Every press makes a visible pulse, no matter what screen we are on.
    spawnPulse(x, y);

    if (state.screen === "start") {
      // Leaving the title screen: begin the first stage.
      startStage(0);
      return;
    }

    if (state.screen === "win") {
      // From the win screen, a press sends us back to the title.
      state.screen = "start";
      return;
    }

    // Otherwise we are playing.
    if (state.screen === "playing") {
      if (state.phase === "dead") {
        // The player died and the scene is frozen under a red wash. This press
        // is their choice to try again: restart the stage (which generates a
        // fresh random layout) and hand control straight back. We do NOT also
        // jump on this press — it only revives the stage.
        state.stage.reset(state.W, state.H);
        state.phase = "run";
      } else if (state.phase === "run") {
        // Normal play: the press is the game's one button.
        state.stage.onPress();
      }
      // During "clearing" (the STAGE CLEAR banner) presses do nothing but pulse.
    }
  }

  // Make a pulse ring at the given point. If we do not have a point (keyboard),
  // the caller passes the center of the screen.
  function spawnPulse(x, y) {
    state.pulses.push({ x, y, radius: 0, life: 1 });
    state.flash = 0.35; // a soft flash; 1 would be a harsh full-white blink
  }

  // --- Wire up the real browser events and route them into press() ---

  function onPointerDown(e) {
    e.preventDefault();
    // Where on the canvas did the finger/mouse land? Convert the page position
    // into a position inside the canvas.
    const rect = canvas.getBoundingClientRect();
    press(e.clientX - rect.left, e.clientY - rect.top);
  }

  function onKeyDown(e) {
    // Only the spacebar counts as "the button". Ignore held-key auto-repeat so
    // one long press is not read as many presses.
    if (e.code === "Space" && !e.repeat) {
      e.preventDefault(); // stop the spacebar from scrolling the page
      // Keyboard has no location, so pulse from the center of the screen.
      press(state.W / 2, state.H / 2);
    }
  }

  // "pointerdown" covers mouse, touch, and pen with a single event, which keeps
  // the input handling simple and consistent across devices.
  canvas.addEventListener("pointerdown", onPointerDown);
  window.addEventListener("keydown", onKeyDown);
  window.addEventListener("resize", resize);

  // ---------------------------------------------------------------------------
  // STARTING / ADVANCING STAGES
  // ---------------------------------------------------------------------------
  function startStage(index) {
    state.stageIndex = index;
    state.stage = STAGE_FACTORIES[index](); // build a fresh copy of the stage
    state.stage.reset(state.W, state.H); // set it to its starting position
    state.screen = "playing";
    state.phase = "run";
    state.phaseTimer = 0;
  }

  function advanceStage() {
    const next = state.stageIndex + 1;
    if (next >= STAGE_FACTORIES.length) {
      // No more stages — the player has won the whole game.
      state.screen = "win";
    } else {
      startStage(next);
    }
  }

  // ---------------------------------------------------------------------------
  // THE ANIMATION LOOP
  // ---------------------------------------------------------------------------
  // requestAnimationFrame calls our loop before each screen repaint (~60/sec).
  // "dt" is the time since the last frame, in seconds. Using real elapsed time
  // (instead of assuming a fixed rate) keeps the game running at the same speed
  // on fast and slow devices.
  let lastTime = 0;
  let rafId = 0;

  function loop(now) {
    // now arrives in milliseconds; convert the gap to seconds.
    let dt = (now - lastTime) / 1000;
    lastTime = now;

    // If the tab was in the background, dt could be huge. Cap it so the player
    // never "teleports" through a stage after switching back.
    if (dt > 0.05) dt = 0.05;
    if (dt < 0) dt = 0;

    update(dt);
    draw();

    rafId = requestAnimationFrame(loop);
  }

  function update(dt) {
    // Update the pulse rings and fade the flash on every screen.
    updatePulses(dt);

    if (state.screen !== "playing") return;

    if (state.phase === "run") {
      // Let the current stage advance itself and report how it went.
      const result = state.stage.update(dt, state.W, state.H);

      if (result === "failed") {
        // Death: freeze here. We do NOT start a timer — the game holds on the
        // frozen scene under a red wash until the player presses the button to
        // try again (handled in press()). No auto-restart, no text.
        state.phase = "dead";
      } else if (result === "complete") {
        // Begin a short "STAGE CLEAR" pause, then advance automatically.
        state.phase = "clearing";
        state.phaseTimer = 1.2;
      }
    } else if (state.phase === "clearing") {
      // Count down the STAGE CLEAR banner, then move on.
      state.phaseTimer -= dt;
      if (state.phaseTimer <= 0) {
        advanceStage(); // next stage, or the win screen after the last one
      }
    }
    // state.phase === "dead": intentionally do nothing. The stage is not updated,
    // so the scene stays frozen exactly where the player died.
  }

  function updatePulses(dt) {
    // Grow each ring and fade its life toward 0; drop the dead ones.
    for (const p of state.pulses) {
      p.radius += 520 * dt; // how fast the ring expands (pixels per second)
      p.life -= 2.2 * dt; // how fast it fades
    }
    state.pulses = state.pulses.filter((p) => p.life > 0);

    // Fade the full-screen flash back to zero.
    if (state.flash > 0) {
      state.flash -= dt * 2.5;
      if (state.flash < 0) state.flash = 0;
    }
  }

  // ---------------------------------------------------------------------------
  // DRAWING
  // ---------------------------------------------------------------------------
  function draw() {
    const { W, H } = state;

    // Clear the whole canvas to the background color each frame.
    ctx.fillStyle = "#0a0a12";
    ctx.fillRect(0, 0, W, H);

    if (state.screen === "start") {
      drawStartScreen(ctx, W, H);
    } else if (state.screen === "win") {
      drawWinScreen(ctx, W, H);
    } else if (state.screen === "playing") {
      // Draw the stage itself.
      state.stage.draw(ctx, W, H);

      // On top of the stage, draw the death/clear overlays.
      if (state.phase === "dead") {
        // A red wash held over the frozen scene. Nothing else is drawn — no
        // "tap to retry" text — keeping with the game's no-instructions premise.
        ctx.fillStyle = "rgba(220, 40, 60, 0.28)";
        ctx.fillRect(0, 0, W, H);
      } else if (state.phase === "clearing") {
        drawStageBanner(ctx, W, H, "STAGE CLEAR");
      }
    }

    // The tap pulses and flash are drawn last so they sit above everything.
    drawPulses();
  }

  function drawPulses() {
    const { W, H } = state;

    // The soft full-screen flash on each press.
    if (state.flash > 0) {
      ctx.fillStyle = `rgba(255, 255, 255, ${state.flash * 0.18})`;
      ctx.fillRect(0, 0, W, H);
    }

    // The expanding rings.
    for (const p of state.pulses) {
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.strokeStyle = `rgba(255, 255, 255, ${Math.max(0, p.life) * 0.5})`;
      ctx.lineWidth = 3;
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------------------
  // START EVERYTHING
  // ---------------------------------------------------------------------------
  resize(); // size the canvas once before the first frame
  rafId = requestAnimationFrame(loop);

  // The engine returns a single "stop" function. Calling it removes every event
  // listener and halts the animation loop, leaving nothing running behind us.
  return function stop() {
    cancelAnimationFrame(rafId);
    canvas.removeEventListener("pointerdown", onPointerDown);
    window.removeEventListener("keydown", onKeyDown);
    window.removeEventListener("resize", resize);
  };
}
