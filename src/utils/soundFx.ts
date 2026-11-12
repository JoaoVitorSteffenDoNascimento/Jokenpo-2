class SoundEngine {
  private ctx: AudioContext | null = null;
  public muted = false;

  private getContext(): AudioContext | null {
    if (this.muted || typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (AudioCtx) {
        this.ctx = new AudioCtx();
      }
    }
    if (this.ctx && this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    return this.ctx;
  }

  private playTone(
    freq: number,
    duration: number,
    type: OscillatorType = 'sine',
    gainLevel = 0.08,
    delay = 0
  ) {
    const ctx = this.getContext();
    if (!ctx) return;
    const now = ctx.currentTime + delay;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = type;
    osc.frequency.setValueAtTime(freq, now);
    gain.gain.setValueAtTime(gainLevel, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + duration);
  }

  playSelect() {
    this.playTone(540, 0.08, 'triangle', 0.07);
  }

  playCardPlace() {
    this.playTone(340, 0.06, 'sine', 0.055, 0);
    this.playTone(460, 0.06, 'triangle', 0.04, 0.03);
  }

  playCardFlip() {
    this.playTone(440, 0.07, 'triangle', 0.06, 0);
    this.playTone(660, 0.09, 'triangle', 0.06, 0.05);
  }

  playRoundWin() {
    this.playTone(523.25, 0.12, 'triangle', 0.08, 0);
    this.playTone(659.25, 0.18, 'triangle', 0.09, 0.08);
  }

  playRoundLoss() {
    this.playTone(220, 0.14, 'sawtooth', 0.05, 0);
    this.playTone(175, 0.2, 'sawtooth', 0.05, 0.1);
  }

  playRoundDraw() {
    this.playTone(392, 0.12, 'sine', 0.06, 0);
    this.playTone(392, 0.12, 'sine', 0.05, 0.11);
  }

  playVictory() {
    this.playTone(523.25, 0.12, 'triangle', 0.09, 0);
    this.playTone(659.25, 0.12, 'triangle', 0.09, 0.09);
    this.playTone(783.99, 0.14, 'triangle', 0.09, 0.18);
    this.playTone(1046.5, 0.35, 'triangle', 0.1, 0.27);
  }

  playCoin() {
    this.playTone(987.77, 0.08, 'sine', 0.07, 0);
    this.playTone(1318.51, 0.18, 'sine', 0.08, 0.07);
  }
}

export const soundFx = new SoundEngine();
