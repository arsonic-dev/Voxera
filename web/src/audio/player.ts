// web/src/audio/player.ts

export interface CutResult {
  segmentId: string;
  playedMs: number;
  totalMs: number;
}

export interface PlayerCallbacks {
  onPlaybackStart?: (segmentId: string) => void;
  onPlaybackEnd?: (segmentId: string, totalMs: number) => void;
}

interface QueuedChunk {
  pcm: ArrayBuffer;
  rate: number;
  last: boolean;
}

interface QueuedSegment {
  segmentId: string;
  chunks: QueuedChunk[];
  totalExpectedDurationSec: number;
}

export class SegmentPlayer {
  private audioCtx: AudioContext;
  private callbacks: PlayerCallbacks;
  private currentSegment: QueuedSegment | null = null;
  private segmentStartTime = 0;
  private nextScheduleTime = 0;
  private activeNodes: AudioBufferSourceNode[] = [];
  private segmentQueue: QueuedSegment[] = [];
  private isCurrentlyPlaying = false;
  private endTimeout: any = null;

  constructor(audioCtx: AudioContext, callbacks: PlayerCallbacks = {}) {
    this.audioCtx = audioCtx;
    this.callbacks = callbacks;
  }

  public handleAudioChunk(segmentId: string, base64Pcm: string, rate: number, last: boolean) {
    // Decode base64 PCM16
    let arrayBuffer: ArrayBuffer;
    if (typeof window !== 'undefined' && window.atob) {
      const binaryString = window.atob(base64Pcm);
      const bytes = new Uint8Array(binaryString.length);
      for (let i = 0; i < binaryString.length; i++) {
        bytes[i] = binaryString.charCodeAt(i);
      }
      arrayBuffer = bytes.buffer;
    } else {
      const buf = Buffer.from(base64Pcm, 'base64');
      arrayBuffer = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
    }

    // Find or create segment in queue or active
    let target = this.segmentQueue.find((s) => s.segmentId === segmentId);
    if (!target && this.currentSegment && this.currentSegment.segmentId === segmentId) {
      target = this.currentSegment;
    }

    if (!target) {
      target = {
        segmentId,
        chunks: [],
        totalExpectedDurationSec: 0,
      };
      this.segmentQueue.push(target);
    }

    target.chunks.push({ pcm: arrayBuffer, rate, last });

    // Schedule playback if currently active or idle
    if (this.currentSegment?.segmentId === segmentId) {
      this.scheduleChunk(target, target.chunks[target.chunks.length - 1]);
    } else if (!this.isCurrentlyPlaying) {
      this.playNextSegment();
    }
  }

  private playNextSegment() {
    if (this.segmentQueue.length === 0) {
      this.isCurrentlyPlaying = false;
      this.currentSegment = null;
      return;
    }

    this.currentSegment = this.segmentQueue.shift()!;
    this.isCurrentlyPlaying = true;
    this.segmentStartTime = Math.max(this.audioCtx.currentTime, this.nextScheduleTime);
    this.nextScheduleTime = this.segmentStartTime;
    this.activeNodes = [];

    // Trigger playback start callback
    this.callbacks.onPlaybackStart?.(this.currentSegment.segmentId);

    // Schedule all accumulated chunks
    for (const chunk of this.currentSegment.chunks) {
      this.scheduleChunk(this.currentSegment, chunk);
    }
  }

  private scheduleChunk(segment: QueuedSegment, chunk: QueuedChunk) {
    const int16Samples = new Int16Array(chunk.pcm);
    if (int16Samples.length === 0) {
      if (chunk.last) {
        this.checkSegmentCompletion(segment);
      }
      return;
    }

    const float32Samples = new Float32Array(int16Samples.length);
    for (let i = 0; i < int16Samples.length; i++) {
      float32Samples[i] = int16Samples[i] / 32768.0;
    }

    const audioBuffer = this.audioCtx.createBuffer(1, float32Samples.length, chunk.rate || 16000);
    audioBuffer.getChannelData(0).set(float32Samples);

    const sourceNode = this.audioCtx.createBufferSource();
    sourceNode.buffer = audioBuffer;
    sourceNode.connect(this.audioCtx.destination);

    const startTime = Math.max(this.audioCtx.currentTime, this.nextScheduleTime);
    sourceNode.start(startTime);
    this.activeNodes.push(sourceNode);

    const duration = audioBuffer.duration;
    this.nextScheduleTime = startTime + duration;
    segment.totalExpectedDurationSec += duration;

    if (chunk.last) {
      this.checkSegmentCompletion(segment);
    }
  }

  private checkSegmentCompletion(segment: QueuedSegment) {
    if (this.endTimeout) clearTimeout(this.endTimeout);

    const remainingSec = Math.max(0, this.nextScheduleTime - this.audioCtx.currentTime);
    this.endTimeout = setTimeout(() => {
      const totalMs = Math.round(segment.totalExpectedDurationSec * 1000);
      this.callbacks.onPlaybackEnd?.(segment.segmentId, totalMs);
      this.playNextSegment();
    }, remainingSec * 1000);
  }

  public isPlaying(): boolean {
    return this.isCurrentlyPlaying && this.audioCtx.currentTime < this.nextScheduleTime;
  }

  public getCurrentSegmentId(): string | null {
    return this.currentSegment?.segmentId || null;
  }

  /**
   * Stops all active audio source nodes immediately and clears queued segments.
   * Returns playedMs and totalMs for barge-in reporting.
   */
  public stopAll(): CutResult | null {
    if (!this.isCurrentlyPlaying || !this.currentSegment) {
      return null;
    }

    if (this.endTimeout) {
      clearTimeout(this.endTimeout);
      this.endTimeout = null;
    }

    const segmentId = this.currentSegment.segmentId;
    const playedSec = Math.max(0, this.audioCtx.currentTime - this.segmentStartTime);
    const playedMs = Math.min(
      Math.round(this.currentSegment.totalExpectedDurationSec * 1000),
      Math.round(playedSec * 1000)
    );
    const totalMs = Math.max(playedMs, Math.round(this.currentSegment.totalExpectedDurationSec * 1000));

    // Stop every active buffer source node immediately
    for (const node of this.activeNodes) {
      try {
        node.stop(0);
        node.disconnect();
      } catch {
        // Node may already have finished
      }
    }

    this.activeNodes = [];
    this.segmentQueue = [];
    this.currentSegment = null;
    this.isCurrentlyPlaying = false;
    this.nextScheduleTime = this.audioCtx.currentTime;

    return {
      segmentId,
      playedMs,
      totalMs,
    };
  }

  public dropSegment(segmentId: string) {
    // If queued, remove it
    this.segmentQueue = this.segmentQueue.filter((s) => s.segmentId !== segmentId);
    // If currently playing, stop it
    if (this.currentSegment?.segmentId === segmentId) {
      this.stopAll();
    }
  }
}
