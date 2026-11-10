// Audio sfx-name seam tests (Candidate 4).
// Pins the audio module subscription seam: SoundEffects.play canonical dispatch
// + AUDIO_SFX_TABLE single-name subscriptions. Misses actual audio output.
// Run: npx tsx --test tests/audio-sfx-names.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundEffects } from '../src/audio/SoundEffects';
import { AUDIO_SFX_TABLE, AudioManager } from '../src/audio/AudioManager';
import { SynthContext } from '../src/audio/SynthContext';
import type { SfxName } from '../src/audio/types';
import { EventBus } from '../src/core/events';
import type { GameEvents } from '../src/types';

const CANONICAL: SfxName[] = [
  'ui:click',
  'ui:hover',
  'brew:start',
  'brew:done',
  'order:served',
  'combo:change',
  'customer:spawn',
  'customer:leave',
  'order:expired',
  'upgrade:bought',
  'drink:unlocked',
  'achievement',
  'goal:complete',
  'day:end',
  'game:over',
  'rush:start',
  'action:fail',
];

const EXPECTED_METHOD: Record<SfxName, string> = {
  'ui:click': 'playClick',
  'ui:hover': 'playHover',
  'brew:start': 'playBrewStart',
  'brew:done': 'playBrewDone',
  'order:served': 'playOrderServed',
  'combo:change': 'playCombo',
  'customer:spawn': 'playDoorBell',
  'customer:leave': 'playAngry',
  'order:expired': 'playBuzzer',
  'upgrade:bought': 'playUpgrade',
  'drink:unlocked': 'playUpgrade',
  'achievement': 'playFanfare',
  'goal:complete': 'playFanfare',
  'day:end': 'playDayEnd',
  'game:over': 'playGameOver',
  'rush:start': 'playAlert',
  'action:fail': 'playFail',
};

class SpySfx extends SoundEffects {
  calls: string[] = [];
  override playClick(): void { this.calls.push('playClick'); }
  override playHover(): void { this.calls.push('playHover'); }
  override playBrewStart(): void { this.calls.push('playBrewStart'); }
  override playBrewDone(): void { this.calls.push('playBrewDone'); }
  override playOrderServed(): void { this.calls.push('playOrderServed'); }
  override playCombo(): void { this.calls.push('playCombo'); }
  override playDoorBell(): void { this.calls.push('playDoorBell'); }
  override playAngry(): void { this.calls.push('playAngry'); }
  override playBuzzer(): void { this.calls.push('playBuzzer'); }
  override playUpgrade(): void { this.calls.push('playUpgrade'); }
  override playFanfare(): void { this.calls.push('playFanfare'); }
  override playDayEnd(): void { this.calls.push('playDayEnd'); }
  override playGameOver(): void { this.calls.push('playGameOver'); }
  override playAlert(): void { this.calls.push('playAlert'); }
  override playFail(): void { this.calls.push('playFail'); }
}

const LEGACY_ALIASES = [
  'click',
  'hover',
  'brew_start',
  'brew_done',
  'order_served',
  'combo',
  'door_bell',
  'angry',
  'buzzer',
  'upgrade',
  'fanfare',
  'day_end',
  'game_over',
  'alert',
  'fail',
] as const;

class SpyBus extends EventBus<GameEvents> {
  subscribed: string[] = [];
  override on<K extends keyof GameEvents>(
    name: K,
    fn: (payload: GameEvents[K]) => void
  ): () => void {
    this.subscribed.push(String(name));
    return super.on(name, fn);
  }
}

test('(1) every canonical SfxName dispatches via play without throwing', () => {
  assert.equal(CANONICAL.length, 17);
  const synth = new SynthContext();
  for (const name of CANONICAL) {
    const spy = new SpySfx();
    assert.doesNotThrow(() => {
      spy.play(name, synth, name === 'combo:change' ? 5 : undefined);
    });
    assert.deepEqual(spy.calls, [EXPECTED_METHOD[name]]);
  }
});

test('(2) legacy alias spellings are not SfxName and stay silent via play', () => {
  assert.equal(LEGACY_ALIASES.length, 15);
  // Runtime pin (tsx --test never type-checks, so @ts-expect-error guards
  // would be dead comments): the canonical-name mirror holds exactly the 17
  // names and rejects every legacy spelling.
  const canonicalNames = new Set(Object.keys(EXPECTED_METHOD));
  assert.equal(canonicalNames.size, 17);
  assert.deepEqual(new Set(CANONICAL), canonicalNames);
  for (const alias of LEGACY_ALIASES) {
    assert.ok(!canonicalNames.has(alias), `alias '${alias}' must not be a canonical sfx name`);
  }

  // Runtime pin: routed through `as never`, each legacy spelling no-ops.
  const synth = new SynthContext();
  for (const alias of LEGACY_ALIASES) {
    const spy = new SpySfx();
    assert.doesNotThrow(() => {
      spy.play(alias as never, synth, 5);
    });
    assert.deepEqual(spy.calls, [], `alias '${alias}' must stay silent`);
  }
});

test('(3) every AUDIO_SFX_TABLE row names a matching GameEvents key', () => {
  assert.ok(AUDIO_SFX_TABLE.length > 0);
  const bus = new EventBus<GameEvents>();
  for (const row of AUDIO_SFX_TABLE) {
    // Type-level: row.event is keyof GameEvents, so this subscribes cleanly.
    const unsub = bus.on(row.event, () => {});
    // One event name, one sfx name: the table pairs each bus event with its
    // own canonical sfx spelling.
    assert.equal(row.sfx, row.event);
  }
  // Seam pin: the table is the module's single subscription list, so the
  // manager must register every row on the bus (a row with no subscription
  // would play no sound and this fails).
  const spyBus = new SpyBus();
  const manager = new AudioManager(spyBus);
  try {
    for (const row of AUDIO_SFX_TABLE) {
      assert.ok(
        spyBus.subscribed.includes(row.event),
        `AudioManager must subscribe '${row.event}'`
      );
    }
  } finally {
    manager.dispose();
  }
});

test('(4) combo:change forwards the numeric combo to playCombo', () => {
  const bus = new EventBus<GameEvents>();
  const manager = new AudioManager(bus);
  const received: number[] = [];
  const original = SoundEffects.prototype.playCombo;
  SoundEffects.prototype.playCombo = function (_synth: SynthContext, combo: number): void {
    received.push(combo);
  };
  try {
    bus.emit('combo:change', { combo: 7 });
  } finally {
    SoundEffects.prototype.playCombo = original;
    manager.dispose();
  }
  // Regression pin: the bus payload is { combo }, but playCombo needs the number.
  assert.deepEqual(received, [7]);
});
