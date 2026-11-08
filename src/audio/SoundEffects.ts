import type { SynthContext } from './SynthContext';
import type { SfxName } from './types';

export class SoundEffects {
  public play(name: SfxName, synth: SynthContext, extra?: any): void {
    try {
      switch (name) {
        case 'click':
        case 'ui:click':
          this.playClick(synth);
          break;
        case 'hover':
        case 'ui:hover':
          this.playHover(synth);
          break;
        case 'brew_start':
        case 'brew:start':
          this.playBrewStart(synth);
          break;
        case 'brew_done':
        case 'brew:done':
          this.playBrewDone(synth);
          break;
        case 'order_served':
        case 'order:served':
          this.playOrderServed(synth);
          break;
        case 'combo':
        case 'combo:change':
          this.playCombo(synth, typeof extra === 'number' ? extra : 3);
          break;
        case 'door_bell':
        case 'customer:spawn':
          this.playDoorBell(synth);
          break;
        case 'angry':
        case 'customer:leave':
          this.playAngry(synth);
          break;
        case 'buzzer':
        case 'order:expired':
          this.playBuzzer(synth);
          break;
        case 'upgrade':
        case 'upgrade:bought':
        case 'drink:unlocked':
          this.playUpgrade(synth);
          break;
        case 'fanfare':
        case 'achievement':
        case 'goal:complete':
          this.playFanfare(synth);
          break;
        case 'day_end':
        case 'day:end':
          this.playDayEnd(synth);
          break;
        case 'game_over':
        case 'game:over':
          this.playGameOver(synth);
          break;
        case 'alert':
        case 'rush:start':
          this.playAlert(synth);
          break;
        case 'fail':
        case 'action:fail':
          this.playFail(synth);
          break;
        default:
          break;
      }
    } catch {
      // Guard all exceptions in headless or unsupported audio
    }
  }

  /** ui:click - soft tick */
  public playClick(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const dur = 0.035;

    if (!synth.registerVoice(osc, dur)) return;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(800, now);
    osc.frequency.exponentialRampToValueAtTime(320, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.002);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
  }

  /** ui:hover - very quiet blip */
  public playHover(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    const now = ctx.currentTime;
    const dur = 0.025;

    if (!synth.registerVoice(osc, dur)) return;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(1100, now);
    osc.frequency.exponentialRampToValueAtTime(1350, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.03, now + 0.003);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
  }

  /** brew:start - grinder burr noise ~0.6s + espresso pump hum */
  public playBrewStart(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;

    // 1. Grinder burr noise
    const noiseBuffer = synth.getBrownNoise() || synth.getWhiteNoise();
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const dur = 0.6;

      if (synth.registerVoice(noise, dur)) {
        noise.buffer = noiseBuffer;
        noise.loop = true;

        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(450, now);
        filter.Q.setValueAtTime(2.5, now);
        filter.frequency.linearRampToValueAtTime(520, now + 0.3);
        filter.frequency.linearRampToValueAtTime(380, now + dur);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.14, now + 0.08);
        gain.gain.setValueAtTime(0.14, now + 0.45);
        gain.gain.exponentialRampToValueAtTime(0.001, now + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        noise.start(now);
        noise.stop(now + dur);
      }
    }

    // 2. Espresso pump hum (~0.35s to 1.1s)
    const pumpOsc1 = ctx.createOscillator();
    const pumpOsc2 = ctx.createOscillator();
    const pumpFilter = ctx.createBiquadFilter();
    const pumpGain = ctx.createGain();
    const pumpStart = now + 0.35;
    const pumpDur = 0.75;
    const pumpEnd = pumpStart + pumpDur;

    if (synth.registerVoice(pumpOsc1, 0.35 + pumpDur)) {
      pumpOsc1.type = 'triangle';
      pumpOsc1.frequency.setValueAtTime(62, pumpStart);

      pumpOsc2.type = 'sawtooth';
      pumpOsc2.frequency.setValueAtTime(124, pumpStart);

      pumpFilter.type = 'lowpass';
      pumpFilter.frequency.setValueAtTime(240, pumpStart);

      pumpGain.gain.setValueAtTime(0.0001, now);
      pumpGain.gain.setValueAtTime(0.0001, pumpStart);
      pumpGain.gain.linearRampToValueAtTime(0.09, pumpStart + 0.12);
      pumpGain.gain.setValueAtTime(0.09, pumpEnd - 0.15);
      pumpGain.gain.exponentialRampToValueAtTime(0.0001, pumpEnd);

      pumpOsc1.connect(pumpFilter);
      pumpOsc2.connect(pumpFilter);
      pumpFilter.connect(pumpGain);
      pumpGain.connect(dest);

      pumpOsc1.start(pumpStart);
      pumpOsc2.start(pumpStart);
      pumpOsc1.stop(pumpEnd);
      pumpOsc2.stop(pumpEnd);
    }
  }

  /** brew:done - steam hiss filtered noise + ding */
  public playBrewDone(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;

    // Steam hiss
    const noiseBuffer = synth.getWhiteNoise();
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const dur = 0.45;

      if (synth.registerVoice(noise, dur)) {
        noise.buffer = noiseBuffer;
        noise.loop = true;

        filter.type = 'highpass';
        filter.frequency.setValueAtTime(2400, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.09, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        noise.start(now);
        noise.stop(now + dur);
      }
    }

    // Bell ding (at +0.12s)
    const dingTime = now + 0.12;
    const bellOsc = ctx.createOscillator();
    const bellHarmonic = ctx.createOscillator();
    const bellGain = ctx.createGain();
    const bellDur = 0.85;

    if (synth.registerVoice(bellOsc, 0.12 + bellDur)) {
      bellOsc.type = 'sine';
      bellOsc.frequency.setValueAtTime(1760, dingTime); // A6

      bellHarmonic.type = 'sine';
      bellHarmonic.frequency.setValueAtTime(3520, dingTime);

      bellGain.gain.setValueAtTime(0.0001, now);
      bellGain.gain.setValueAtTime(0.0001, dingTime);
      bellGain.gain.linearRampToValueAtTime(0.16, dingTime + 0.004);
      bellGain.gain.exponentialRampToValueAtTime(0.0001, dingTime + bellDur);

      bellOsc.connect(bellGain);
      bellHarmonic.connect(bellGain);
      bellGain.connect(dest);

      bellOsc.start(dingTime);
      bellHarmonic.start(dingTime);
      bellOsc.stop(dingTime + bellDur);
      bellHarmonic.stop(dingTime + bellDur);
    }
  }

  /** order:served - cash register 'cha-ching' + coin */
  public playOrderServed(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;

    // "Cha" metallic snap
    const noiseBuffer = synth.getWhiteNoise();
    if (noiseBuffer) {
      const noise = ctx.createBufferSource();
      const filter = ctx.createBiquadFilter();
      const gain = ctx.createGain();
      const snapDur = 0.06;

      if (synth.registerVoice(noise, snapDur)) {
        noise.buffer = noiseBuffer;
        filter.type = 'bandpass';
        filter.frequency.setValueAtTime(2200, now);
        filter.Q.setValueAtTime(3.0, now);

        gain.gain.setValueAtTime(0.001, now);
        gain.gain.linearRampToValueAtTime(0.12, now + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + snapDur);

        noise.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        noise.start(now);
        noise.stop(now + snapDur);
      }
    }

    // "Ching" - 2 resonant bell tones (C6, E6)
    const tones = [
      { f: 1046.5, t: 0.04, dur: 0.4 },
      { f: 1318.51, t: 0.11, dur: 0.55 },
    ];

    tones.forEach((tone) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + tone.t;

      if (synth.registerVoice(osc, tone.t + tone.dur)) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(tone.f, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.003);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + tone.dur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + tone.dur);
      }
    });

    // Subtle coin clink (at +0.22s)
    const coinStart = now + 0.22;
    const coinOsc = ctx.createOscillator();
    const coinGain = ctx.createGain();
    const coinDur = 0.15;

    if (synth.registerVoice(coinOsc, 0.22 + coinDur)) {
      coinOsc.type = 'sine';
      coinOsc.frequency.setValueAtTime(2093, coinStart); // C7

      coinGain.gain.setValueAtTime(0.0001, now);
      coinGain.gain.setValueAtTime(0.0001, coinStart);
      coinGain.gain.linearRampToValueAtTime(0.08, coinStart + 0.002);
      coinGain.gain.exponentialRampToValueAtTime(0.0001, coinStart + coinDur);

      coinOsc.connect(coinGain);
      coinGain.connect(dest);

      coinOsc.start(coinStart);
      coinOsc.stop(coinStart + coinDur);
    }
  }

  /** combo:change at >= 3 - rising pitch pling by combo */
  public playCombo(synth: SynthContext, combo: number): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const dur = 0.28;
    const osc = ctx.createOscillator();
    const harmonic = ctx.createOscillator();
    const gain = ctx.createGain();

    if (!synth.registerVoice(osc, dur)) return;

    // Pitch rises with combo level
    const step = Math.min(16, Math.max(0, combo - 3));
    const baseFreq = 523.25 * Math.pow(2, step / 12); // Semitone steps from C5

    osc.type = 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.linearRampToValueAtTime(baseFreq * 1.05, now + dur);

    harmonic.type = 'triangle';
    harmonic.frequency.setValueAtTime(baseFreq * 2, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.14, now + 0.004);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    harmonic.connect(gain);
    gain.connect(dest);

    osc.start(now);
    harmonic.start(now);
    osc.stop(now + dur);
    harmonic.stop(now + dur);
  }

  /** customer:spawn - door bell */
  public playDoorBell(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const chimes = [
      { f: 659.25, t: 0, dur: 0.45 },   // E5
      { f: 523.25, t: 0.14, dur: 0.65 }, // C5
    ];

    chimes.forEach((chime) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + chime.t;

      if (synth.registerVoice(osc, chime.t + chime.dur)) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(chime.f, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.13, start + 0.005);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + chime.dur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + chime.dur);
      }
    });
  }

  /** customer:leave angry - grumble low saw w/ pitch drop */
  public playAngry(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const dur = 0.45;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (!synth.registerVoice(osc, dur)) return;

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(140, now);
    osc.frequency.exponentialRampToValueAtTime(55, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(380, now);
    filter.Q.setValueAtTime(2.5, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.02);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
  }

  /** order:expired - sad buzzer */
  public playBuzzer(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const dur = 0.42;

    const osc1 = ctx.createOscillator();
    const osc2 = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    if (!synth.registerVoice(osc1, dur)) return;

    // Minor second dissonance with pitch drop
    osc1.type = 'sawtooth';
    osc1.frequency.setValueAtTime(145, now);
    osc1.frequency.exponentialRampToValueAtTime(105, now + dur);

    osc2.type = 'sawtooth';
    osc2.frequency.setValueAtTime(154, now);
    osc2.frequency.exponentialRampToValueAtTime(112, now + dur);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(550, now);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.015);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc1.connect(filter);
    osc2.connect(filter);
    filter.connect(gain);
    gain.connect(dest);

    osc1.start(now);
    osc2.start(now);
    osc1.stop(now + dur);
    osc2.stop(now + dur);
  }

  /** upgrade:bought & drink:unlocked - sparkly arpeggio */
  public playUpgrade(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1318.51]; // C5, E5, G5, B5, E6
    const noteSpacing = 0.055;
    const noteDur = 0.32;

    notes.forEach((freq, idx) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + idx * noteSpacing;

      if (synth.registerVoice(osc, idx * noteSpacing + noteDur)) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(freq, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.13, start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + noteDur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + noteDur);
      }
    });
  }

  /** achievement / goal:complete - fanfare */
  public playFanfare(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 392.0, t: 0, dur: 0.11 },     // G4
      { f: 523.25, t: 0.11, dur: 0.11 }, // C5
      { f: 659.25, t: 0.22, dur: 0.14 }, // E5
      { f: 783.99, t: 0.36, dur: 0.65 }, // G5 (sustained)
      { f: 1046.5, t: 0.36, dur: 0.65 }, // C6 (sustained harmony)
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.t;

      if (synth.registerVoice(osc, note.t + note.dur)) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.15, start + 0.008);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + note.dur);
      }
    });
  }

  /** day:end - gentle chime melody */
  public playDayEnd(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 659.25, t: 0.0, dur: 0.35 },  // E5
      { f: 783.99, t: 0.22, dur: 0.35 }, // G5
      { f: 880.0, t: 0.44, dur: 0.4 },   // A5
      { f: 1046.5, t: 0.7, dur: 0.9 },   // C6
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.t;

      if (synth.registerVoice(osc, note.t + note.dur)) {
        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.f, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.13, start + 0.01);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + note.dur);
      }
    });
  }

  /** game:over - descending */
  public playGameOver(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 349.23, t: 0.0, dur: 0.35 }, // F4
      { f: 311.13, t: 0.28, dur: 0.35 }, // Eb4
      { f: 277.18, t: 0.56, dur: 0.4 },  // Db4
      { f: 246.94, t: 0.88, dur: 0.8 },  // B3
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.t;

      if (synth.registerVoice(osc, note.t + note.dur)) {
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(note.f, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.12, start + 0.015);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

        osc.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + note.dur);
      }
    });
  }

  /** rush:start - quick alert */
  public playAlert(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const notes = [
      { f: 587.33, t: 0.0, dur: 0.09 }, // D5
      { f: 880.0, t: 0.09, dur: 0.16 }, // A5
    ];

    notes.forEach((note) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      const start = now + note.t;

      if (synth.registerVoice(osc, note.t + note.dur)) {
        osc.type = 'square';
        osc.frequency.setValueAtTime(note.f, start);

        // Lowpass to tame square harshness
        const filter = ctx.createBiquadFilter();
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(1400, start);

        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.setValueAtTime(0.0001, start);
        gain.gain.linearRampToValueAtTime(0.1, start + 0.004);
        gain.gain.exponentialRampToValueAtTime(0.0001, start + note.dur);

        osc.connect(filter);
        filter.connect(gain);
        gain.connect(dest);

        osc.start(start);
        osc.stop(start + note.dur);
      }
    });
  }

  /** action:fail - soft thud */
  public playFail(synth: SynthContext): void {
    const ctx = synth.getContext();
    const dest = synth.sfxGain;
    if (!ctx || !dest) return;

    const now = ctx.currentTime;
    const dur = 0.12;

    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    if (!synth.registerVoice(osc, dur)) return;

    osc.type = 'sine';
    osc.frequency.setValueAtTime(110, now);
    osc.frequency.exponentialRampToValueAtTime(38, now + dur);

    gain.gain.setValueAtTime(0.001, now);
    gain.gain.linearRampToValueAtTime(0.12, now + 0.005);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + dur);

    osc.connect(gain);
    gain.connect(dest);

    osc.start(now);
    osc.stop(now + dur);
  }
}
