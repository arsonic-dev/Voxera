// web/src/audio/bargeIn.ts
import { SegmentPlayer, CutResult } from './player.ts';

export const DEFAULT_ENERGY_THRESHOLD = 0.04; // Tune on real hardware
export const DEFAULT_HOLD_MS = 150;           // Sustained voice, not a cough
export const FRAME_MS = 100;

export class BargeInDetector {
  private energyThreshold: number;
  private holdMs: number;
  private voicedMs = 0;
  private onBargeIn: (cut: CutResult) => void;
  private getPlayer: () => SegmentPlayer | null;

  constructor(
    getPlayer: () => SegmentPlayer | null,
    onBargeIn: (cut: CutResult) => void,
    energyThreshold = DEFAULT_ENERGY_THRESHOLD,
    holdMs = DEFAULT_HOLD_MS
  ) {
    this.getPlayer = getPlayer;
    this.onBargeIn = onBargeIn;
    this.energyThreshold = energyThreshold;
    this.holdMs = holdMs;
  }

  public onMicFrame(rms: number, frameDurationMs = FRAME_MS) {
    const player = this.getPlayer();
    if (!player || !player.isPlaying()) {
      this.voicedMs = 0;
      return;
    }

    // Raise threshold by 50% while player is running to cut false triggers from speaker bleed
    const effectiveThreshold = this.energyThreshold * 1.5;

    if (rms > effectiveThreshold) {
      this.voicedMs += frameDurationMs;
      if (this.voicedMs >= this.holdMs) {
        const cut = player.stopAll();
        if (cut) {
          this.onBargeIn(cut);
        }
        this.voicedMs = 0;
      }
    } else {
      this.voicedMs = 0;
    }
  }

  public setThreshold(val: number) {
    this.energyThreshold = val;
  }

  public getThreshold(): number {
    return this.energyThreshold;
  }
}
