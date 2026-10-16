import { Lang } from '@crossfire/shared';

export interface TtsRequest {
  segmentId: string;
  text: string;
  lang: Lang;
  intensity: number;
  emotion: string;
  signal?: AbortSignal;
}

export interface TtsChunk {
  segmentId: string;
  seq: number;
  pcm: Buffer;
  rate: number;
  last: boolean;
  totalDurationMs?: number;
}

export interface TtsCallbacks {
  onChunk: (chunk: TtsChunk) => void;
  onError: (err: Error) => void;
}

export interface Tts {
  streamTts: (req: TtsRequest, callbacks: TtsCallbacks) => Promise<number>;
}

// Default ElevenLabs voice IDs per language (multilingual high-quality expressive voices)
export const ELEVENLABS_VOICES: Record<Lang, string> = {
  en: 'EXAVITQu4vr4xnSDxMaL', // Sarah (premade)
  es: 'EXAVITQu4vr4xnSDxMaL', // Sarah (premade, multilingual)
  hi: 'IKne3meq5aSn9XLyUdCD', // Charlie (premade, multilingual)
  fr: 'EXAVITQu4vr4xnSDxMaL', // Sarah
  de: 'pNInz6obpgDQGcFmaJgB', // Adam (premade)
  pt: 'nPczCjzI2devNBz1zQrb', // Brian (premade)
  it: 'FGY2WhTYpPnrIDTdsKH5', // Laura (premade)
  ru: 'nPczCjzI2devNBz1zQrb', // Brian (premade)
};

/**
 * Maps intensity and emotion to ElevenLabs voice settings per TechSpec.
 * Higher intensity lowers stability, raises style, and raises speed slightly.
 */
export function mapVoiceSettings(intensity: number, _emotion: string = 'neutral') {
  const stability = Math.max(0.1, 0.5 - 0.3 * intensity);
  const style = Math.min(1.0, 0.2 + 0.6 * intensity);
  const speed = Math.min(1.5, 1.0 + 0.25 * intensity);

  return {
    stability,
    similarity_boost: 0.75,
    style,
    use_speaker_boost: true,
    speed,
  };
}

export class FakeTts implements Tts {
  public async streamTts(req: TtsRequest, callbacks: TtsCallbacks): Promise<number> {
    const { segmentId, text, signal } = req;
    if (signal?.aborted) return 0;

    const words = text.trim().split(/\s+/).filter(Boolean);
    // Realistic duration: ~300ms per word, minimum 600ms
    const totalDurationMs = Math.max(600, words.length * 300);
    const rate = 16000;
    const frameMs = 100;
    const samplesPerFrame = (rate * frameMs) / 1000; // 1600 samples
    const totalFrames = Math.ceil(totalDurationMs / frameMs);

    let seq = 0;

    for (let f = 0; f < totalFrames; f++) {
      if (signal?.aborted) return seq * frameMs;

      const isLast = f === totalFrames - 1;
      const buf = Buffer.alloc(samplesPerFrame * 2);

      // Generate a pleasant test tone (harmonic speech-like envelope)
      const baseFreq = req.lang === 'hi' ? 220 : 260;
      for (let i = 0; i < samplesPerFrame; i++) {
        const t = (f * samplesPerFrame + i) / rate;
        // Soft window to eliminate clicks
        const env = Math.sin((Math.PI * (f * samplesPerFrame + i)) / (totalFrames * samplesPerFrame));
        const sample = Math.round(12000 * env * Math.sin(2 * Math.PI * baseFreq * t));
        buf.writeInt16LE(sample, i * 2);
      }

      callbacks.onChunk({
        segmentId,
        seq: seq++,
        pcm: buf,
        rate,
        last: isLast,
        totalDurationMs,
      });

      // Stream pacing: ~30ms wait per 100ms audio chunk so streaming is responsive but timed
      await new Promise((r) => setTimeout(r, 30));
    }

    return totalDurationMs;
  }
}

export class ElevenLabsTts implements Tts {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async streamTts(req: TtsRequest, callbacks: TtsCallbacks): Promise<number> {
    const { segmentId, text, lang, intensity, emotion, signal } = req;
    if (signal?.aborted) return 0;

    const voiceId = ELEVENLABS_VOICES[lang] || ELEVENLABS_VOICES.en;
    const voiceSettings = mapVoiceSettings(intensity, emotion);

    const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}/stream?output_format=pcm_16000`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_flash_v2_5',
          voice_settings: voiceSettings,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`ElevenLabs API error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error('ElevenLabs response body is null');
      }

      const reader = response.body.getReader();
      let seq = 0;
      let totalBytes = 0;
      const rate = 16000;

      while (true) {
        if (signal?.aborted) break;
        const { done, value } = await reader.read();
        if (done) break;

        const pcmBuf = Buffer.from(value);
        totalBytes += pcmBuf.length;

        callbacks.onChunk({
          segmentId,
          seq: seq++,
          pcm: pcmBuf,
          rate,
          last: false,
        });
      }

      // Send final empty or marked chunk
      const totalDurationMs = Math.round((totalBytes / (rate * 2)) * 1000);
      callbacks.onChunk({
        segmentId,
        seq: seq++,
        pcm: Buffer.alloc(0),
        rate,
        last: true,
        totalDurationMs,
      });

      return totalDurationMs;
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return 0;
      }
      callbacks.onError(err as Error);
      return 0;
    }
  }
}

let activeTts: Tts | null = null;

export function getTts(): Tts {
  if (activeTts) return activeTts;

  const useFakes = process.env.USE_FAKES === 'true' || !process.env.ELEVENLABS_API_KEY;
  if (useFakes) {
    activeTts = new FakeTts();
  } else {
    activeTts = new ElevenLabsTts(process.env.ELEVENLABS_API_KEY!);
  }
  return activeTts;
}

export function setTtsForTesting(tts: Tts) {
  activeTts = tts;
}
