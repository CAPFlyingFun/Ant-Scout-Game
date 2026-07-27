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
Empire of Ants has no weather. Right now Ant Scout's weather is *scenery*. Wiring these
new systems to it makes the whole adaptation defensibly ours rather than a reskin:

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
so no new persistence layer. Add these keys to the `antscout.progress` save in
`progression.js` (`saveProgress`/`loadProgress`).

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
