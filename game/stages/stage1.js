// =============================================================================
// STAGE 1 — JUMP
// =============================================================================
// The rule (which the player is never told): TAP = JUMP.
//
// A square runs automatically to the right. The ground has two kinds of hazard:
//   • GAPS      — holes in the ground; fall in and you die.
//   • OBSTACLES — solid blocks sticking up; run into one and you die.
// Both are cleared the same way: tap to jump at the right moment. Clear them all
// and reach the finish line to complete the stage.
//
// The layout — a random mix of gaps and obstacles — is generated fresh every
// time the stage starts, including after a death. See generateFeatures() for how
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
  // JUMP LIMITS (the physics every hazard is measured against)
  // ---------------------------------------------------------------------------
  // A jump launches the square upward at speed JUMP; gravity GRAVITY pulls it
  // back down. Two fixed quantities fall out of that, and every hazard cap is
  // built from them so the guarantees hold even if you re-tune the jump:
  //
  //   AIRTIME   = 2 * JUMP / GRAVITY          → seconds in the air per jump
  //   MAX_REACH = SPEED * AIRTIME             → farthest a jump travels sideways
  //   MAX_JUMP_HEIGHT = JUMP² / (2 * GRAVITY) → highest the square ever rises
  const AIRTIME = (2 * JUMP) / GRAVITY;
  const MAX_REACH = SPEED * AIRTIME; // widest a perfect jump could clear
  const MAX_JUMP_HEIGHT = (JUMP * JUMP) / (2 * GRAVITY); // apex height

  // --- GAP width limits ---
  // A gap wider than MAX_REACH is impossible; we cap gaps at 60% of it so a whole
  // range of tap timings clears them, not one frame-perfect instant.
  const MAX_GAP = MAX_REACH * 0.6; // hard cap on gap width
  const MIN_GAP = MAX_REACH * 0.25; // smallest gaps

  // --- OBSTACLE height limits ---
  // An obstacle is cleared by being HIGH enough as you pass over it. The tallest
  // the square ever gets is MAX_JUMP_HEIGHT, so any obstacle taller than that is
  // impossible. We cap obstacle height at HALF of the peak — the top half of the
  // jump is left as clearance, so a well-timed jump sails over with room to spare
  // instead of needing the exact apex. Obstacles are also kept narrow.
  const MAX_OBSTACLE_HEIGHT = MAX_JUMP_HEIGHT * 0.5; // hard cap: 50% headroom
  const MIN_OBSTACLE_HEIGHT = MAX_JUMP_HEIGHT * 0.22; // small nubs
  const OBSTACLE_MIN_WIDTH = 0.04;
  const OBSTACLE_MAX_WIDTH = 0.09;

  // ---------------------------------------------------------------------------
  // SPACING BETWEEN HAZARDS (why the floor and ceiling are what they are)
  // ---------------------------------------------------------------------------
  // Hazard SIZE is a distance/height problem. SPACING — the flat ground between
  // one hazard and the next — is a TIME problem: after clearing one hazard the
  // player must LAND, SEE the next one, and get a tap registered before they must
  // jump for it. We budget that in seconds and convert to world units with SPEED.
  //
  // The base floor (used before a GAP) is built from three real costs:
  //   • Reaction to a visual cue ............ ~0.20 s
  //   • Touch input latency (finger→event) .. ~0.10 s   (mobiles are laggier here)
  //   • Landing overshoot: every jump flies the SAME fixed distance (MAX_REACH),
  //     so after clearing a hazard the square keeps sailing PAST it before its
  //     feet are down. That ground is "used up" by the previous jump. We take the
  //     WORST overshoot across BOTH hazard types:
  //       – narrowest gap:     lands (MAX_REACH − MIN_GAP) past the gap.
  //       – smallest obstacle: you jump almost at it and still fly the full reach,
  //         landing (MAX_REACH − rise-lead − width) past it — which is actually
  //         FARTHER than the narrow-gap case, so it sets the floor.
  const REACTION_AND_LATENCY = 0.3; // seconds: see the next hazard + register a tap
  const GAP_OVERSHOOT = MAX_REACH - MIN_GAP;
  const RISE_TIME_TO_MIN_OBSTACLE =
    (JUMP - Math.sqrt(JUMP * JUMP - 2 * GRAVITY * MIN_OBSTACLE_HEIGHT)) / GRAVITY;
  const OBSTACLE_OVERSHOOT = MAX_REACH - SPEED * RISE_TIME_TO_MIN_OBSTACLE - OBSTACLE_MIN_WIDTH;
  const LANDING_OVERSHOOT = Math.max(GAP_OVERSHOOT, OBSTACLE_OVERSHOOT); // worst of the two
  const MIN_SPACING = LANDING_OVERSHOOT + REACTION_AND_LATENCY * SPEED; // floor before a gap

  // OBSTACLES need MORE room in front of them than gaps. For a gap you can jump
  // right at its edge; for an obstacle you must already be tall enough by the time
  // you arrive, so the jump has to START earlier. The tallest obstacle forces the
  // earliest start — this is how much sooner (in world units) that jump must
  // begin — so we add it to the floor before any obstacle. The result: the player
  // still gets the full land-and-react window before the moment they must jump.
  const RISE_TIME_TO_MAX_OBSTACLE =
    (JUMP - Math.sqrt(JUMP * JUMP - 2 * GRAVITY * MAX_OBSTACLE_HEIGHT)) / GRAVITY;
  const OBSTACLE_LEAD = SPEED * RISE_TIME_TO_MAX_OBSTACLE; // extra ground obstacles need
  const MIN_SPACING_OBSTACLE = MIN_SPACING + OBSTACLE_LEAD; // floor before an obstacle

  // The ceiling caps dead air (~1.7 s of running), so no boring gap-less lulls.
  const MAX_SPACING = 0.85;
  // How hard the random spacing is pulled toward the floor. Raising a 0..1 random
  // number to this power: 1 = flat/uniform; 2 concentrates most draws near 0 (the
  // floor), so tight quick-succession jumps are a regular challenge, not a rarity.
  const SPACING_BIAS = 2;

  // --- Live state that changes as the stage plays ---
  const s = {
    distance: 0, // how far the world has scrolled, in W units
    y: 0, // square's height above the ground, in H units (0 = on the ground)
    vy: 0, // square's vertical speed, in H units per second (up is positive)
    grounded: true, // is the square currently standing on solid ground?
    fallingIntoPit: false, // has it committed to falling down a gap? (see update)
    features: [], // the current random layout (gaps + obstacles) — set by reset()
    finish: 0, // world position of the finish line — filled in by reset()
  };

  // ---------------------------------------------------------------------------
  // PROCEDURAL LAYOUT GENERATION (gaps AND obstacles)
  // ---------------------------------------------------------------------------
  // Build a fresh random layout. Every gap width is clamped at/below MAX_GAP,
  // every obstacle height at/below MAX_OBSTACLE_HEIGHT, and every spacing at/above
  // the right floor (larger before obstacles). So the result is ALWAYS clearable.
  //
  // IMPORTANT: this uses Math.random(), so it must only ever run in the browser
  // while the game is live. It is called from reset(), which the engine calls
  // after the canvas has mounted — never during server-side rendering. That is
  // why the random layout can never cause a server/client hydration mismatch.
  function generateFeatures() {
    const count = 5 + Math.floor(Math.random() * 3); // 5, 6, or 7 hazards

    // Per-RUN tendency toward obstacles. Drawing this once per run (not per
    // hazard) makes whole runs lean one way: some gap-heavy, some obstacle-heavy,
    // occasionally nearly all of one kind. That is the "keep the mix random" rule.
    const obstacleChance = 0.2 + Math.random() * 0.6; // 20%..80% obstacles this run

    // 1) Decide the sequence of hazards (type + size). Positions come next.
    const specs = [];
    for (let i = 0; i < count; i++) {
      // "difficulty" ramps from 0 on the first hazard to 1 on the last.
      const difficulty = count > 1 ? i / (count - 1) : 0;

      if (Math.random() < obstacleChance) {
        // Obstacle: height trends taller with difficulty, capped; width random.
        const heightHigh =
          MIN_OBSTACLE_HEIGHT + (MAX_OBSTACLE_HEIGHT - MIN_OBSTACLE_HEIGHT) * (0.4 + 0.6 * difficulty);
        const height = MIN_OBSTACLE_HEIGHT + Math.random() * (heightHigh - MIN_OBSTACLE_HEIGHT);
        const width = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
        specs.push({ type: "obstacle", width, height });
      } else {
        // Gap: width trends wider with difficulty, capped.
        const widthHigh = MIN_GAP + (MAX_GAP - MIN_GAP) * (0.4 + 0.6 * difficulty);
        const width = MIN_GAP + Math.random() * (widthHigh - MIN_GAP);
        specs.push({ type: "gap", width });
      }
    }

    // 2) Place them left to right. The ground BEFORE each hazard must clear that
    //    hazard's own floor — obstacles get the larger floor. Spacing is random
    //    between that floor and the ceiling, biased toward the floor for tightness.
    let cursor = SQUARE_X + 0.9 + Math.random() * 0.4; // first hazard start
    const features = [];
    for (let i = 0; i < count; i++) {
      const spec = specs[i];
      features.push({ ...spec, start: cursor });

      const next = specs[i + 1];
      const nextFloor = next && next.type === "obstacle" ? MIN_SPACING_OBSTACLE : MIN_SPACING;
      const bias = Math.pow(Math.random(), SPACING_BIAS); // 0..1, bunched near 0 (the floor)
      const spacing = nextFloor + bias * (MAX_SPACING - nextFloor);
      cursor = cursor + spec.width + spacing;
    }
    return features;
  }

  // Put the stage back to its starting position. Called at the start of the
  // stage AND after every death — so each restart gets a brand-new layout.
  function reset() {
    s.distance = 0;
    s.y = 0;
    s.vy = 0;
    s.grounded = true;
    s.fallingIntoPit = false;
    s.features = generateFeatures();
    const last = s.features[s.features.length - 1];
    s.finish = last.start + last.width + 0.8; // finish line sits past the last hazard
  }

  // Is there solid ground directly under the square right now, or a gap?
  // (Obstacles sit ON the ground, so they don't count here — only gaps do.)
  function groundUnderSquare() {
    const worldPos = s.distance + SQUARE_X; // where the square is in the world
    for (const f of s.features) {
      if (f.type === "gap" && worldPos >= f.start && worldPos <= f.start + f.width) {
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
      // back under it cannot rescue it.
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

    // Hitting an obstacle. Like gaps, the square is treated as a point at its
    // center: if that center is within an obstacle's horizontal span while the
    // square is not high enough to be above it, that's a crash — instant death,
    // the same freeze-and-tap-to-restart flow the engine uses for gaps.
    const center = s.distance + SQUARE_X;
    for (const f of s.features) {
      if (f.type === "obstacle" && center >= f.start && center <= f.start + f.width && s.y < f.height) {
        return "failed";
      }
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
    for (const f of s.features) {
      if (f.type !== "gap") continue;
      const gx = toScreenX(f.start);
      const gw = f.width * W;
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

    // 2) The obstacles: solid blocks rising from the ground, in a warm "danger"
    //    color that reads apart from the cool ground and the blue player.
    for (const f of s.features) {
      if (f.type !== "obstacle") continue;
      const ox = toScreenX(f.start);
      const ow = f.width * W;
      const oh = f.height * H;
      if (ox + ow > -50 && ox < W + 50) {
        ctx.save();
        ctx.shadowColor = "rgba(224, 102, 79, 0.8)";
        ctx.shadowBlur = 12;
        ctx.fillStyle = "#e0664f";
        ctx.fillRect(ox, groundYpx - oh, ow, oh);
        ctx.restore();
      }
    }

    // 3) The finish line — a bright vertical marker.
    const fx = toScreenX(s.finish);
    if (fx > -50 && fx < W + 50) {
      ctx.fillStyle = "#8ef0c0";
      ctx.fillRect(fx, groundYpx - H * 0.25, 5, H * 0.25);
      ctx.fillRect(fx, groundYpx - H * 0.25, 40, 22); // little flag
    }

    // 4) The player square. Its bottom sits at (ground − height above ground).
    const squareXpx = SQUARE_X * W;
    const bottom = groundYpx - s.y * H;

    ctx.save();
    ctx.shadowColor = "rgba(120, 180, 255, 0.9)";
    ctx.shadowBlur = 18;
    ctx.fillStyle = "#78b4ff";
    ctx.fillRect(squareXpx - size / 2, bottom - size, size, size);
    ctx.restore();
  }

  // Work out the solid ground segments (the pieces between the GAPS) so we can
  // draw the highlight line only where there is actually ground. Obstacles sit on
  // the ground, so they don't break it — only gaps do.
  function solidSegments() {
    const segments = [];
    let cursor = -1; // start a little before the visible world
    for (const f of s.features) {
      if (f.type !== "gap") continue;
      segments.push({ start: cursor, end: f.start });
      cursor = f.start + f.width;
    }
    segments.push({ start: cursor, end: s.finish + 2 });
    return segments;
  }

  // Every stage exposes the same four things to the engine.
  return { reset, onPress, update, draw };
}
