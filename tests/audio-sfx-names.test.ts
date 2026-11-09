// Audio sfx-name seam tests (Candidate 4).
// Pins the audio module subscription seam: SoundEffects.play canonical dispatch
// + AUDIO_SFX_TABLE single-name subscriptions. Misses actual audio output.
// Run: npx tsx --test tests/audio-sfx-names.test.ts
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { SoundEffects } from '../src/audio/SoundEffects';
import { AUDIO_SFX_TABLE } from '../src/audio/AudioManager';
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

function assertSfxName(_name: SfxName): void {}

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
  // Type-level pin: each legacy spelling must NOT be assignable to SfxName.
  // If the union ever widens again, these lines fail tsc as unused directives.
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('click');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('hover');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('brew_start');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('brew_done');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('order_served');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('combo');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('door_bell');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('angry');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('buzzer');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('upgrade');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('fanfare');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('day_end');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('game_over');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('alert');
  // @ts-expect-error - legacy alias, not a canonical sfx name
  assertSfxName('fail');

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
    assert.equal(typeof unsub, 'function');
    unsub();
    // One event name, one sfx name: the table pairs each bus event with its
    // own canonical sfx spelling.
    assert.equal(row.sfx, row.event);
  }
});
