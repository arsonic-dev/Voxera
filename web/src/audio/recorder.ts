// web/src/audio/recorder.ts

const WORKLET_CODE = `
class Pcm16DownsamplerProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.targetRate = 16000;
    this.buffer = new Int16Array(1600); // 100 ms at 16 kHz
    this.bufferIndex = 0;
    this.resampleRatio = sampleRate / this.targetRate;
    this.phase = 0;
  }

  process(inputs) {
    const input = inputs[0];
    if (!input || input.length === 0) return true;
    const channelData = input[0];
    if (!channelData || channelData.length === 0) return true;

    // Resample to 16 kHz and convert Float32 to Int16
    let sumSq = 0;
    for (let i = 0; i < channelData.length; i++) {
      const sample = channelData[i];
      sumSq += sample * sample;
    }
    const rms = Math.sqrt(sumSq / channelData.length);

    while (this.phase < channelData.length) {
      const idx = Math.floor(this.phase);
      const frac = this.phase - idx;
      const s0 = channelData[idx];
      const s1 = idx + 1 < channelData.length ? channelData[idx + 1] : s0;
      const interpolated = s0 + frac * (s1 - s0);

      // Clamp and scale to Int16
      const clamped = Math.max(-1, Math.min(1, interpolated));
      const int16 = clamped < 0 ? Math.round(clamped * 32768) : Math.round(clamped * 32767);

      this.buffer[this.bufferIndex++] = int16;

      if (this.bufferIndex >= this.buffer.length) {
        // Send 100ms PCM16 buffer
        const copy = new Int16Array(this.buffer);
        this.port.postMessage({ pcm: copy.buffer, rms }, [copy.buffer]);
        this.bufferIndex = 0;
      }

      this.phase += this.resampleRatio;
    }

    this.phase -= channelData.length;
    return true;
  }
}

registerProcessor('pcm16-downsampler', Pcm16DownsamplerProcessor);
`;

export interface MicController {
  setMuted: (muted: boolean) => void;
  stop: () => void;
}

export async function startMicCapture(
  audioCtx: AudioContext,
  onAudioFrame: (buffer: ArrayBuffer, rms: number) => void
): Promise<MicController> {
  const stream = await navigator.mediaDevices.getUserMedia({
    audio: {
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
      channelCount: 1,
    },
  });

  const blob = new Blob([WORKLET_CODE], { type: 'application/javascript' });
  const workletUrl = URL.createObjectURL(blob);
  await audioCtx.audioWorklet.addModule(workletUrl);
  URL.revokeObjectURL(workletUrl);

  const sourceNode = audioCtx.createMediaStreamSource(stream);
  const workletNode = new AudioWorkletNode(audioCtx, 'pcm16-downsampler');

  let isMuted = false;

  workletNode.port.onmessage = (event) => {
    const { pcm, rms } = event.data;
    if (!isMuted) {
      onAudioFrame(pcm, rms);
    } else {
      onAudioFrame(new ArrayBuffer(0), 0);
    }
  };

  sourceNode.connect(workletNode);
  // Do not connect to audioCtx.destination to avoid hearing own voice locally!

  return {
    setMuted: (muted: boolean) => {
      isMuted = muted;
      stream.getAudioTracks().forEach((t) => (t.enabled = !muted));
    },
    stop: () => {
      stream.getTracks().forEach((t) => t.stop());
      sourceNode.disconnect();
      workletNode.disconnect();
    },
  };
}
