# Ant Scout — Phase 9: Empire of Ants adaptation plan

Scoping doc. Maps each requested mechanic onto the current codebase, flags conflicts,
and proposes an order of operations. **No code changed yet — this is the plan.**

Codebase surveyed at commit `1dba0d3` (~3.8k lines, `js/core` → `js/systems` → `js/maps` → `js/scenes`).

---

## 0. Two findings that change the brief

### 0.1 There is no Queen (or larva, or chambers) to preserve
The brief lists *"Existing Queen behavior and nest visuals"* under DO-NOT-TOUCH.
Searched the whole tree — `queen`, `larva`, and `chamber` return **one** hit:

```
js/maps/underground.js:141  // NEST safe zone: near the home entrance chamber -> food & water refill here
```

That's a comment on `isSafeZone()`, a radius check around `home`. There is no Queen
entity, no nursery, no chamber geometry. The underground is a **procedurally generated
free-form dirt grid** (`grid` = 1 dirt / 0 open) with a buried gem and an entrance shaft.

**Consequence:** the Queen is *net-new work*, and she is the anchor for mechanics #2 and
#3. This is the largest single item in the plan, not a preserved given.

### 0.2 Ant entities exist ONLY on the surface
`SurfaceScene.ants` is the sole ant array (`js/maps/surface_backyard.js:25`). The scene
manager makes this explicit:

```js
// js/scenes/manager.js:86
updateColony(dt, scene.id === 'surface' ? scene.ants : null);
```

The underground has **zero** ant entities. But mechanics #3 (larva at the Queen) and #4
(injured ants retreating to a nest section) are inherently *underground* systems.
This scene boundary is the main architectural constraint of the whole phase — addressed
in §4.

---

## 1. What already exists (more than expected)

| Requested mechanic | Status | Where |
|---|---|---|
| Kill → food drop | **Already built** | `onEnemyKilled()` pushes a `kind:'food'` item — `combat.js:119` |
| Retrieve dropped food | **Already built** | `foragerBehavior()` `out`→`toFood`→`home` — `colony.js:78` |
| Deliver to stockpile | **Already built** | `depositFood()` — `colony.js:40` |
| Fighter auto-engages enemies | **Already built** | `soldierBehavior()` — `colony.js:119` |
| Job system (forager/soldier/builder) | **Already built** | `reconcileJobs()` — `colony.js:51` |
| Population cap + paced hatching | **Already built** | `updateColony()` — `colony.js:181` |

So mechanic **#2 is ~60% done** and **#5 is ~70% done**. The genuinely new work is the
Queen, larva choice, dig gates, and the injury loop.

---

## 2. Mechanic-by-mechanic hook points

### #1 Tunnel Gate Progression
**Nothing currently accumulates a dig count.** Digging decrements per-cell `hp[]`; when a
cell breaks it's just `grid[id] = 0`.

- **Counter hook — one line**, at the cell-break moment (`underground.js:84`):
  ```js
  if (hp[id] <= 0) {
    grid[id] = 0; colony.dug++;        // ← new persistent counter
  ```
- **The gate itself — needs new geometry.** A free-form dirt grid has no "next chamber"
  to unlock. Two options:

  - **(A) Depth-band gates** — gate on existing `maxDepthMM`. ~20 lines, but it's a *soft*
    unlock, which the brief explicitly doesn't want.
  - **(B) Authored chamber rooms (recommended)** — at `genWorld()` time, carve predefined
    room rects and seal each behind a **new cell type** `grid = 2` ("gate rock",
    undiggable). `isSolid()` treats 2 as solid; the dig loop refuses to damage it until
    `colony.dug >= gate.digs`, then it crumbles with a banner + shake.

  Option B gives the real Empire-of-Ants milestone feel and creates the physical rooms
  the Queen and infirmary need to live in. Recommend B.

- **New config:**
  ```js
  const NEST_GATES = [
    { id: 'nursery',   digs: 40,  label: 'Nursery' },
    { id: 'infirmary', digs: 110, label: 'Infirmary' },
    { id: 'granary',   digs: 220, label: 'Granary' },
  ];
  ```
- **Progress UI:** `UndergroundScene.drawHUD()` already draws an objective pill — add a
  gate progress bar beneath it (`dug / nextGate.digs`).

### #2 Kill → Food Drop → Storage Choice
Drop + retrieval already work. What's missing is **the choice**.

- **Single funnel:** every food delivery in the game goes through `depositFood()`
  (`colony.js:40`) — foragers and the scout both. That's the one place to branch.
  ```js
  function depositFood(amount, dest) {           // dest: 'stock' | 'queen'
    const d = dest || colony.deliveryMode;
    if (d === 'queen') { colony.queenFood += amount; checkLarva(); }
    else colony.food += amount;
    colony.totalCollected += amount;
  }
  ```
- **Making both matter** (the design risk — if one is strictly better the choice is fake):
  - **Stockpile** → healing injured ants (#4), nest repair, upgrades. *Keeps the colony alive.*
  - **Queen** → larvae, i.e. population growth (#3). *Makes the colony bigger.*
  - Under attack you need stockpile; when safe you want Queen. Weather (§5) sharpens this.
- **UI:** a two-state toggle in the existing colony panel, plus a per-delivery prompt when
  the *scout* deposits at the anthill.

### #3 Food → Larva → Specialization
- **Must replace the current auto-hatch**, or the two systems compete. Today
  `updateColony()` silently spends stockpile food to spawn foragers
  (`colony.js:183`). That has to become Queen-driven.
- **New state:** `colony.queenFood`, `colony.larvae = []` (pending choices).
- **Flow:** `queenFood >= QUEEN.foodPerLarva` → push a larva → player picks
  **Worker** (dig/nest tasks) or **Fighter** (surface combat + retrieval) → spawns with
  that `job`, seeded at the anthill.
- **Cadence:** Empire of Ants uses ~16 food/larva. With `FORAGER.carryValue = 12`, a
  threshold of ~24–36 makes a larva feel earned but not slow.

> #### ⚠ Conflict: free job reassignment makes the larva choice meaningless
> `reconcileJobs()` (`colony.js:51`) lets the player re-flip *any* ant between
> forager/soldier/builder at will — the comment even says *"Free reassignment (labour,
> not hatching)."* If a larva choice can be undone instantly by a slider, it carries no
> strategic weight, which is the whole point of #3.
>
> **Resolve one of three ways:**
> 1. **Caste lock (recommended, closest to the reference)** — larva-born ants get
>    `caste: 'worker'|'fighter'` and cannot cross castes. The existing slider still
>    reassigns *within* a caste (worker ↔ forager/builder), so nothing existing breaks.
> 2. **Costly conversion** — reassignment allowed but costs food + downtime.
> 3. **Drop the slider** — most disruptive; not recommended, it's a working feature.

### #4 Injury / Recovery — and the fix to Empire of Ants' flaw
- **Today ants die permanently:** `if (ants[i].dead) ants.splice(i, 1);` (`colony.js:161`).
  Replace with a retreat-and-recover path.
- **Scene problem:** the infirmary is underground; ants are surface-only (§0.2). Options:
  - **(A) Abstract counter (recommended for v1)** — a defeated ant is removed from the
    surface array and increments `colony.injured`. Healing consumes 1 stockpile food per
    ant on a timer; recovered ants respawn at the anthill. **No new entity system**, works
    across scenes for free, and survives the scene switch that would otherwise strand them.
  - **(B) Full underground ant entities** — a second ants array + pathing + rendering.
    Much larger; defer.
  - With (A) the **Infirmary chamber still gets a visual payoff**: render `colony.injured`
    as N static resting ant sprites in the room. Looks alive, costs no AI.
- **The improvement over Empire of Ants** (auto-heal, no player medic duty) is genuinely
  small here — it's a few lines in `updateColony()`, which already runs every frame in
  every scene:
  ```js
  if (colony.injured > 0 && colony.food >= 1) {
    colony.healT -= dt;
    if (colony.healT <= 0) {
      colony.healT = QUEEN.healSec;
      colony.food -= 1; colony.injured--; colony.pendingRespawn++;
    }
  }
  ```
  Gate the rate on worker count so investing in workers visibly speeds recovery — that's
  what makes the Worker/Fighter choice in #3 bite.

### #5 Fighter Autonomy
`soldierBehavior()` already hunts and patrols. One gap: **soldiers ignore dropped food.**

- Add a branch: no enemy in `engageRadius` **and** a `kind:'food'` item within radius →
  run the existing `foragerBehavior` collect path. Reuses the state machine; ~15 lines.
- Priority order: *engage enemy* > *grab drop* > *patrol nest*. Combat must never be
  interrupted by a crumb.

### #6 Controls
Current scheme is already tighter than the reference: virtual joystick with a rest-offset
(`joyRest`), DIG + BITE buttons, i-frames (`COMBAT.antIFrames`), a bite arc, and
**double-tap-to-lock auto-dig** (`state.js:47`) for hands-free steering.

**Recommend no changes to the control scheme.** The actual fix for the reference game's
awkwardness is #5 — removing the *need* to micromanage combat. One addition worth making:
surface auto-dig equivalent isn't needed, but fighter autonomy should be visibly
indicated so the player trusts it and stops babysitting.

---

## 3. Weather system — conflicts

**None.** `weather.js` is fully self-contained: WMO code → label/icon, sky gradient
tweening, rain/snow particles, wind base, fetch + localStorage caching. It reads and
writes only the `weather` / `env` / `wind` globals. It does not reference `colony`,
`ants`, `stats`, or any job constant. Every new system above touches `colony.*` and
`SurfaceScene.ants`. **Zero overlap — nothing to reconcile.**

### The bigger point: weather is the moat
> **CORRECTED (see `REFERENCE_STUDY_ANT_GAMES.md` §6).** The claim originally written here —
> that Empire of Ants has no weather and therefore weather is our differentiator — is **wrong
> as stated**. Simulated weather is *table stakes* in this genre: Pocket Ants (~18M downloads)
> ships rain, snow and a four-phase day/night cycle and already gates spawns on both (dragonfly
> only in rain/snow; scorpion best at night); SimAnt did rain-washed pheromone trails in 1991.
>
> The **real, narrower, uncontested** moat is that no surveyed title drives weather from the
> player's *actual local conditions via a live API*. Not "we have weather" — **"the sky in your
> colony is the sky outside your window."** That moat is also *structural*: every competitor is
> an always-online F2P economy that needs controllable pacing, and none of them can gate a spawn
> table on each player's real forecast without losing their event calendar. They could copy it
> technically and won't commercially.
>
> Two consequences: (a) **the moat is currently unexercised** — every `weather` reference outside
> `weather.js` is a draw call or a string, and only `wind.base` touches the sim, so scheduling 9F
> last is the riskiest call in this plan; pull the two S-effort rows forward. (b) **Live weather is
> slow** (real rain can last days) where competitors' cycles are minutes — so couple to *rates and
> pressure*, never make a weather state the only key to a gate.

Right now Ant Scout's weather is *scenery*. Wiring these new systems to it makes the whole
adaptation defensibly ours rather than a reskin:

| Condition | Proposed effect | Which mechanic it deepens |
|---|---|---|
| Rain | Foragers slower; unclaimed drops wash away sooner | #2 — retrieval urgency |
| Storm | More/bolder surface enemies; higher nest damage | #4 — injuries spike, stockpile matters |
| Night | Fewer spiders → the safe window to dig | #1 — gates advance at night |
| Cold | Larva development slower | #3 — timing the Queen |
| Clear day | Peak foraging | #2 — bank food for Queen |

That table alone converts "stockpile vs Queen" from a static preference into a
*forecast-driven* decision. It's the one thing the reference game structurally can't copy.

---

## 4. New state, config, and assets

**State (`state.js` → `colony`):**
```js
dug: 0,                 // lifetime cells dug (drives gates)
gates: {},              // id -> true
queenFood: 0,           // food delivered to the Queen
larvae: [],             // pending specialization choices
injured: 0,             // ants recovering
pendingRespawn: 0,      // healed, waiting to re-enter the surface
healT: 0,
deliveryMode: 'stock',  // 'stock' | 'queen'
```
All of it belongs in the existing `colony` object, which already persists across scenes —
so no new persistence layer.

> **CORRECTED.** An earlier version of this line said to add these keys to the
> `antscout.progress` save (`progression.js:12`). **Do not.** `colony` is strictly *per-run*:
> `resetColony()` (`colony.js:23`) wipes it, `newGame()` (`manager.js:31`) calls that, and
> `saveProgress()` persists only `wins`/`unlocked`/`skin`. Persisting `dug`/`gates`/rank would
> create a **second cross-run meta-progression axis** alongside the gem milestones — runs would
> start with chambers already open, and the session framing would quietly become an idle game's
> save file. **Persist nothing from `colony`;** let gates be a within-run arc, exactly like the gem.

> **BUG THIS PLAN WOULD HAVE INTRODUCED.** `isSolid` is
> `(cx, cy) => (!inBounds(cx, cy) ? true : grid[idx(cx, cy)] === 1)` — `js/core/engine.js:31`.
> The proposed `grid = 2` gate rock is `!== 1`, so the ant would **walk straight through every
> sealed gate**. Change to `>= 1` and add the matching guard to the dig check at
> `underground.js:75` *before* writing 9B.

**Config (`config.js`):** `NEST_GATES` (above), plus
```js
const QUEEN = { foodPerLarva: 28, healSec: 6, healPerWorker: 0.15, r: 22 };
```

**Sprites** — `assets/ants_atlas.png` is atlas-indexed via `ANT_SPRITE.row`, and
`drawAntSprite()` already returns `false` to trigger a hand-drawn vector fallback
(`colony.js:231`). That pattern means **every new ant type can ship vector-first and get
an atlas row later** — no art blocks code.

| Asset | Needed for | Note |
|---|---|---|
| Queen | #2, #3 | Large abdomen, distinct silhouette. Vector-first is fine. |
| Larva | #3 | Small pale grub; 2 frames (idle pulse) is enough. |
| Injured ant | #4 | Recolor + droop of the forager row; cheapest new state. |
| Fighter | #3, #5 | **Reuse the existing soldier row** — no new art needed. |
| Gate rock | #1 | Darker dirt tile + crack overlay; can be drawn procedurally. |

---

## 5. Proposed order of operations

Sequenced so each step is independently testable and nothing is half-wired:

- **9A — Economy plumbing (no visible change).** `colony.dug` counter, `queenFood`,
  `depositFood(amount, dest)` branch, new state keys + save/load. Ship behind the scenes;
  verify counters move.
- **9B — Chambers & gates.** New `grid = 2` gate cell, authored rooms in `genWorld()`,
  gate-break on `colony.dug`, progress bar in `drawHUD()`. *This creates the rooms 9C/9D
  need.*
- **9C — Queen & larva choice.** Queen entity in the nursery, replace auto-hatch, larva
  queue + choice UI, caste lock (§#3 conflict decision required first).
- **9D — Injury & infirmary.** Retreat instead of die, `colony.injured`, worker auto-heal,
  infirmary room renders resting ants.
- **9E — Fighter autonomy.** Drop-retrieval branch in `soldierBehavior()`, priority order.
- **9F — Weather coupling.** The §3 table. Deliberately last: it tunes systems that must
  already exist, and it's where the game stops being an adaptation.

**Dependency note:** 9B must precede 9C/9D (the rooms are where the Queen and infirmary
live). 9E is independent and could be pulled forward if you want the combat-feel win early.

---

## 6. Decisions needed before 9C

1. **Caste lock vs costly conversion vs drop the slider** (§#3 conflict) — this changes
   how much of `reconcileJobs()` survives.
2. **Gate style: authored chambers (B) or depth bands (A)** — B is recommended and is
   assumed by 9B/9C/9D above; A would be much cheaper but softer.
3. **Injury model: abstract counter (A) or real underground entities (B)** — A recommended
   for v1; B is a plausible Phase 10.
4. **Does the scout still auto-collect surface food** (`COLONY.scoutForageBonus`) once
   fighters retrieve autonomously, or should the player's own pickups route through the
   same stockpile/Queen choice?

---

## 7. Addendum — mechanics read from reference screenshots

Five gameplay screenshots (Level 3) were reviewed after the plan above was written. They
**confirm** two recommendations and **add six mechanics** the text brief didn't mention.

### 7.1 Confirmed

- **Authored chambers, not depth bands (§#1 option B).** The nest is clearly a *vertical
  main shaft with horizontal branches* into discrete rooms — a Queen chamber and a storage
  chamber are visible as carved tan pockets in dark dirt. This is exactly option B.
  **Treat the gate-style decision as settled unless you disagree.**
- **Queen food counter is separate from the stockpile (§#2/#3).** The HUD reads
  `Food: 1/16` on the surface and `Food: 4/16` in the Queen's chamber — same counter,
  and it sits *with the Queen*. That validates `colony.queenFood` being distinct from
  `colony.food`, and confirms the reference's larva threshold is **16**.

### 7.2 New mechanics visible in the screenshots

| # | Observed | Our current state | Proposed |
|---|---|---|---|
| A | **Carry capacity with a red `MAX` flag** — an ant carrying eggs shows "MAX" once full | `f.carrying` is a **boolean** (1 item), `FORAGER.carryValue = 12` fixed | Make carrying a count: `f.load` / `FORAGER.carryCap`. Fighters that clear several drops shouldn't teleport all of it home in one trip — this is what makes retrieval *trips* matter in #2. |
| B | **HP bars floating over surface creatures** | Enemies have `hp: 3` but **no bar**; only soldiers get damage pips (`colony.js:255`) | Add a small bar in `drawEnemies()`, mirroring the existing `drawNestHpBar()` style. Cheap, and it's the single biggest combat-readability win for #6. |
| C | **Multiple fighters converge on one target** — two red ants attacking one pill bug | `soldierBehavior()` targets *nearest to self*, so convergence is incidental | Add mild target-sharing: prefer an enemy already engaged by another fighter. Makes autonomy (#5) read as coordinated rather than scattered. |
| D | **Storage chamber has visible capacity slots** — empty circles + a chest | Stockpile is an abstract number | Give the granary room N drawn slots that fill as `colony.food` rises. Turns the abstract "stockpile vs Queen" choice (#2) into something you can *see*. |
| E | **A `Take` button with an up-arrow at the storage chamber** | No storage interaction | Contextual prompt — the existing `actionPrompt()` pattern (`underground.js:135`) already does exactly this kind of proximity button. Lets the player pull food back out to hand-feed the Queen. |
| F | **Distinct ant colours = castes** — black, red, and green ants on screen simultaneously | We have forager tan / soldier dark / builder green | Already aligned. Worker→green, Fighter→red, scout stays orange. **No new atlas rows needed**; just palette assignment. Reinforces the caste-lock recommendation (§#3) — colour only reads as caste if it's stable. |

### 7.3 Deliberately NOT copying

- **`Rank: 6`** — a leaderboard/monetization hook. No fit with Ant Scout's single-player
  survival framing.
- **`Level 3` discrete levels** — Ant Scout is continuous with map unlocks via
  `PROGRESSION.milestones`. Gates (#1) already provide the milestone beat; adding a level
  system on top would compete with it.
- **The three ad placements.** Noted only because they occupy ~15% of the reference's
  screen — our HUD budget is genuinely larger than theirs, so the gate progress bar and
  colony readout can be more informative without crowding.

### 7.4 Effect on sequencing

None of these change the 9A–9F order. Fold them in as:
- **B** (enemy HP bars) → pull into **9E**, or even ship standalone before 9A; it's
  self-contained and improves the game immediately.
- **A** (carry capacity) → **9A**, since it's economy plumbing.
- **C** (target sharing) → **9E**.
- **D, E** (storage slots + Take button) → **9B**, alongside chamber construction.
- **F** (caste colours) → **9C**, with the caste lock.

---

## 8. Queen Rank — corrected from §7.3

§7.3 (doc lines 345–346) calls **`Rank: 6`** "a leaderboard/monetization hook" with "no fit with Ant Scout's single-player survival framing." That is wrong, and it should be struck. Verified by the owner from direct play: **Rank is the Queen's level — the cumulative number of larvae hatched — and the food cost of the next larva escalates with it.** It is single-player by construction (nothing is compared to anyone), and it is precisely the HUD surface for the mechanic §#3 already plans to build. §7.3's other two exclusions (discrete "Level 3", ad placements) stand unchanged. One other line goes with it: §7.1 (doc line 330) says the screenshot "confirms the reference's larva threshold is **16**" — it does not. 16 is the cost at *one particular rank*, not a flat threshold, and it must not be ported (see §8.1).

### 8.1 The observed mechanic

| Observation | Source | Confidence |
|---|---|---|
| Rank = cumulative larvae hatched | Owner hatched 6 larvae (3 red + 3 green), HUD read `Rank: 6` | High |
| Caste split does **not** affect rank | 3+3 produced rank 6, not two counters | High |
| First larva cost ≈ 5 food | Owner: "It started with like 5 foods" | **Approximate — owner's own word is "like"** |
| Cost escalates every rank, noticeably | Owner: "each level up make it where you had to give the queen more food" | High |
| At rank 6 the pair reads `Food: 4/16` | Screenshot | High (value), ambiguous (semantics) |
| Queen food is a counter separate from the stockpile | Same HUD reads `Food: 1/16` on the surface and `4/16` in the chamber | High — already recorded in §7.1 |

**The ambiguity about 16.** Rank counts larvae *hatched*, so at `Rank: 6` six larvae are already paid for. `4/16` therefore admits two readings:

- **Reading A — 16 is the cost of the NEXT larva (the 7th).** Growth is 5 → 16 over six steps (3.2×): ≈ +1.83/rank linear, ×1.214 geometric, or 0.25·n(n−1) quadratic.
- **Reading B — 16 is the cost indexed to the current rank (the 6th, already paid).** Growth compresses into five steps: +2.2/rank, ×1.262, or 0.366·n(n−1). Arises if the game indexes its table by `rank` instead of `rank+1`.

Reading B is uniformly ~20–25% steeper than A. **A third caveat outweighs both:** the base is explicitly approximate. If it is 4 the total growth is 4.0×; if 6, 2.67× — a range that already spans both readings.

**Two data points cannot identify the curve family.** Over the observable range the candidate families are indistinguishable — under Reading A: linear `5,7,9,11,12,14,16`; geometric `5,6,7,9,11,13,16`; quadratic `5,6,7,8,10,13,16`; piecewise `5,6,7,9,11,13,16`. They only diverge past rank 10, which nobody screenshotted. **Do not spend more effort reverse-engineering the reference.** Exactly two facts are load-bearing and both are already captured above: rank counts larvae regardless of caste, and the cost escalates monotonically and noticeably from the first level-up.

**Two consequences for us:**

1. **Implement Reading A semantics in our HUD** — always display the cost of `rank + 1`. A denominator describing an already-paid cost is not actionable.
2. **Do not port 16.** `FORAGER.carryValue = 12` (`js/core/config.js:133`) means 16 is 1.33 forager deliveries — a 3-forager starting colony would climb several ranks a minute. Their food unit is a morsel; ours is a 12-food delivery. The curve has to be set against our economy (§8.2). This also supersedes doc line 330 and the `~24–36` estimate at doc lines 122–123.

### 8.2 Cost curve

**Recommended: a banded step table, every cost a whole multiple of `FORAGER.carryValue` (12), bounded from rank 19.** A band table is idiomatic here — `PROGRESSION.milestones` (`config.js:170–173`), `ENEMY_TYPES` (`config.js:37–60`) and the plan's own `NEST_GATES` (doc lines 85–89) are all literal data. A magic exponent is not, and a geometric curve is disqualified outright: our economy has a hard ceiling (§ below), so anything growing faster than roughly linear outruns it and turns late ranks into the idle-game grind we are trying to improve on.

```js
// js/core/config.js — Queen rank / larva cost. Bounded on purpose: this is a session game.
// Every cost is a whole number of forager deliveries, so the HUD reads as "N more trips".
const QUEEN = {
  larvaBase: 24,        // rank 1 = 2 forager deliveries (2 * FORAGER.carryValue)
  larvaCostMax: 600,    // 50 deliveries — hard anti-grind ceiling
  larvaBands: [         // food ADDED to the previous rank's cost
    { upTo: 5,  step: 12 },   // ranks 2-5   : +1 trip each
    { upTo: 9,  step: 24 },   // ranks 6-9   : +2 trips
    { upTo: 13, step: 36 },   // ranks 10-13 : +3 trips
    { upTo: 19, step: 48 },   // ranks 14-19 : +4 trips
  ],                          // ranks 20+   : flat
  healSec: 6, healPerWorker: 0.15, r: 22,   // (unchanged from doc line 261)
};

// cost of the larva that RAISES the colony to `rank`  (rank === cumulative larvae hatched)
function larvaCost(rank) {
  let c = QUEEN.larvaBase;
  for (let i = 2; i <= rank; i++) {
    const b = QUEEN.larvaBands.find(b => i <= b.upTo);
    c += b ? b.step : 0;
  }
  return Math.min(QUEEN.larvaCostMax, c);
}
// closed form, identical output:
//   rank <=  5 : 12 * (rank + 1)      rank <=  9 : 24 * rank -  48
//   rank <= 13 : 36 * rank - 156      rank <= 19 : 48 * rank - 312     rank >= 20 : 600
```

This **supersedes `QUEEN.foodPerLarva: 28`** (doc line 261). Keep `foodPerLarva` only as an alias for `larvaCost(1)` if something already references it.

**Measured economy.** I ported `foragerBehavior` (`js/systems/colony.js:78–116`), the respawn loop (`js/systems/props.js:12–18` plus the forager's own respawn write at `colony.js:103`) and the exact `hash01` item scatter from `SurfaceScene.build()` (`js/maps/surface_backyard.js:52–66`) into a headless 60 fps sim (`/tmp/claude-0/-home-user/96160b5d-3c24-578d-8a39-e986daf3fc1a/scratchpad/antscout.js`, `rank_final.js`; 300 s × 4 trials per sample point).

| pop | 1 | 3 | 5 | 8 | 12 | 20 | 30 | 50 |
|---|---|---|---|---|---|---|---|---|
| food/s | 0.72 | 1.57 | 2.50 | 2.99 | 3.44 | 4.22 | 5.08 | 5.87 |
| per ant | 0.72 | 0.52 | 0.50 | 0.37 | 0.29 | 0.21 | 0.17 | 0.12 |

**The economy has a hard ceiling of 14 items × 12 food ÷ 22 s = 7.64 food/s** (`SURFACE_THEME.counts.food` and `food.respawnSec`, `config.js:29–30`), and per-ant productivity collapses ~6× from pop 1 to pop 50 — foragers at high population spend nearly all their time in the `'out'` wander state, because `FORAGER.searchRadius` is 9 cells / 270 px (`config.js:132`) against ~785 px mean item spacing. That single fact is why the curve must be bounded and sub-geometric.

**Time to rank** (banded curve above; population = 3 + larvae, no losses; "@70%" = a realistic split where 30% of deliveries go to the stockpile):

| Rank | Cost | = trips | Cumulative food | Pop | food/s | Time @100% | Cum @100% | Time @70% | Cum @70% |
|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| 1 | 24 | 2 | 24 | 3 | 1.57 | 15s | 0:15 | 22s | 0:22 |
| 2 | 36 | 3 | 60 | 4 | 1.83 | 20s | 0:35 | 28s | 0:50 |
| 3 | 48 | 4 | 108 | 5 | 2.50 | 19s | 0:54 | 27s | 1:17 |
| 4 | 60 | 5 | 168 | 6 | 2.45 | 24s | 1:19 | 35s | 1:52 |
| 5 | 72 | 6 | 240 | 7 | 2.72 | 26s | 1:45 | 38s | 2:30 |
| 6 | 96 | 8 | 336 | 8 | 2.99 | 32s | 2:17 | 46s | 3:16 |
| 8 | 144 | 12 | 600 | 10 | 3.13 | 46s | 3:42 | 66s | 5:18 |
| 10 | 204 | 17 | 972 | 12 | 3.44 | 59s | 5:33 | 1m25s | 7:56 |
| 13 | 312 | 26 | 1800 | 15 | 3.91 | 80s | 9:13 | 1m54s | 13:10 |
| 15 | 408 | 34 | 2568 | 17 | 4.03 | 1m41s | 12:25 | 2m24s | 17:44 |
| 19 | 600 | 50 | 4680 | 21 | 4.32 | 2m19s | 20:47 | 3m18s | 29:41 |
| 20 | 600 | 50 | 5280 | 22 | 4.42 | 2m16s | 23:03 | 3m14s | 32:55 |
| 25 | 600 | 50 | 8280 | 27 | 4.86 | 2m03s | 33:41 | 2m56s | 48:07 |
| 30 | 600 | 50 | 11280 | 32 | 5.14 | 1m57s | 43:35 | 2m47s | 62:15 |

**Read the shape, not the seconds.** Ranks 1–5 are all under 40 s even at 70% share; rank 10 lands at ~6–8 minutes cumulative (one good session); rank 20 is a ~23–33 minute multi-session goal; and from rank 19 the cost stops rising while the colony keeps growing, so per-rank time *falls* toward a permanent floor. **There is no grind spiral by construction.**

Four honesty notes on those numbers:

1. **They are noisy.** The sim is stochastic; pop 5 measuring *faster* than pop 6 (2.50 vs 2.45) is sampling noise, not a real inversion. Treat every time as ±15%, and re-tune on device before committing constants.
2. **`moveAnt` is frame-rate dependent.** `f.x += mx * speed` with no `dt` term (`colony.js:45`) against a `requestAnimationFrame` loop with `dt` clamped at 0.05 (`js/main.js:45`) — 1.6 px/frame ≈ 96 px/s at 60 Hz. On a 120 Hz iPhone foragers move twice as fast, but the food *respawn* is `dt`-scaled (`props.js:15`), so throughput cannot exceed the 7.64 food/s ceiling. **Early, search-limited ranks (pop ≲ 8) get materially faster on a high-refresh device; late ranks barely move.** Pre-existing bug, out of scope, but it means these times are a 60 Hz baseline.
3. **Active play is the main lever, and that is deliberate.** Each spider killed drops a permanent `noRespawn` food item (`js/systems/combat.js:119–124`, `COMBAT.drop`, `config.js:88`) worth +12 when hauled in — roughly +0.6 food/s at one kill per 20 s, a **~+18% throughput swing at pop 12**. Combat being the fastest route to rank is the answer to "improve on the reference."
4. **The reward ladder must not touch `FORAGER`/`SOLDIER` economy constants** (§8.4 anti-patterns). `searchRadius` is the single highest-leverage number in the economy; granting +searchRadius or +carryValue as a rank reward invalidates every row above by 20–40%. One owner for economy constants: the curve.

### 8.3 Conflicts with existing progression

| Axis | Problem | Sev | Fix (firm) |
|---|---|---|---|
| **Duplicates the auto-hatch?** | **Yes — ~80% redundant.** `updateColony()` already converts stockpile food into population on a flat cost with a cooldown: `colony.food >= COLONY.foodPerAnt` → `ants.push(spawnForager(...))` (`colony.js:183–188`, `foodPerAnt: 25` / `hatchCooldown: 4`, `config.js:112–113`). Same input, same output. Rank adds a separate currency, an escalating cost, a visible decision, and a counter that survives `newGame()`. Ship both and the free automatic pump strictly dominates. | High | **Delete `colony.js:183–188` in 9C — do not gate it, do not keep a fallback.** Keep `COLONY.hatchCooldown` as larva-embodiment pacing. `COLONY.foodPerAnt` has **three** consumers, not two: `colony.js:183`, `:184`, and **`js/menu.js:69`** (`set('colHatch', … + COLONY.foodPerAnt)`), which fills the "🥚 Next forager" row at `index.html:112`. Deleting the constant without rewriting that row renders `0 / undefined`. Rewrite `menu.js:69` and relabel `index.html:112` to the rank/larva pair in the same commit. |
| **`colony.food` loses its only sink** | `colony.js:183` is the *sole* consumer of the stockpile. Grepped every reference: written at `:24` (reset), `:41` (deposit), `:184` (hatch), `:206` (nest fall); read at `:183`, `:275` (HUD), `menu.js:65`/`:69`. Delete the hatch and the stockpile becomes a number that only goes up. The headline "stockpile vs Queen" choice (doc §#2, lines 107–111) is then **fake** for the whole 9C→9D window the doc's own ordering creates. | High | Ship the 9D heal sink (`colony.food -= 1; colony.injured--`, doc lines 153–160) **in the same commit as 9C**, or give 9C an interim sink: stockpile food buys instant nest repair at the anthill, mirroring `BUILDER.repairRate` (`config.js:161`) against the already-live `colony.nestHp` (`colony.js:197–201`). |
| **Scene boundary** | Hatching is hard-wired to the backyard: `manager.js:86` passes `scene.id === 'surface' ? scene.ants : null`, and `colony.js:183` short-circuits on `if (ants && …)`. The Queen lives in an *underground* nursery (doc lines 289–290). As written, **rank can never advance while the player stands in the Queen's chamber feeding her.** | High | Split the concerns. The `queenFood` threshold check runs inside `updateColony()` **before** the `if (ants)` guard, so it ticks in every scene; a produced larva pushes to `colony.pendingSpawn`, which the existing surface-only block drains into `ants`. Do not widen `manager.js:86` — `SurfaceScene.ants` is the only ants array (`surface_backyard.js:25`) and `foragerBehavior` is bound to that scene's items/bounds. This also fixes the pre-existing park/house dead zone. |
| **`COLONY.maxAnts` cap** | Yes, 50 stalls rank, silently and perversely. The gate reads the array (`ants.length < COLONY.maxAnts`, `colony.js:183`, `config.js:110`). If rank increments on *spawn*, at cap it freezes while `queenFood` keeps climbing with no feedback — and the only things that free a slot are attrition: a soldier dying (`colony.js:161`) or the nest-fall cull (`colony.js:209–212`). The player's only route past the cap becomes letting the colony get hurt. | High | **Rank counts larvae PRODUCED, not ants alive** — increment the instant `queenFood` crosses the threshold; the cap only throttles embodiment. This matches the reference exactly (the owner counted larvae hatched). Clamp `pendingSpawn` (max ~5) so the HUD can read "3 larvae waiting" instead of a dead counter, and let rank raise the cap modestly: `maxAnts = min(50 + (rank >> 2), 80)`. Do not go far past 80 — `drawAnts()` runs ~10 canvas ops per ant on the vector path with only off-screen culling (`colony.js:220–259`, cull at `:224`). |
| **Nest fall** | Rank must **not** roll back, and rolling it back would be exploitable: if cost is a function of rank, dropping 10→7 also drops the *price* back to `larvaCost(7)`, so the setback partially self-heals and banked food re-buys lost ranks at a discount. Nest fall is already designed to be survivable (`colony.js:204–206` refills HP to 35% and halves food). | Med | **Rank is monotonic — it never decreases, from nest fall, scout death, or anything else.** Precedent already in the file: `colony.totalCollected` is incremented at `colony.js:41`, zeroed by `resetColony` (`colony.js:26`), and deliberately untouched by `onNestFallen` (`colony.js:204–216`). Give the setback teeth on the in-progress bank instead — add `colony.queenFood = Math.floor(colony.queenFood * (1 - COLONY.nestFallFoodLoss));` right after `colony.js:206`. Losing an almost-complete larva stings; losing a title does not. |
| **Nest-fall cull vs castes** | The cull sorts `surf.ants` by `a.job === 'forager'` (`colony.js:211`) to spare defenders — but `job` is reassigned freely every surface frame by `reconcileJobs()` (`colony.js:51–67`). Under a caste lock, `job === 'forager'` means "whatever the reconciler had nothing better to do with," so the cull deletes rank-purchased fighters arbitrarily while Rank stays unchanged. | Med | Once castes exist, sort by `caste` primary and `job` secondary, and track `colony.casteCount = { worker, fighter }` at spawn / decrement in the cull, so the colony panel (`menu.js:63–77`) can explain the gap. |
| **Persist vs reset** | **Persist.** The deciding fact is structural: a run currently *ends* at the first gem. `won = true` (`underground.js:104`) freezes the sim (`manager.js:80`), and the only exits are "Play again" (`render.js:511–513`) or Enter (`main.js:26`), both calling `newGame()` → `resetColony()` (`manager.js:31–40`, `colony.js:23–28`) and rebuilding `SurfaceScene.ants` from `COLONY.startAnts = 3` (`surface_backyard.js:85`). A per-run Rank has a maximum lifespan of one gem run and would peak around 3–6 — the escalating curve, i.e. the entire mechanic, would never be felt. | High | Persist `{ rank, queenFood, dug, gates }` via a **`saveNest()` / `loadNest()` pair beside `saveProgress`** (`progression.js:11–26`) writing a **separate** localStorage key `antscout.nest`. Separate because `loadProgress` swallows all exceptions (`progression.js:16–26`) — a corrupt nest blob must not silently reset the player's gem unlocks. Call `loadNest()` at `main.js:36`; call `saveNest()` wherever `recordWin()` calls `saveProgress()` (`progression.js:53`) and on each rank-up. **This reverses the corrected block at doc lines 245–251 ("Persist nothing from `colony`") — see §8.7 #1.** |
| **Silent half-persistence** | `const colony` is declared once at `state.js:96` and lives for the page session. Any key added there but *not* listed in `resetColony()` accidentally survives `newGame()` but **not** an app relaunch — per-session-but-not-per-install, invisible in testing, and one future line in `resetColony` silently reverts it. | High | Make the lifetime explicit: add a comment-delimited **per-run** block to `resetColony()` enumerating all of it (today: eight keys / nine assignments at `colony.js:24–27`, two of which are set to `COLONY.nestHpMax`, not zero) and a **persistent** block that `resetColony` must never touch. |
| **Rank with no per-run meaning** | If rank persists but every run rebuilds from `COLONY.startAnts = 3` (`surface_backyard.js:85`, `config.js:111`), a rank-30 and a rank-1 player start identically and rank is vanity. Worse, a returning rank-20 player faces a 600-food larva at 1.57 food/s ≈ 6.4 minutes, versus ~3 minutes in the session they earned it. | Med | Spend rank at run start: `const n = Math.min(10, COLONY.startAnts + Math.floor(colony.rank / 3));` at `surface_backyard.js:85`, plus the rank-derived `maxAnts` above. Three lines, and it is what converts Rank from a number that *looks* like a leaderboard into meta-progression. Also add a **"Keep playing"** button next to "Play again" (`render.js:494–513`, `main.js:15–20`) that clears `won` without `newGame()` — `treasure.home` is already set so the objective string at `underground.js:125` reads correctly. ~10 lines, worth doing on its own merits. |
| **The larva choice is currently fake** | The Fighter side is economically dominated, and it is not even an unlock — the player can already set any soldier count for free via the ± stepper (`index.html:117`, `menu.js:152–158`, `reconcileJobs` `colony.js:51–67`), and doc line 274 says Fighter reuses the soldier row. So the caste lock **takes away a free feature and resells it one larva at a time.** Meanwhile soldiers don't forage (`colony.js:170`), are the *only* ants a spider will ever attack (`if (s.dead \|\| s.job !== 'soldier') continue;` — `combat.js:32`, so foragers are literally invulnerable), and are the only ants that can die (`combat.js:71` → `colony.js:161`). All they buy is nest HP — which self-heals free (`COLONY.nestRegen` 0.5/s, `config.js:116`, `colony.js:190–192`), is repaired free (`BUILDER.repairRate` 6/s, `config.js:161`, `colony.js:149`), and whose loss is explicitly survivable. **"Always Worker" is strictly dominant.** This is economic, not a UI problem. | High | Either pull **9E** (fighter drop-retrieval, doc lines 165–171) **in front of 9C** so a Fighter has income the day the choice ships, or relax the `s.job !== 'soldier'` filter at `combat.js:32` so spiders threaten foragers and protection has a measurable food/s value. **Until one of those lands, ship rank with a single caste and no choice** rather than a choice the player will correctly ignore. |
| **Dig gate pacing** | `newGame()` drops the player underground (`manager.js:39`) at rank 0 with `COLONY.startFood = 0` (`config.js:114`). The Queen sits behind the nursery gate at `dug >= 40` (doc line 86) — but 40 digs is only ~11 s of held digging (`hp` init 1, `world.js:25`; `hp[id] -= DIG.rate * (60*dt)` at `underground.js:78` with `DIG.rate 0.06`, `config.js:22` = 3.6 hp/s = 0.278 s/cell). Meanwhile the gem cavern generates at rows **40–59** (`world.js:36`, `ROWS = 120`, `config.js:10`) against `surfaceRow 10` — 30–49 cells to the gem centre, ~26–45 to the cavern ceiling (`carveDisc(…, 5.5, 4)`, `world.js:37`). So a player following the stated objective (`underground.js:127`) crosses the nursery gate only shortly before reaching the run-ending gem: **the Queen would be introduced and destroyed inside the same minute.** The real gate is the run boundary, not the dig count. | High | Retune the first `NEST_GATE` from 40 digs to **~10–12** so the Queen exists from minute one — she is the tutorial for the whole phase, not an endgame reveal. Persist `colony.dug` so the 110/220 gates span runs (220 digs ≈ 61 s of *pure* digging is not a one-run target). |
| **Four undifferentiated axes** | The risk is not any single collision — it is that `wins`, `dug`, `rank` and `population` all resolve to "more ants / more stuff" and the player cannot tell which number to care about. | Med | Partition by reward **type**, and write the rule into the doc so later work obeys it: `progress.wins` → **maps and cosmetics only** (already true, `config.js:170–173`); `colony.dug` → **nest geometry only**; `colony.rank` → **colony capability only** (start population, cap, caste availability, hatch pacing, heal rate, weather sense); `colony.population` → a live resource, never a milestone gate. Under that partition Rank earns its place: it is the only axis that answers "my colony is permanently better at being a colony." |

One correction to a claim worth not repeating: Rank would **not** be the game's first monotonic number. `colony.totalCollected` never decreases and is already shown ("📦 Total collected", `index.html:111`, `menu.js:68`), and `maxDepthMM` is monotonic within a run (`underground.js:63`) and shown on the win screen (`render.js:502`). What is structurally new is **persistence** — both of those are zeroed by `resetColony` (`colony.js:26`) and `UndergroundScene.build` (`underground.js:33`).

### 8.4 What Rank unlocks

Every rank hands the player an ant — that is the baseline reward and it is always visible. The ladder is what rides on top. Two rules: **the first three rungs must each change something on screen within a second of being earned**, and **no rung may touch a `FORAGER`/`SOLDIER` economy constant** (§8.2 note 4).

| Rank | Unlock | Visible instantly? | Why here |
|---:|---|---|---|
| 1 | **Nursery lit.** The Queen visibly lays; a larva sprite appears in the chamber; the `👑 / 🥚` pair is promoted from the tap-to-open colony panel onto the always-on HUD (§8.5). | Yes | Rank 1 is the only rung *every* player sees. The promotion alone is not a reward — the visible lay is. |
| 2 | **Second ant colour enters the world.** Caste palette per §7.2F (doc line 341) — worker→green reuses `ANT_SPRITE.row.builder = 2`, fighter→red reuses `.soldier = 3` (`config.js:229`). Free **only** because both map onto existing rows. | Yes | The cheapest possible "my colony changed" signal, and it makes the caste read stable, which is what the caste lock depends on. |
| 3 | **Brood capacity 1 → 2.** `pendingSpawn` can hold two larvae, and the nursery renders the second slot. A full bank is no longer wasted while you are underground or at the ant cap. | Yes | Solves a real annoyance created by §8.3's produced-vs-embodied split, and the chamber visibly gains a thing. |
| 4 | **🌤 Forecast.** Append `&hourly=weather_code,precipitation_probability&forecast_hours=12` to the request at `weather.js:71–73` (today it requests only `&current=`), store as `weather.forecast`, and extend the weather chip (`render.js:436–451`) to a second line: `🌧️ in ~2h`. | Yes | **The most defensible reward in the game.** The reference structurally cannot copy it — it has no sky. It also converts doc §#2's stockpile-vs-Queen toggle from a vibe into a plan ("bank to the Queen now, storm at 4"). Cost is a URL string plus a chip line, so it does *not* depend on 9F. |
| 6 | **Weather sense.** When the R4 forecast shows precipitation inside the hour, foragers currently outside bank what they carry and shelter — they reuse the existing `'home'` haul path (`colony.js:108–115`). | Behaviour, seen on the next front | Rank as institutional memory, and the first reward that *prevents* loss rather than inflating a number. Depends on R4's data, not on it currently raining. |
| 7 | **Fighter caste available** (soldier row, red). | Yes | **Only ship this rung if 9E or the `combat.js:32` change has landed** — otherwise it is an unlock for a dominated option (§8.3). |
| 9 | **Hatch pacing.** `COLONY.hatchCooldown` 4 → 3 for larva embodiment, so a banked queue drains visibly faster. | Yes (queue drains) | Pure capability; does not change food/s, so §8.2's table survives. |
| 12 | **Royal larder.** A nest fall no longer raids `colony.queenFood` (removes the §8.3 setback). | Felt on the next fall | Standing capability, always-on, and it retires a punishment the player has now outgrown. |
| 15 | **Population cap** `maxAnts` 50 → 60. | Yes, eventually | Changes nothing in the cost table before rank 47; it is headroom, not throughput. |
| 20+ | **Queen visual tiers + caste roster record.** Cosmetic only. | Yes | The curve flatlines at rank 19 and `COLONY.maxAnts` caps meaningful larvae around rank 47 anyway. Past 19 rank is a title, not a difficulty curve — give it a look, not power, and let `colony.dug` carry the late-game gates. |

**Anti-patterns — do not do these:**

- **Do not put economy stat bumps on the ladder.** `+searchRadius` / `+carryValue` are the two highest-leverage constants in the game (`config.js:132–133`); a single +25% `carryValue` rung makes every §8.2 time from that rank on 20–40% wrong. Constants belong to the curve.
- **Do not gate a rung on a weather *state*.** `env.mode` defaults to `'live'` (`state.js:12`), so the sky is the player's real local weather; `weather.storm` requires WMO code ≥ 95 (`weather.js:57`, committed at `weather.js:62`, declared `state.js:64`). A storm-gated reward is dead content for most sessions, and a rain-gated one punishes players whose city is rainy. **Weather rewards must be always-on readouts or standing behaviours.** Weather stays a *rate modulator* everywhere else (doc §3 table, lines 216–222) — scale forager speed and drop rates, never the larva cost. Because the curve is bounded, a weather penalty can only stretch a 2-minute rank to 3.
- **Do not ship rungs that depend on 9F.** Weather coupling is sequenced last on purpose (doc lines 294–295). R4 is the deliberate exception because it is a fetch string and a chip line, not a coupling.
- **Do not reward with a caste that has no atlas row.** `drawAntSprite()` has exactly one `false` path — `if (!antSheetReady) return false;` (`sprites.js:31`). An unrecognized role falls through `(S.row[role] != null) ? S.row[role] : 0` (`sprites.js:34`) to **row 0 = forager** (`config.js:229`) and returns `true` (`sprites.js:54`), so a "nurse" would blit as a brown forager whenever the atlas has loaded. The vector path is no escape either — `colony.js:225` computes only `sol`/`bld`, so `colony.js:232–233` would paint it in `FORAGER.bodyCol` too. A genuinely new caste needs a 5th atlas row (`ANT_SPRITE.rows` is 4, `config.js:227`) **or** an explicit vector branch. Doc line 266's "every new ant type can ship vector-first" is true only for entities that are not drawn through `drawAnts()`.
- **Do not take away something free and resell it.** The soldier stepper already gives caste control at zero cost (`index.html:117`, `menu.js:152–158`).
- **Do not make rank 1's reward "a HUD element appears."** Chrome is not a reward, and rank 1 is the rung that decides whether the player believes the system.

### 8.5 HUD

Put Rank and the queen-food pair **inside the existing `drawColonyReadout()` label**, not in a fourth pill. The HUD column is already spoken for: objective pill at `safeTop + 52` (`underground.js:128`), weather chip at `safeTop + 90` (`render.js:448`), the planned gate progress bar under that (doc lines 91–92), colony readout at `safeTop + 176` (`colony.js:277`). `drawColonyReadout` already measures its own text and grows with its content (`colony.js:275–277`), so extending the string is free.

```js
// js/systems/colony.js — replaces the two-value label at colony.js:275
function drawColonyReadout() {
  ctx.textBaseline = 'alphabetic'; ctx.textAlign = 'start';
  const need = larvaCost(colony.rank + 1);            // Reading A: ALWAYS the next larva
  const q    = Math.floor(colony.queenFood);
  const wait = colony.pendingSpawn ? ' +' + colony.pendingSpawn : '';   // larvae waiting on the cap
  const label = '👑 ' + colony.rank + '   🥚 ' + q + '/' + need + wait +
                '   🐜 ' + colony.population + '/' + COLONY.maxAnts +
                '   🍖 ' + Math.floor(colony.food);
  ctx.font = '700 13px -apple-system,sans-serif';
  const x = 10 + safeLeft, y = safeTop + 176, w = ctx.measureText(label).width + 18, h = 26;
  ctx.fillStyle = 'rgba(10,8,6,.5)'; roundRect(x, y, w, h, 8); ctx.fill();
  ctx.fillStyle = '#ffd9a6'; ctx.fillText(label, x + 9, y + 16);
  // hairline progress bar: queen food toward the next larva
  const bw = w - 18, f = clamp(q / (need || 1), 0, 1);
  ctx.fillStyle = 'rgba(255,255,255,.18)'; ctx.fillRect(x + 9, y + h - 5, bw, 2);
  ctx.fillStyle = '#ffd23a';               ctx.fillRect(x + 9, y + h - 5, bw * f, 2);
}
```

Three things this depends on:

- **`colony.population` is stale outside the backyard.** Five write sites — `colony.js:26` (reset), `:164` (`updateAnts`), `:187` (inside the auto-hatch block being deleted), `:213` (`onNestFallen`), and `surface_backyard.js:89` — all reachable only via surface-driven paths (`updateAnts` is called from `surface_backyard.js:133`). Deleting `colony.js:183–188` removes one of them. Set `colony.population` from the ants array inside `updateColony()` so the count is right **in the Queen's own chamber**, which is exactly where the player will look hardest.
- **Width-check on a narrow phone.** Four fields at 13 px measure ~200 px on a 390 px viewport, before the `+N` suffix. If it crowds, drop the `🍖` field once the stockpile has a visible granary (§7.2D) — the number is still one tap away in the panel.
- **The colony panel must move with it.** `index.html:112` (`🥚 Next forager … 0 / 25`) and `menu.js:69` currently read `COLONY.foodPerAnt`; both become the rank/larva pair when the auto-hatch goes (§8.3 row 1).

### 8.6 Effect on sequencing

The 9A–9F order survives, with four amendments:

- **There is a 15-line cheap path, and it belongs in 9A.** Rank does **not** require the Queen. Make the larva cost a function of a new monotonic `colony.rank`, increment rank inside the existing hatch block (`colony.js:183–188`), and promote the existing `colHatch` string (`menu.js:69`, `index.html:112`) into `drawColonyReadout()`. That delivers both load-bearing facts from §8.1 — escalating cost, visible counter — with **no Queen entity, no chamber, no gate, no scene-boundary fix**. Doc §0.1 (lines 24–25) flags the Queen as the largest single item in the plan; she should be the *presentation* upgrade in 9C, not the prerequisite for the mechanic.
- **9A absorbs the persistence work as an explicit step.** `saveNest()`/`loadNest()` on the `antscout.nest` key, `loadNest()` at `main.js:36`, and the per-run / persistent comment split in `resetColony()`. Every later axis depends on the lifetime decision being settled first, so it cannot stay implicit in doc §4.
- **9B retunes the first gate** (nursery 40 → ~10–12 digs) alongside the `grid = 2` / `isSolid` fix already flagged at doc lines 253–257.
- **9C and 9D merge, or 9C carries an interim food sink.** Deleting the auto-hatch strands `colony.food` with zero consumers (§8.3 row 2). And **9E moves in front of 9C** if the Worker/Fighter choice is to ship at 9C at all — otherwise 9C ships one caste.
- **9F stays last, with one string pulled forward:** the `&hourly=` forecast parameter at `weather.js:71–73` plus the chip's second line, which is what makes the rank-4 rung shippable. Everything else weather-facing remains a rate modulator applied in 9F, and `weather.js` itself stays otherwise untouched as required by doc §3.

### 8.7 Open decisions

1. **Does Rank persist across runs?** Recommended: **yes**, on a separate `antscout.nest` key. This **directly reverses the corrected block at doc lines 245–251** ("Persist nothing from `colony`"), which was written to stop `dug`/`gates` turning runs into an idle-game save file. The counter-argument is now stronger: a run ends at the first gem, so a per-run Rank peaks around 3–6 and the escalating curve — the entire mechanic — is never felt. Accepting this means Ant Scout knowingly gains a **second meta-progression axis** alongside the gem milestones. Owner's call; everything else in §8 assumes yes.
2. **Reading A or B for the HUD denominator?** Recommended A (always show `larvaCost(rank + 1)`). Zero code impact beyond the index; A is the only reading a player can act on.
3. **Base cost 24 (two forager deliveries) instead of the reference's 5?** Recommended, because it makes every cost a whole number of trips and the HUD read as "N more deliveries." Confirm you want that framing rather than a smaller, more granular unit.
4. **Does the caste choice ship at 9C?** Only if 9E lands first or `combat.js:32` changes so foragers are attackable. Otherwise Rank ships with a single caste and the choice arrives with 9E. (§8.3, "the larva choice is currently fake.")
5. **Nursery gate at ~10–12 digs instead of 40?** This moves the Queen from an endgame reveal to minute one and is assumed by the whole ladder in §8.4.
6. **Is there a hand-feed mechanic at all?** There is currently **no food carry** to hang one on: `updateCollectibles` auto-collects on proximity and fires the handler immediately (`props.js:16`, `pickupRadius` 0.9 cells, `config.js:32`), the handler deposits instantly (`surface_backyard.js:120`, also `surface_park.js:80`, `house.js:122`), and `ant.carry` holds pebbles and the treasure only (`state.js:31`, `underground.js:10–22`). Either scope a real carry mechanic (with rules for scene switch and scout death) or keep scout deposits at `COLONY.scoutForageBonus = 4` (`config.js:118`). Note `HOUSE_THEME.sugar.colonyBonus = 150` (`config.js:204`) routes through the same `depositFood` at `house.js:115` — whatever branch you add has to handle it.
7. **What does rank 20+ pay out?** The curve is flat from 19 and `maxAnts` caps meaningful larvae near rank 47. §8.4 proposes cosmetic tiers; if that is too thin, the alternative is handing the late game to `colony.dug` and its gates, which is the axis with room left.