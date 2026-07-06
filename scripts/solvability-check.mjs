// Design-validation simulation for Stage 1's procedural gaps.
// It mirrors the EXACT constants, generator, and physics from game/stages/stage1.js,
// then plays each random layout two ways:
//   • "straddle" bot — jumps at the ideal moment (proves geometric solvability)
//   • "late" bot     — jumps at the LAST safe instant, maximizing landing
//                      overshoot (the worst case for the spacing floor)
// It also measures the smallest "reaction budget" any layout leaves: the time
// the square is on the ground before the last possible takeoff for the next gap.
//
// Run with:  node scripts/solvability-check.mjs

// --- Constants copied verbatim from stage1.js ---
const SQUARE_X = 0.28;
const SPEED = 0.5;
const JUMP = 1.05;
const GRAVITY = 2.6;

const AIRTIME = (2 * JUMP) / GRAVITY;
const MAX_REACH = SPEED * AIRTIME;
const MAX_GAP = MAX_REACH * 0.6;
const MIN_GAP = MAX_REACH * 0.25;

const REACTION_AND_LATENCY = 0.3;
const LANDING_OVERSHOOT = MAX_REACH - MIN_GAP;
const MIN_SPACING = LANDING_OVERSHOOT + REACTION_AND_LATENCY * SPEED;
const MAX_SPACING = 0.85;
const SPACING_BIAS = 2;

// --- Generator copied verbatim from stage1.js ---
function generateGaps() {
  const gaps = [];
  const count = 5 + Math.floor(Math.random() * 3);
  let cursor = SQUARE_X + 0.9 + Math.random() * 0.4;
  for (let i = 0; i < count; i++) {
    const difficulty = count > 1 ? i / (count - 1) : 0;
    const widthHigh = MIN_GAP + (MAX_GAP - MIN_GAP) * (0.4 + 0.6 * difficulty);
    const width = MIN_GAP + Math.random() * (widthHigh - MIN_GAP);
    gaps.push({ start: cursor, width });
    const bias = Math.pow(Math.random(), SPACING_BIAS);
    const spacing = MIN_SPACING + bias * (MAX_SPACING - MIN_SPACING);
    cursor = cursor + width + spacing;
  }
  return gaps;
}

// --- Play one layout with a chosen jump strategy ---
// strategy "straddle": take off so the jump straddles the gap symmetrically.
// strategy "late":     take off at the very last safe instant (center at lip).
function playLayout(gaps, strategy) {
  const finish = gaps[gaps.length - 1].start + gaps[gaps.length - 1].width + 0.8;
  let distance = 0, y = 0, vy = 0, grounded = true, fallingIntoPit = false;
  const dt = 1 / 60;

  // Ideal takeoff position for each gap under each strategy.
  const takeoff = gaps.map((g) =>
    strategy === "late"
      ? g.start - 0.01 // essentially at the lip
      : g.start - (MAX_REACH - g.width) / 2 // symmetric straddle
  );

  let gapIndex = 0;
  let lastLandTime = 0; // sim-time (seconds) the square last became grounded
  let minReactionBudget = Infinity; // smallest grounded time before a gap's lip

  for (let frame = 0; frame < 6000; frame++) {
    const time = frame * dt;
    const center = distance + SQUARE_X;

    while (gapIndex < gaps.length && center > gaps[gapIndex].start + gaps[gapIndex].width) {
      gapIndex++;
    }

    // Measure the reaction budget: when the center reaches the next gap's lip,
    // how long had the square been grounded since its last landing?
    if (gapIndex < gaps.length && center >= gaps[gapIndex].start && center - SPEED * dt < gaps[gapIndex].start) {
      minReactionBudget = Math.min(minReactionBudget, time - lastLandTime);
    }

    if (grounded && gapIndex < gaps.length && center >= takeoff[gapIndex] && center < gaps[gapIndex].start) {
      vy = JUMP;
      grounded = false;
    }

    distance += SPEED * dt;
    vy -= GRAVITY * dt;
    y += vy * dt;

    const c = distance + SQUARE_X;
    let solidBelow = true;
    for (const g of gaps) {
      if (c >= g.start && c <= g.start + g.width) { solidBelow = false; break; }
    }

    const wasGrounded = grounded;
    if (fallingIntoPit) {
      // no rescue
    } else if (solidBelow) {
      if (y <= 0 && vy <= 0) {
        y = 0; vy = 0;
        if (!wasGrounded) lastLandTime = time; // record the landing moment
        grounded = true;
      }
    } else {
      if (y <= 0) { fallingIntoPit = true; grounded = false; }
    }

    if (fallingIntoPit && y < -0.12) return { won: false, minReactionBudget };
    if (distance + SQUARE_X >= finish) return { won: true, minReactionBudget };
  }
  return { won: false, minReactionBudget, note: "ran out of frames" };
}

// --- Run many trials ---
const TRIALS = 20000;
let straddleFails = 0, lateFails = 0;
let maxWidth = 0, minSpacing = Infinity, maxSpacing = 0;
let worstBudget = Infinity;

// Track how spacings are distributed across the floor→ceiling range, so we can
// see that tight (near-floor) spacing really does happen regularly.
let spacingCount = 0, spacingSum = 0;
let tightCount = 0; // spacings within the tightest 20% of the range (near floor)
const range = MAX_SPACING - MIN_SPACING;

for (let i = 0; i < TRIALS; i++) {
  const gaps = generateGaps();
  for (let j = 0; j < gaps.length; j++) {
    maxWidth = Math.max(maxWidth, gaps[j].width);
    if (j > 0) {
      const spacing = gaps[j].start - (gaps[j - 1].start + gaps[j - 1].width);
      minSpacing = Math.min(minSpacing, spacing);
      maxSpacing = Math.max(maxSpacing, spacing);
      spacingCount++;
      spacingSum += spacing;
      if (spacing <= MIN_SPACING + 0.2 * range) tightCount++;
    }
  }
  if (!playLayout(gaps, "straddle").won) straddleFails++;
  const late = playLayout(gaps, "late");
  if (!late.won) lateFails++;
  worstBudget = Math.min(worstBudget, late.minReactionBudget);
}

const fmt = (n) => n.toFixed(4);
console.log(`MAX_REACH (farthest a perfect jump travels): ${fmt(MAX_REACH)} W`);
console.log(`MAX_GAP cap (0.6 x MAX_REACH):               ${fmt(MAX_GAP)} W`);
console.log(`Widest gap generated:                        ${fmt(maxWidth)} W`);
console.log(`Spacing floor (MIN_SPACING):                 ${fmt(MIN_SPACING)} W  (~${(MIN_SPACING / SPEED).toFixed(2)}s of ground)`);
console.log(`Spacing ceiling (MAX_SPACING):               ${fmt(MAX_SPACING)} W  (~${(MAX_SPACING / SPEED).toFixed(2)}s of ground)`);
console.log(`Spacing actually generated:                  ${fmt(minSpacing)} .. ${fmt(maxSpacing)} W`);
console.log(`Average spacing:                             ${fmt(spacingSum / spacingCount)} W`);
console.log(`Share of gaps in tightest 20% (near floor):  ${((tightCount / spacingCount) * 100).toFixed(1)}%`);
console.log(`Worst-case reaction budget (late-jump bot):  ${(worstBudget * 1000).toFixed(0)} ms grounded before the lip`);
console.log(`Reaction + touch latency budgeted for:       ${(REACTION_AND_LATENCY * 1000).toFixed(0)} ms`);
console.log(`Trials: ${TRIALS}`);
console.log(`  straddle-timing failures: ${straddleFails}`);
console.log(`  late-timing failures:     ${lateFails}`);
console.log(straddleFails === 0 && lateFails === 0
  ? "PASS — every layout beatable with both ideal AND worst-case-late timing."
  : "FAIL — found unbeatable layouts!");
