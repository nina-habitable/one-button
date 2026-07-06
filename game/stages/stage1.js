// =============================================================================
// STAGE 1 — JUMP
// =============================================================================
// The rule (which the player is never told): TAP = JUMP.
//
// A square runs automatically to the right. The ground has gaps in it. If the
// square falls into a gap it dies and the stage restarts. Tap at the right
// moment to jump over each gap. Clear all the gaps and reach the finish line to
// complete the stage.
//
// The gap layout is generated RANDOMLY every time the stage starts — including
// after a death — so no two runs are the same. See generateGaps() below for how
// we guarantee every random layout is actually beatable.
//
// HOW THE MATH STAYS RESPONSIVE
// Everything horizontal is measured in "screen widths" (W units) and everything
// vertical in "screen heights" (H units). For example a speed of 0.5 means
// "half a screen width per second". Because we only turn these into real pixels
// at the last moment using the current W and H, the stage automatically fits
// any screen size or orientation.
// =============================================================================

export function createStage1() {
  // --- Tuning knobs (all in the W/H unit system described above) ---
  const SQUARE_X = 0.28; // square's fixed horizontal spot (0=left, 1=right)
  const GROUND_Y = 0.78; // ground line height (0=top, 1=bottom)
  const SPEED = 0.5; // world scroll speed, in screen-widths per second
  const JUMP = 1.05; // upward launch speed of a jump (screen-heights/sec)
  const GRAVITY = 2.6; // how fast gravity pulls the square down (H/sec²)
  const SQUARE_SIZE = 0.075; // square size, as a fraction of the shorter screen side

  // ---------------------------------------------------------------------------
  // THE SOLVABILITY GUARANTEE (why every random layout is beatable)
  // ---------------------------------------------------------------------------
  // A jump launches the square upward at speed JUMP; gravity GRAVITY pulls it
  // back down. The time it spends in the air (from leaving the ground to landing
  // again) is a fixed amount we can calculate:
  //
  //     AIRTIME = 2 * JUMP / GRAVITY
  //
  // While it is in the air, the world keeps scrolling at SPEED, so the FARTHEST
  // horizontal distance the square can travel during a single jump is:
  //
  //     MAX_REACH = SPEED * AIRTIME
  //
  // That MAX_REACH is the widest gap a perfectly-timed jump could ever clear.
  // To keep the game fair (not frame-perfect), we never make a gap wider than
  // 60% of MAX_REACH. That 40% of spare reach is the safety margin: it means a
  // whole range of tap timings will clear the gap, not just one exact instant.
  // Because MAX_GAP is DERIVED from the physics constants above, this guarantee
  // stays true even if you later re-tune JUMP, GRAVITY, or SPEED.
  const AIRTIME = (2 * JUMP) / GRAVITY;
  const MAX_REACH = SPEED * AIRTIME; // widest a perfect jump could clear
  const MAX_GAP = MAX_REACH * 0.6; // hard cap: no gap is ever wider than this
  const MIN_GAP = MAX_REACH * 0.25; // smallest gaps

  // ---------------------------------------------------------------------------
  // SPACING BETWEEN GAPS (why the floor and ceiling are what they are)
  // ---------------------------------------------------------------------------
  // Gap WIDTH is a distance problem (can the jump physically reach across?).
  // Gap SPACING — the flat ground between one gap and the next — is really a
  // TIME problem: after clearing a gap the player has to LAND, SEE the next gap,
  // and get a tap actually registered before arriving at it. So we budget it in
  // seconds and convert to world units with SPEED (screen-widths per second).
  //
  // The floor is built from three real costs:
  //   • Reaction to a visual cue ............ ~0.20 s
  //   • Touch input latency (finger→event) .. ~0.10 s   (mobiles are laggier
  //                                                       here than a keyboard)
  //   • Landing overshoot: in the worst case (jumping at the very last instant
  //     over the narrowest gap) the square sails up to (MAX_REACH − MIN_GAP)
  //     PAST that gap before its feet are back on solid ground. That ground is
  //     "used up" by the previous jump and can't count toward reacting.
  //
  // Add them and you get the shortest run of ground that still leaves a human
  // enough time to respond. Because it's derived from the same physics/timing
  // numbers, it self-adjusts if you re-tune the jump or the speed.
  const REACTION_AND_LATENCY = 0.3; // seconds: see the next gap + register a tap
  const LANDING_OVERSHOOT = MAX_REACH - MIN_GAP; // worst ground eaten by landing
  const MIN_SPACING = LANDING_OVERSHOOT + REACTION_AND_LATENCY * SPEED; // the floor
  // The ceiling caps dead air. Lowered so even the longest gaps between jumps are
  // short (~1.7 s of running) — no lulls where nothing is happening.
  const MAX_SPACING = 0.85;
  // How hard the random spacing is pulled toward the floor. We raise a 0..1
  // random number to this power: 1 would be a flat/uniform draw; 2 concentrates
  // most draws near 0 (the floor). The result is that short, tight, back-to-back
  // spacings happen REGULARLY, not just occasionally — that's the difficulty.
  const SPACING_BIAS = 2;

  // --- Live state that changes as the stage plays ---
  const s = {
    distance: 0, // how far the world has scrolled, in W units
    y: 0, // square's height above the ground, in H units (0 = on the ground)
    vy: 0, // square's vertical speed, in H units per second (up is positive)
    grounded: true, // is the square currently standing on solid ground?
    fallingIntoPit: false, // has it committed to falling down a gap? (see update)
    gaps: [], // the current random layout — filled in by reset()
    finish: 0, // world position of the finish line — filled in by reset()
  };

  // ---------------------------------------------------------------------------
  // PROCEDURAL GAP GENERATION
  // ---------------------------------------------------------------------------
  // Build a fresh random set of gaps. Widths are randomized (and trend a little
  // wider toward the end of the stage); spacing is randomized between the floor
  // and ceiling but biased toward the floor, so tight jumps recur often. Every
  // width is clamped at or below MAX_GAP and every spacing between MIN_SPACING
  // and MAX_SPACING, so the result is ALWAYS clearable — see the notes above.
  //
  // IMPORTANT: this uses Math.random(), so it must only ever run in the browser
  // while the game is live. It is called from reset(), which the engine calls
  // after the canvas has mounted — never during server-side rendering. That is
  // why the random layout can never cause a server/client hydration mismatch.
  function generateGaps() {
    const gaps = [];
    const count = 5 + Math.floor(Math.random() * 3); // 5, 6, or 7 gaps

    // First gap starts a comfortable distance ahead of the square so the player
    // has a moment before the first jump.
    let cursor = SQUARE_X + 0.9 + Math.random() * 0.4;

    for (let i = 0; i < count; i++) {
      // "difficulty" ramps from 0 on the first gap to 1 on the last.
      const difficulty = count > 1 ? i / (count - 1) : 0;

      // Width: random, biased wider as difficulty rises — but the upper bound is
      // built so it can never exceed MAX_GAP.
      const widthHigh = MIN_GAP + (MAX_GAP - MIN_GAP) * (0.4 + 0.6 * difficulty);
      const width = MIN_GAP + Math.random() * (widthHigh - MIN_GAP);
      gaps.push({ start: cursor, width });

      // Spacing (flat ground before the next gap): random across the whole
      // floor→ceiling range for EVERY gap, but pulled toward the floor. Squaring
      // the random number (SPACING_BIAS = 2) means most gaps land close together,
      // so tight quick-succession jumps are a regular, recurring challenge rather
      // than a rare accident — while the occasional wider gap keeps it unsteady.
      const bias = Math.pow(Math.random(), SPACING_BIAS); // 0..1, bunched near 0
      const spacing = MIN_SPACING + bias * (MAX_SPACING - MIN_SPACING);
      cursor = cursor + width + spacing;
    }
    return gaps;
  }

  // Put the stage back to its starting position. Called at the start of the
  // stage AND after every death — so each restart gets a brand-new layout.
  function reset() {
    s.distance = 0;
    s.y = 0;
    s.vy = 0;
    s.grounded = true;
    s.fallingIntoPit = false;
    s.gaps = generateGaps();
    const last = s.gaps[s.gaps.length - 1];
    s.finish = last.start + last.width + 0.8; // finish line sits past the last gap
  }

  // Is there solid ground directly under the square right now, or a gap?
  // (The square is treated as a single point at its center for this check.)
  function groundUnderSquare() {
    const worldPos = s.distance + SQUARE_X; // where the square is in the world
    for (const g of s.gaps) {
      if (worldPos >= g.start && worldPos <= g.start + g.width) {
        return false; // the square is currently over a gap
      }
    }
    return true;
  }

  // THE BUTTON. In this stage, pressing it makes the square jump — but only if
  // it is standing on the ground (no mid-air double jumps, and no jumping once
  // it has already fallen into a pit).
  function onPress() {
    if (s.grounded) {
      s.vy = JUMP;
      s.grounded = false;
    }
  }

  // Advance the stage by dt seconds. Returns "playing", "failed", or "complete".
  function update(dt) {
    // Scroll the world to the left by moving our distance forward.
    s.distance += SPEED * dt;

    // Apply gravity to the vertical speed, then move the square vertically.
    s.vy -= GRAVITY * dt;
    s.y += s.vy * dt;

    const solidBelow = groundUnderSquare();

    if (s.fallingIntoPit) {
      // The square has already committed to a gap. Nothing can save it now —
      // we deliberately do NOT run the landing code, so ground that scrolls
      // back under it cannot rescue it. (This is the bug fix: previously the
      // square would snap back up onto the next ledge and keep running.)
    } else if (solidBelow) {
      // Solid ground here. If the square has reached (or dropped below) it while
      // moving downward, land on top of it.
      if (s.y <= 0 && s.vy <= 0) {
        s.y = 0;
        s.vy = 0;
        s.grounded = true;
      }
    } else {
      // No ground beneath the square.
      if (s.y <= 0) {
        // It was at ground level with a hole underneath → it falls in, for good.
        s.fallingIntoPit = true;
        s.grounded = false;
      }
      // Otherwise it is airborne above the gap (mid-jump) — that's fine.
    }

    // Death: it fell into a pit and has dropped below the ground surface.
    if (s.fallingIntoPit && s.y < -0.12) {
      return "failed";
    }

    // Reached the finish line?
    if (s.distance + SQUARE_X >= s.finish) {
      return "complete";
    }

    return "playing";
  }

  // Draw the stage. All positions are converted from W/H units into pixels here.
  function draw(ctx, W, H) {
    const groundYpx = GROUND_Y * H;
    const size = SQUARE_SIZE * Math.min(W, H);

    // Convert a world position (W units) into an on-screen x pixel.
    const toScreenX = (worldX) => (worldX - s.distance) * W;

    // 1) The ground: draw one long strip, then "cut out" each gap by painting
    //    the background color over it.
    ctx.fillStyle = "#2a2a3a";
    ctx.fillRect(0, groundYpx, W, H - groundYpx);

    ctx.fillStyle = "#0a0a12"; // background color, used to carve the gaps
    for (const g of s.gaps) {
      const gx = toScreenX(g.start);
      const gw = g.width * W;
      // Only bother drawing gaps that are near the screen.
      if (gx + gw > -50 && gx < W + 50) {
        ctx.fillRect(gx, groundYpx, gw, H - groundYpx);
      }
    }

    // A thin brighter line along the top of the ground for definition.
    ctx.fillStyle = "#3d3d55";
    for (const seg of solidSegments()) {
      const x = toScreenX(seg.start);
      const w = (seg.end - seg.start) * W;
      if (x + w > -50 && x < W + 50) {
        ctx.fillRect(x, groundYpx, w, 3);
      }
    }

    // 2) The finish line — a bright vertical marker.
    const fx = toScreenX(s.finish);
    if (fx > -50 && fx < W + 50) {
      ctx.fillStyle = "#8ef0c0";
      ctx.fillRect(fx, groundYpx - H * 0.25, 5, H * 0.25);
      ctx.fillRect(fx, groundYpx - H * 0.25, 40, 22); // little flag
    }

    // 3) The player square. Its bottom sits at (ground − height above ground).
    const squareXpx = SQUARE_X * W;
    const bottom = groundYpx - s.y * H;

    ctx.save();
    ctx.shadowColor = "rgba(120, 180, 255, 0.9)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#78b4ff";
    ctx.fillRect(squareXpx - size / 2, bottom - size, size, size);
    ctx.restore();
  }

  // Work out the solid ground segments (the pieces between the gaps) so we can
  // draw the highlight line only where there is actually ground.
  function solidSegments() {
    const segments = [];
    let cursor = -1; // start a little before the visible world
    for (const g of s.gaps) {
      segments.push({ start: cursor, end: g.start });
      cursor = g.start + g.width;
    }
    segments.push({ start: cursor, end: s.finish + 2 });
    return segments;
  }

  // Every stage exposes the same four things to the engine.
  return { reset, onPress, update, draw };
}
