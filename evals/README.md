# Espresso Tycoon 3D — Evaluation & Test API

Automated evaluation and headless simulation testing framework for **Espresso Tycoon 3D** using Playwright, Vite, and Chromium with WebGL SwiftShader emulation.

---

## 1. Test API (`window.__game`)

When the application is launched with the query parameter `?test=1` (e.g. `http://localhost:4799/?test=1&seed=42`), the engine installs `window.__game` and sets `window.__gameReady = true`.

### API Surface

#### State Inspection
- `window.__game.getState()`: Returns a deep-cloned summary snapshot of the game state:
  ```ts
  {
    phase: 'menu' | 'playing' | 'day_end' | 'game_over',
    paused: boolean,
    speed: 1 | 2 | 4 | 10,
    money: number,
    day: number,
    clock: string,              // "08:30"
    clockMinutes: number,       // 510
    time: number,               // total sim seconds
    dayTime: number,            // sim seconds today
    rating: number,             // 1..5
    combo: number,
    rush: boolean,
    queue: number[],            // customer IDs in queue
    queueCapacity: number,
    customers: CustomerSummary[],
    orders: OrderSnap[],
    machines: MachineSnap[],
    seats: SeatSummary[],
    baristas: BaristaSnap[],
    upgrades: Record<UpgradeId, number>,
    unlockedDrinks: DrinkId[],
    prices: Record<DrinkId, number>,
    tutorial: TutorialState,
    dayStats: DayStats,
    history: DayStats[],
    goals: Goal[],
    achievements: string[],
    fps: number,
    minFps: number,
    entityCounts: { customers, orders, queue, machines, baristas },
    renderStats: { drawCalls, triangles, geometries, textures, meshes }
  }
  ```
- `window.__game.getRawState()`: Returns the raw serialized game state (`sim.serialize()`).

#### Actions (`window.__game.actions`)
All actions return an `ActionResult: { ok: boolean, reason?: string }`:
- `startGame(opts?: { seed?: number; tutorial?: boolean })`: Initializes and starts a new game.
- `clickStation(id: string)`: Interacts with station (e.g. `'machine:0'`, `'register'`, `'table:1'`).
- `brew(drink: DrinkId)`: Commands first idle machine to brew oldest pending order of this drink.
- `serve(machineId?: number)`: Serves coffee from ready machine.
- `buyUpgrade(id: UpgradeId)`: Purchases upgrade level if affordable.
- `unlockDrink(drink: DrinkId)`: Unlocks mocha or cold brew if affordable.
- `setPrice(drink: DrinkId, price: number)`: Updates selling price for drink.
- `setSpeed(speed: 1 | 2 | 4 | 10)`: Adjusts simulation speed.
- `advanceTime(simSeconds: number)`: Advances simulation synchronously in chunks of $\le 1$s, executing invariant checks on each chunk.
- `pause(bool: boolean)`: Pauses or resumes the simulation.
- `nextDay()`: Advances from `day_end` to next day.
- `skipTutorial()`: Skips interactive tutorial.
- `tutorialAck()`: Acknowledges dialog steps in tutorial.
- `save()`: Persists game to local storage.
- `load()`: Restores saved game.
- `resetSave()`: Clears saved state.
- `quitToMenu()`: Saves and returns to main menu.
- `dispatch(action: GameAction)`: Dispatches any valid `GameAction`.

#### Event Log (`window.__game.events`)
Ring buffer capturing the last 2000 events emitted via `EventBus`:
- `getEvents(sinceIdx?: number)`: Returns events recorded since optional index.
- `clearEvents()`: Resets ring buffer.

#### Errors & Invariants
- `window.__game.errors()`: Returns captured uncaught errors, unhandled promise rejections, bus errors, `console.error`, and `console.warn`.
- `window.__game.invariants.check()`: Immediately runs all invariants and returns any newly detected violations.
- `window.__game.invariants.violations()`: Returns all accumulated violations.
- `window.__game.invariants.clear()`: Clears accumulated violations.
- `window.__game.stationScreenPos(id: string)`: Projects 3D station position to `{ x, y }` CSS pixels relative to viewport for real mouse clicks.

---

## 2. Invariant Rules

The invariant checker runs throttled every 0.25 sim seconds during real-time advance and after every step of `advanceTime`:

1. `money_finite`: `money` is non-NaN, finite.
2. `rating_bounds`: `rating` is finite and in $[1.0, 5.0]$.
3. `customer_stuck`: No customer remains in the same state for $> 90$ sim seconds (or $> 60$ sim seconds if seated).
4. `order_customer_mismatch`: Every active order references an existing customer whose `orderId` matches.
5. `customer_order_missing`: Every active customer with an `orderId` references an existing order (unless served/leaving).
6. `machine_order_missing`: Machines brewing an order reference an existing active order.
7. `queue_capacity`: Queue length does not exceed `queueCapacity`.
8. `queue_ids_valid`: Queue customer IDs are unique, exist, and are in state `'queueing'` or `'ordering'`.
9. `seat_occupant_consistent`: Occupied seats reference valid customers whose `seatId` matches and state is `'to_seat'` or `'seated'`.
10. `entity_bounds`: All customers and baristas are within `LAYOUT.bounds` (+0.5m tolerance).
11. `customer_count_max`: Total customer count $\le$ `BALANCE.maxCustomers` (40).
12. `day_transition_leak`: At day transition (`phase === 'day_end'`), customers and active orders are cleared (count = 0).
13. `renderer_resource_leak`: Monitored per-day; flags $> 20\%$ mesh/geometry growth after day 3 without upgrade purchases.
14. `fps_floor`: Logs warning if FPS drops below configurable floor (default 30 FPS warning, 5 FPS failure).

---

## 3. Scenarios (`evals/scenarios/*.json`)

Each scenario defines bot configuration, test seeds, days, and thresholds:

| Scenario | Bot | Description |
|---|---|---|
| `random-clicker-fuzz` | `random-clicker` | Fuzz testing with seeded mouse clicks, UI button clicks, and hotkeys. |
| `greedy-optimal` | `greedy` | Plays optimal coffee shop loop (serves ready, brews pending, buys upgrades). |
| `idle` | `idle` | Never acts; verifies game bankruptcy / game over handling without crashes. |
| `upgrade-spammer` | `upgrade-spammer` | Aggressively purchases every upgrade level as soon as funds become available. |
| `speedrun-10x` | `speedrun` | Real-time playing at 10x simulation speed with real-time page timers. |
| `tutorial` | `tutorial` | Follows tutorial step-by-step using real clicks on 3D stations and DOM test IDs. |
| `keyboard` | `keyboard` | Verifies keyboard hotkeys (Space, F, Escape, B, 1). |
| `save-load` | `save-load` | Plays 1 day, saves, reloads page, continues, and verifies state equality. |
| `resize-blur` | `resize-blur` | Tests viewport changes (desktop/mobile) and auto-pause on tab hidden. |
| `fps-budget` | `fps-budget` | Measures real-time FPS on high quality with an active cafe. |

### DOM Test IDs
The UI provides stable data-testids used by automation:
- `btn-new-game`
- `btn-continue`
- `btn-shop`
- `btn-next-day`
- `btn-pause`
- `ticket-<orderId>`
- `money`
- `tutorial-card`
- `btn-skip-tutorial`
- `btn-tutorial-next`
- `day-end-modal`
- `settings-modal`
- `pause-menu`
- `shop-panel`
- `btn-buy-<upgradeId>`

---

## 4. Running Evaluations

### Quick Run (1 seed, 2 days per scenario)
```bash
npm run eval:quick
```

### Full Run (All seeds, default days)
```bash
npm run eval
```

### Targeted Scenario or Seed
```bash
# Run single scenario
npm run eval -- --scenario greedy-optimal

# Run single scenario on specific seed
npm run eval -- --scenario random-clicker-fuzz --seeds 42

# Override target days
npm run eval -- --scenario upgrade-spammer --days 3

# Skip build step (useful during active development)
npm run eval -- --scenario tutorial --no-build
```

---

## 5. Reports & Repro

Every run generates two reports in `evals/reports/`:
- `evals/reports/<ISO-TIMESTAMP>.json`: Complete machine-readable metrics and invariant snapshots.
- `evals/reports/<ISO-TIMESTAMP>.md`: Summary markdown table with pass/fail status, metrics, and exact repro commands for any failure.
- Screenshots are saved to `evals/reports/<ISO-TIMESTAMP>/` for all runs (final screenshot) and failures.
