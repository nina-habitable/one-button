// Design-validation simulation for Stage 1's procedural layout (gaps + obstacles).
// It mirrors the EXACT constants, generator, and physics from game/stages/stage1.js,
// then plays each random layout two ways:
//   • "ideal" bot — jumps at the best moment (proves everything is clearable)
//   • "late"  bot — jumps at the LAST safe instant for every hazard (worst case
//                   for landing overshoot and reaction time)
// It also measures the smallest reaction budget any layout leaves and checks the
// obstacle mix really varies run to run.
//
// Run with:  node scripts/solvability-check.mjs

// --- Constants copied verbatim from stage1.js ---
const SQUARE_X = 0.28;
const SPEED = 0.5;
const JUMP = 1.05;
const GRAVITY = 2.6;

const AIRTIME = (2 * JUMP) / GRAVITY;
const MAX_REACH = SPEED * AIRTIME;
const MAX_JUMP_HEIGHT = (JUMP * JUMP) / (2 * GRAVITY);

const MAX_GAP = MAX_REACH * 0.6;
const MIN_GAP = MAX_REACH * 0.25;

const MAX_OBSTACLE_HEIGHT = MAX_JUMP_HEIGHT * 0.5;
const MIN_OBSTACLE_HEIGHT = MAX_JUMP_HEIGHT * 0.22;
const OBSTACLE_MIN_WIDTH = 0.04;
const OBSTACLE_MAX_WIDTH = 0.09;

const REACTION_AND_LATENCY = 0.3;
const GAP_OVERSHOOT = MAX_REACH - MIN_GAP;
const RISE_TIME_TO_MIN_OBSTACLE =
  (JUMP - Math.sqrt(JUMP * JUMP - 2 * GRAVITY * MIN_OBSTACLE_HEIGHT)) / GRAVITY;
const OBSTACLE_OVERSHOOT = MAX_REACH - SPEED * RISE_TIME_TO_MIN_OBSTACLE - OBSTACLE_MIN_WIDTH;
const LANDING_OVERSHOOT = Math.max(GAP_OVERSHOOT, OBSTACLE_OVERSHOOT);
const MIN_SPACING = LANDING_OVERSHOOT + REACTION_AND_LATENCY * SPEED;
const RISE_TIME_TO_MAX_OBSTACLE =
  (JUMP - Math.sqrt(JUMP * JUMP - 2 * GRAVITY * MAX_OBSTACLE_HEIGHT)) / GRAVITY;
const OBSTACLE_LEAD = SPEED * RISE_TIME_TO_MAX_OBSTACLE;
const MIN_SPACING_OBSTACLE = MIN_SPACING + OBSTACLE_LEAD;
const MAX_SPACING = 0.85;
const SPACING_BIAS = 2;

// The late survival bot jumps this much (world units) before the theoretical last
// instant, so it leaves realistic clearance instead of grazing the exact pixel-top
// of an obstacle. It still lands late (max overshoot) — the thing worth stressing.
const LATE_MARGIN = 0.04;

// Rise time: how long after takeoff the rising square first reaches height h.
function riseTime(h) {
  return (JUMP - Math.sqrt(JUMP * JUMP - 2 * GRAVITY * h)) / GRAVITY;
}
// The LATEST square-center position at which a jump still clears a hazard:
//   • gap:      jump right at the edge.
//   • obstacle: jump early enough to already be above it on arrival.
function latestTakeoff(f) {
  return f.type === "gap" ? f.start : f.start - SPEED * riseTime(f.height);
}

// --- Generator copied verbatim from stage1.js ---
function generateFeatures() {
  const count = 5 + Math.floor(Math.random() * 3);
  const obstacleChance = 0.2 + Math.random() * 0.6;

  const specs = [];
  for (let i = 0; i < count; i++) {
    const difficulty = count > 1 ? i / (count - 1) : 0;
    if (Math.random() < obstacleChance) {
      const heightHigh =
        MIN_OBSTACLE_HEIGHT + (MAX_OBSTACLE_HEIGHT - MIN_OBSTACLE_HEIGHT) * (0.4 + 0.6 * difficulty);
      const height = MIN_OBSTACLE_HEIGHT + Math.random() * (heightHigh - MIN_OBSTACLE_HEIGHT);
      const width = OBSTACLE_MIN_WIDTH + Math.random() * (OBSTACLE_MAX_WIDTH - OBSTACLE_MIN_WIDTH);
      specs.push({ type: "obstacle", width, height });
    } else {
      const widthHigh = MIN_GAP + (MAX_GAP - MIN_GAP) * (0.4 + 0.6 * difficulty);
      const width = MIN_GAP + Math.random() * (widthHigh - MIN_GAP);
      specs.push({ type: "gap", width });
    }
  }

  let cursor = SQUARE_X + 0.9 + Math.random() * 0.4;
  const features = [];
  for (let i = 0; i < count; i++) {
    const spec = specs[i];
    features.push({ ...spec, start: cursor });
    const next = specs[i + 1];
    const nextFloor = next && next.type === "obstacle" ? MIN_SPACING_OBSTACLE : MIN_SPACING;
    const bias = Math.pow(Math.random(), SPACING_BIAS);
    const spacing = nextFloor + bias * (MAX_SPACING - nextFloor);
    cursor = cursor + spec.width + spacing;
  }
  return features;
}

// --- Play one layout with a chosen jump strategy ---
function playLayout(features, strategy) {
  const last = features[features.length - 1];
  const finish = last.start + last.width + 0.8;
  let distance = 0, y = 0, vy = 0, grounded = true, fallingIntoPit = false;
  const dt = 1 / 60;

  // Ideal / latest takeoff position (square center, world units) for each hazard.
  const takeoff = features.map((f) => {
    if (strategy === "late") return latestTakeoff(f) - LATE_MARGIN; // near-latest, with clearance
    // ideal: comfortable timing — straddle a gap, apex over an obstacle's center.
    if (f.type === "gap") return f.start - (MAX_REACH - f.width) / 2;
    return f.start + f.width / 2 - MAX_REACH / 2;
  });

  let target = 0;

  for (let frame = 0; frame < 6000; frame++) {
    const center = distance + SQUARE_X;

    while (target < features.length && center > features[target].start + features[target].width) target++;

    if (grounded && target < features.length && center >= takeoff[target]) {
      vy = JUMP;
      grounded = false;
    }

    distance += SPEED * dt;
    vy -= GRAVITY * dt;
    y += vy * dt;

    const c = distance + SQUARE_X;
    let solidBelow = true;
    for (const f of features) {
      if (f.type === "gap" && c >= f.start && c <= f.start + f.width) { solidBelow = false; break; }
    }

    if (fallingIntoPit) {
      // no rescue
    } else if (solidBelow) {
      if (y <= 0 && vy <= 0) { y = 0; vy = 0; grounded = true; }
    } else {
      if (y <= 0) { fallingIntoPit = true; grounded = false; }
    }

    // Obstacle collision (point model at the square's center).
    for (const f of features) {
      if (f.type === "obstacle" && c >= f.start && c <= f.start + f.width && y < f.height) {
        return { won: false };
      }
    }

    if (fallingIntoPit && y < -0.12) return { won: false };
    if (distance + SQUARE_X >= finish) return { won: true };
  }
  return { won: false };
}

// Rigorous fairness check, straight from the geometry (no bot survival needed):
// for each hazard, the grounded time between the WORST-CASE landing after the
// previous hazard and the LATEST safe jump for this one. Must stay >= reaction+latency.
function minReactionBudgetSeconds(features) {
  let worst = Infinity;
  for (let i = 1; i < features.length; i++) {
    const worstLanding = latestTakeoff(features[i - 1]) + MAX_REACH; // jumped as late as possible
    const budget = (latestTakeoff(features[i]) - worstLanding) / SPEED;
    worst = Math.min(worst, budget);
  }
  return worst;
}

// --- Run many trials ---
const TRIALS = 20000;
let idealFails = 0, lateFails = 0;
let maxGapWidth = 0, maxObsHeight = 0;
let minSpacingBeforeGap = Infinity, minSpacingBeforeObstacle = Infinity;
let worstBudget = Infinity;
let obsShareMin = Infinity, obsShareMax = 0, obsShareSum = 0;
let totalGaps = 0, totalObstacles = 0;

for (let i = 0; i < TRIALS; i++) {
  const features = generateFeatures();

  let obs = 0;
  for (let j = 0; j < features.length; j++) {
    const f = features[j];
    if (f.type === "obstacle") { obs++; totalObstacles++; maxObsHeight = Math.max(maxObsHeight, f.height); }
    else { totalGaps++; maxGapWidth = Math.max(maxGapWidth, f.width); }
    if (j > 0) {
      const spacing = f.start - (features[j - 1].start + features[j - 1].width);
      if (f.type === "obstacle") minSpacingBeforeObstacle = Math.min(minSpacingBeforeObstacle, spacing);
      else minSpacingBeforeGap = Math.min(minSpacingBeforeGap, spacing);
    }
  }
  const share = obs / features.length;
  obsShareMin = Math.min(obsShareMin, share);
  obsShareMax = Math.max(obsShareMax, share);
  obsShareSum += share;

  if (!playLayout(features, "ideal").won) idealFails++;
  if (!playLayout(features, "late").won) lateFails++;
  worstBudget = Math.min(worstBudget, minReactionBudgetSeconds(features));
}

const fmt = (n) => n.toFixed(4);
const pct = (n) => (n * 100).toFixed(0) + "%";
console.log("HAZARD SIZE CAPS");
console.log(`  MAX_REACH (jump's sideways reach):     ${fmt(MAX_REACH)} W`);
console.log(`  Gap width cap / widest generated:      ${fmt(MAX_GAP)} / ${fmt(maxGapWidth)} W`);
console.log(`  Max jump height (apex):                ${fmt(MAX_JUMP_HEIGHT)} H`);
console.log(`  Obstacle height cap / tallest gen'd:   ${fmt(MAX_OBSTACLE_HEIGHT)} / ${fmt(maxObsHeight)} H`);
console.log("SPACING FLOORS (ground before a hazard)");
console.log(`  Floor before a gap:                    ${fmt(MIN_SPACING)} W   (min gen'd ${fmt(minSpacingBeforeGap)})`);
console.log(`  Floor before an obstacle (+lead):      ${fmt(MIN_SPACING_OBSTACLE)} W   (min gen'd ${fmt(minSpacingBeforeObstacle)})`);
console.log(`  Ceiling:                               ${fmt(MAX_SPACING)} W`);
console.log("MIX VARIETY (obstacle share per run)");
console.log(`  min / average / max across runs:       ${pct(obsShareMin)} / ${pct(obsShareSum / TRIALS)} / ${pct(obsShareMax)}`);
console.log(`  total gaps vs obstacles generated:     ${totalGaps} gaps, ${totalObstacles} obstacles`);
console.log("FAIRNESS");
console.log(`  Worst-case reaction budget (geometry): ${(worstBudget * 1000).toFixed(0)} ms   (must stay >= 300 ms)`);
console.log("SOLVABILITY");
console.log(`  Trials: ${TRIALS}   ideal-timing failures: ${idealFails}   late-timing failures: ${lateFails}`);
console.log(
  idealFails === 0 && lateFails === 0 && worstBudget * 1000 >= 300
    ? "PASS — every layout clearable with ideal AND worst-case-late timing, reaction margin held."
    : "FAIL — check the numbers above!"
);
