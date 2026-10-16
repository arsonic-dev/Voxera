import { WebSocket } from 'ws';
import crypto from 'crypto';
import { Lang } from '@crossfire/shared';

export interface TranscriptEvent {
  utteranceId: string;
  text: string;
  final: boolean;
  isSpeechFinal?: boolean;
  words?: { word: string; start: number; end: number }[];
  loudness: number;
  wpm?: number;
}

export interface SttCallbacks {
  onTranscript: (event: TranscriptEvent) => void;
  onError?: (err: Error) => void;
}

export interface SttSession {
  sendAudio: (pcm16: Buffer) => void;
  close: () => void;
}

export interface Stt {
  createSession: (
    participantId: string,
    lang: Lang,
    callbacks: SttCallbacks,
    signal?: AbortSignal
  ) => SttSession;
}

/**
 * Computes RMS loudness from 16-bit PCM buffer, normalized roughly to [0, 1].
 */
export function calculateRms(pcm16: Buffer): number {
  const sampleCount = Math.floor(pcm16.length / 2);
  if (sampleCount === 0) return 0;
  let sum = 0;
  for (let i = 0; i < sampleCount * 2; i += 2) {
    const sample = pcm16.readInt16LE(i) / 32768.0;
    sum += sample * sample;
  }
  const rms = Math.sqrt(sum / sampleCount);
  return Math.min(1, rms * 3.5);
}

// Sample phrases for deterministic Fake STT per language
const FAKE_PHRASES: Record<Lang, string[]> = {
  hi: [
    'आप कभी मेरी बात नहीं सुनते!',
    'यह पूरी तरह से गलत है और आप जानते हैं।',
    'नहीं रुको, मेरा मतलब यह नहीं था।',
    'बकवास बंद करो और मेरी बात सुनो!',
  ],
  es: [
    '¡Nunca me escuchas cuando te hablo!',
    'Esto es completamente injusto y lo sabes.',
    'No espera, quise decir otra cosa.',
    '¡Deja de decir tonterías y escúchame!',
  ],
  en: [
    'You never listen to what I have to say!',
    'That is completely ridiculous and you know it.',
    'No wait, I meant something else.',
    'Stop interrupting me right now!',
  ],
  fr: [
    'Tu ne m\'écoutes jamais quand je parle!',
    'C\'est complètement faux et tu le sais bien.',
    'Non attends, je voulais dire autre chose.',
    'Arrête de me couper la parole!',
  ],
  de: [
    'Du hörst mir einfach nie zu!',
    'Das ist absolut lächerlich und das weißt du.',
    'Nein warte, das meinte ich gar nicht so.',
    'Hör auf mich ständig zu unterbrechen!',
  ],
  pt: [
    'Você nunca me escuta quando eu falo!',
    'Isso é um absurdo completo e você sabe.',
    'Não espera, eu quis dizer outra coisa.',
    'Pare de me interromper agora mesmo!',
  ],
  it: [
    'Non mi ascolti mai quando parlo!',
    'Questo è completamente ridicolo e lo sai.',
    'No aspetta, intendevo un\'altra cosa.',
    'Smettila di interrompermi subito!',
  ],
  ru: [
    'Ты никогда меня не слушаешь!',
    'Это совершенно смешно и ты это знаешь.',
    'Нет подожди, я имел в виду другое.',
    'Перестань перебивать меня прямо сейчас!',
  ],
};

export class FakeStt implements Stt {
  private scriptedTestMap = new Map<string, string[]>();

  public setScriptForParticipant(participantId: string, lines: string[]) {
    this.scriptedTestMap.set(participantId, [...lines]);
  }

  public createSession(
    participantId: string,
    lang: Lang,
    callbacks: SttCallbacks,
    signal?: AbortSignal
  ): SttSession {
    let utteranceId = crypto.randomUUID();
    let phraseIndex = 0;
    let voicedFrames = 0;
    let silentFrames = 0;
    let isSpeaking = false;
    let currentLoudness = 0;
    let closed = false;

    const scripted = this.scriptedTestMap.get(participantId);

    const onAbort = () => {
      closed = true;
    };
    if (signal) {
      if (signal.aborted) onAbort();
      else signal.addEventListener('abort', onAbort, { once: true });
    }

    return {
      sendAudio: (pcm16: Buffer) => {
        if (closed) return;
        const rms = calculateRms(pcm16);
        currentLoudness = Math.max(currentLoudness * 0.8, rms);

        // Voice threshold
        if (rms > 0.03) {
          voicedFrames++;
          silentFrames = 0;

          if (!isSpeaking && voicedFrames >= 2) {
            isSpeaking = true;
            utteranceId = crypto.randomUUID();

            const pool = scripted && scripted.length > 0 ? scripted : FAKE_PHRASES[lang] || FAKE_PHRASES.en;
            const fullText = pool[phraseIndex % pool.length];
            phraseIndex++;

            // Split into words for progressive interim updates
            const words = fullText.split(' ');
            const partial = words.slice(0, Math.max(1, Math.floor(words.length / 2))).join(' ');

            callbacks.onTranscript({
              utteranceId,
              text: partial,
              final: false,
              loudness: currentLoudness,
            });
          }
        } else {
          if (isSpeaking) {
            silentFrames++;
            // After ~300ms silence (3 frames of 100ms), endpoint and commit
            if (silentFrames >= 3) {
              isSpeaking = false;
              voicedFrames = 0;
              const pool = scripted && scripted.length > 0 ? scripted : FAKE_PHRASES[lang] || FAKE_PHRASES.en;
              const chosen = pool[(phraseIndex - 1 + pool.length) % pool.length];

              const wordsList = chosen.split(' ').map((w, idx) => ({
                word: w,
                start: idx * 0.3,
                end: (idx + 1) * 0.3,
              }));

              callbacks.onTranscript({
                utteranceId,
                text: chosen,
                final: true,
                isSpeechFinal: true,
                words: wordsList,
                loudness: currentLoudness,
                wpm: 140,
              });
            }
          }
        }
      },
      close: () => {
        closed = true;
      },
    };
  }
}

export class DeepgramStt implements Stt {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public createSession(
    _participantId: string,
    lang: Lang,
    callbacks: SttCallbacks,
    signal?: AbortSignal
  ): SttSession {
    let utteranceId = crypto.randomUUID();
    let closed = false;
    let ws: WebSocket | null = null;
    const audioQueue: Buffer[] = [];
    let currentLoudness = 0;

    // Deepgram language mapping
    // Nova-3 supports en; Nova-2 supports hi, es, fr, de, pt, it, ru
    const model = lang === 'en' ? 'nova-3' : 'nova-2';
    const deepgramUrl = `wss://api.deepgram.com/v1/listen?model=${model}&language=${lang}&encoding=linear16&sample_rate=16000&channels=1&interim_results=true&endpointing=300&utterance_end_ms=1000&smart_format=true`;

    try {
      ws = new WebSocket(deepgramUrl, {
        headers: {
          Authorization: `Token ${this.apiKey}`,
        },
      });

      ws.on('open', () => {
        while (audioQueue.length > 0 && ws && ws.readyState === WebSocket.OPEN) {
          const chunk = audioQueue.shift();
          if (chunk) ws.send(chunk);
        }
      });

      ws.on('message', (data) => {
        if (closed) return;
        try {
          const res = JSON.parse(data.toString());
          if (res.type === 'Results' && res.channel?.alternatives?.[0]) {
            const alt = res.channel.alternatives[0];
            const transcript = alt.transcript || '';
            const isFinal = Boolean(res.is_final);
            const isSpeechFinal = Boolean(res.speech_final);

            if (transcript.trim().length > 0) {
              const words = alt.words?.map((w: any) => ({
                word: w.word || '',
                start: w.start || 0,
                end: w.end || 0,
              }));

              // Calculate wpm if timings exist
              let wpm: number | undefined;
              if (words && words.length > 1) {
                const durSec = words[words.length - 1].end - words[0].start;
                if (durSec > 0.2) {
                  wpm = (words.length / durSec) * 60;
                }
              }

              callbacks.onTranscript({
                utteranceId,
                text: transcript,
                final: isFinal,
                isSpeechFinal,
                words,
                loudness: currentLoudness,
                wpm,
              });

              if (isSpeechFinal) {
                // New utterance begins after speech_final
                utteranceId = crypto.randomUUID();
              }
            }
          }
        } catch (err) {
          callbacks.onError?.(err as Error);
        }
      });

      ws.on('error', (err) => {
        if (!closed) callbacks.onError?.(err);
      });

      ws.on('close', () => {
        // Closed
      });
    } catch (err) {
      callbacks.onError?.(err as Error);
    }

    const close = () => {
      closed = true;
      if (ws) {
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'CloseStream' }));
          ws.close();
        }
        ws = null;
      }
    };

    if (signal) {
      if (signal.aborted) close();
      else signal.addEventListener('abort', close, { once: true });
    }

    return {
      sendAudio: (pcm16: Buffer) => {
        if (closed) return;
        currentLoudness = calculateRms(pcm16);
        if (ws && ws.readyState === WebSocket.OPEN) {
          ws.send(pcm16);
        } else {
          // Keep up to 20 frames buffer before connection opens
          if (audioQueue.length < 20) {
            audioQueue.push(pcm16);
          }
        }
      },
      close,
    };
  }
}

let activeStt: Stt | null = null;

export function getStt(): Stt {
  if (activeStt) return activeStt;

  const useFakes = process.env.USE_FAKES === 'true' || !process.env.DEEPGRAM_API_KEY;
  if (useFakes) {
    activeStt = new FakeStt();
  } else {
    activeStt = new DeepgramStt(process.env.DEEPGRAM_API_KEY!);
  }
  return activeStt;
}

export function setSttForTesting(stt: Stt) {
  activeStt = stt;
}
