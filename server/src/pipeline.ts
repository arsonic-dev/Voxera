import { WebSocket } from 'ws';
import crypto from 'crypto';
import { Lang, ServerMsg, ClientMsg } from '@crossfire/shared';
import { Participant, roomManager } from './rooms.js';
import { getStt, SttSession, TranscriptEvent } from './stt.js';
import { getTranslator, Translator, ContextLine } from './translate.js';
import { getTts } from './tts.js';

export interface SegmentRecord {
  id: string;
  utteranceId: string;
  participantId: string;
  speakerName: string;
  srcLang: Lang;
  dstLang: Lang;
  srcText: string;
  trText: string;
  intensity: number;
  emotion: string;
  retracts: string | null;
  status: 'pending' | 'playing' | 'heard' | 'interrupted' | 'cancelled' | 'retracted';
  ttsMs: number;
  heardText?: string;
  pct?: number;
  abortController: AbortController;
  endpointMs?: number;
  sttMs?: number;
  llmMs?: number;
  ttsFirstByteMs?: number;
  totalLatencyMs?: number;
}

export class ParticipantPipeline {
  public participant: Participant;
  private sttSession: SttSession | null = null;
  private pendingUtteranceBuffer = '';
  private currentUtteranceId = '';
  private segments: Map<string, SegmentRecord> = new Map();

  constructor(participant: Participant) {
    this.participant = participant;
    this.initStt();
  }

  private initStt() {
    const stt = getStt();
    this.sttSession = stt.createSession(
      this.participant.id,
      this.participant.lang,
      {
        onTranscript: (event: TranscriptEvent) => {
          this.handleTranscript(event);
        },
        onError: (err: Error) => {
          console.error(`[STT Error] Participant ${this.participant.name} (${this.participant.id}):`, err);
        },
      },
      this.participant.abortController?.signal
    );
  }

  public handleAudio(pcm16: Buffer) {
    if (this.sttSession) {
      this.sttSession.sendAudio(pcm16);
    }
  }

  private handleTranscript(event: TranscriptEvent) {
    // 1. Send live `src` message to the speaker only
    roomManager.send(this.participant, {
      t: 'src',
      utteranceId: event.utteranceId,
      text: event.text,
      final: event.final,
      loudness: event.loudness,
    });

    // 2. Segment commit evaluation
    this.currentUtteranceId = event.utteranceId;
    const textToEvaluate = (this.pendingUtteranceBuffer + ' ' + event.text).trim();

    const isCommit = this.shouldCommit(textToEvaluate, event.final, Boolean(event.isSpeechFinal));

    if (isCommit) {
      const committedText = textToEvaluate;
      this.pendingUtteranceBuffer = '';
      this.commitSegment(event.utteranceId, committedText, event.loudness, event.wpm);
    } else if (event.final) {
      // Buffer small final fragment (< 3 words, no punct) until next chunk
      this.pendingUtteranceBuffer = textToEvaluate;
    }
  }

  private shouldCommit(text: string, isFinal: boolean, isSpeechFinal: boolean): boolean {
    if (!text || text.trim().length === 0) return false;
    if (isSpeechFinal) return true;
    if (!isFinal) return false;

    const trimmed = text.trim();
    const words = trimmed.split(/\s+/).filter(Boolean);
    const endsWithPunct = /[.!?।,;:¿?¡]$/.test(trimmed);
    return words.length >= 3 || endsWithPunct;
  }

  private async commitSegment(
    utteranceId: string,
    srcText: string,
    loudness: number,
    wpm?: number
  ) {
    const now = Date.now();
    const roomRl = pipelineManager.getRoomRateLimit(this.participant.roomId);
    roomRl.segmentTimestamps = roomRl.segmentTimestamps.filter((t) => now - t < 60000);
    if (roomRl.segmentTimestamps.length >= 35) {
      console.warn(`[RateLimit] Room ${this.participant.roomId} exceeded segment rate limit. Dropping segment.`);
      return;
    }
    roomRl.segmentTimestamps.push(now);

    const segmentId = crypto.randomUUID();
    const peer = roomManager.getPeer(this.participant);
    const dstLang: Lang = peer?.lang || (this.participant.lang === 'hi' ? 'es' : 'en');

    const abortController = new AbortController();

    // Link with participant's abort signal
    if (this.participant.abortController?.signal) {
      this.participant.abortController.signal.addEventListener('abort', () => {
        abortController.abort();
      });
    }

    const endpointMs = 300;
    const sttMs = 150;
    const llmStartTime = Date.now();

    const segment: SegmentRecord = {
      id: segmentId,
      utteranceId,
      participantId: this.participant.id,
      speakerName: this.participant.name,
      srcLang: this.participant.lang,
      dstLang,
      srcText,
      trText: '',
      intensity: loudness,
      emotion: 'calm',
      retracts: null,
      status: 'pending',
      ttsMs: 0,
      abortController,
      endpointMs,
      sttMs,
      llmMs: 0,
    };

    this.segments.set(segmentId, segment);
    pipelineManager.recordSegment(this.participant.roomId, segment);

    // Context for translator: last 12 segments of the room
    const contextLines: ContextLine[] = pipelineManager.getRoomContext(this.participant.roomId);

    const translator = getTranslator();
    let accumulatedText = '';

    await translator.translate(
      {
        segmentId,
        srcLang: this.participant.lang,
        dstLang,
        speakerName: this.participant.name,
        text: srcText,
        loudness,
        wpm,
        contextLines,
        signal: abortController.signal,
      },
      {
        onHeader: (header) => {
          segment.intensity = header.intensity;
          segment.emotion = header.emotion;
          segment.retracts = header.retracts;
          segment.llmMs = Date.now() - llmStartTime;

          // If retracts target is specified, handle retraction
          if (header.retracts) {
            pipelineManager.handleRetraction(this.participant.roomId, header.retracts);
          }
        },
        onChunk: (chunk) => {
          accumulatedText += chunk;
          segment.trText = accumulatedText;

          // Send streamed `tr` with final: false to BOTH participants
          const trMsg: ServerMsg = {
            t: 'tr',
            utteranceId,
            segmentId,
            text: accumulatedText,
            final: false,
            intensity: segment.intensity,
            emotion: segment.emotion,
            retracts: segment.retracts,
            latency: {
              endpointMs,
              sttMs,
              llmMs: segment.llmMs || (Date.now() - llmStartTime),
              ttsMs: 0,
              totalMs: endpointMs + sttMs + (segment.llmMs || (Date.now() - llmStartTime)),
            },
          };
          roomManager.broadcast(this.participant.roomId, trMsg);
        },
        onComplete: (fullTranslation, header) => {
          segment.trText = fullTranslation;
          segment.intensity = header.intensity;
          segment.emotion = header.emotion;
          segment.retracts = header.retracts;
          if (!segment.llmMs) segment.llmMs = Date.now() - llmStartTime;

          // Send finalized `tr` message to BOTH participants
          const trMsg: ServerMsg = {
            t: 'tr',
            utteranceId,
            segmentId,
            text: fullTranslation,
            final: true,
            intensity: header.intensity,
            emotion: header.emotion,
            retracts: header.retracts,
            latency: {
              endpointMs,
              sttMs,
              llmMs: segment.llmMs,
              ttsMs: 0,
              totalMs: endpointMs + sttMs + segment.llmMs,
            },
          };
          roomManager.broadcast(this.participant.roomId, trMsg);

          // Hook for TTS (Step 4)
          pipelineManager.onTranslationComplete(this.participant.roomId, segment);
        },
        onError: (err) => {
          console.error(`[Translate Error] segment ${segmentId}:`, err);
        },
      }
    );
  }

  public abortSegment(segmentId: string) {
    const seg = this.segments.get(segmentId);
    if (seg) {
      seg.abortController.abort();
    }
  }

  public close() {
    if (this.sttSession) {
      this.sttSession.close();
      this.sttSession = null;
    }
    for (const seg of this.segments.values()) {
      seg.abortController.abort();
    }
  }
}

export interface RoomRateLimit {
  segmentTimestamps: number[];
}

export class PipelineManager {
  private pipelines: Map<string, ParticipantPipeline> = new Map();
  private roomSegments: Map<string, SegmentRecord[]> = new Map();
  private roomRateLimits: Map<string, RoomRateLimit> = new Map();
  private participantFrameRates: Map<string, number[]> = new Map();

  public getRoomRateLimit(roomId: string): RoomRateLimit {
    let rl = this.roomRateLimits.get(roomId);
    if (!rl) {
      rl = { segmentTimestamps: [] };
      this.roomRateLimits.set(roomId, rl);
    }
    return rl;
  }

  public register(participant: Participant): ParticipantPipeline {
    let pipeline = this.pipelines.get(participant.id);
    if (!pipeline) {
      pipeline = new ParticipantPipeline(participant);
      this.pipelines.set(participant.id, pipeline);
    }
    return pipeline;
  }

  public get(participantId: string): ParticipantPipeline | undefined {
    return this.pipelines.get(participantId);
  }

  public handleAudio(ws: WebSocket, pcm16: Buffer) {
    const participant = roomManager.getParticipantByWs(ws);
    if (!participant) return;

    // Rate limiting: max 35 frames / sec per participant
    const now = Date.now();
    let frames = this.participantFrameRates.get(participant.id);
    if (!frames) {
      frames = [];
      this.participantFrameRates.set(participant.id, frames);
    }
    frames = frames.filter((t) => now - t < 1000);
    this.participantFrameRates.set(participant.id, frames);

    if (frames.length >= 35) {
      // Audio rate limit exceeded, drop frame
      return;
    }
    frames.push(now);

    let pipeline = this.pipelines.get(participant.id);
    if (!pipeline) {
      pipeline = this.register(participant);
    }
    pipeline.handleAudio(pcm16);
  }

  public recordSegment(roomId: string, segment: SegmentRecord) {
    let list = this.roomSegments.get(roomId);
    if (!list) {
      list = [];
      this.roomSegments.set(roomId, list);
    }
    list.push(segment);
    // Keep bounded to last 60 segments to keep memory flat across 10-minute argument
    if (list.length > 60) {
      list.splice(0, list.length - 60);
    }
  }

  public getRoomContext(roomId: string): ContextLine[] {
    const list = this.roomSegments.get(roomId) || [];
    return list.slice(-12).map((s) => ({
      segmentId: s.id,
      speakerName: s.speakerName,
      lang: s.srcLang,
      text: s.srcText,
      heardText: s.heardText || (s.status === 'heard' ? s.trText : undefined),
    }));
  }

  public handleRetraction(roomId: string, targetSegmentId: string) {
    const list = this.roomSegments.get(roomId) || [];
    const target = list.find((s) => s.id === targetSegmentId);
    if (!target) return;

    if (target.status === 'pending') {
      target.status = 'cancelled';
      target.abortController.abort();
      // Send cancel message
      roomManager.broadcast(roomId, {
        t: 'cancel',
        segmentId: targetSegmentId,
        reason: 'retracted',
      });
    } else {
      target.status = 'retracted';
    }
  }

  public async onTranslationComplete(roomId: string, segment: SegmentRecord) {
    const room = roomManager.getRoom(roomId);
    if (!room) return;

    // Find listener (peer in the room)
    let listener: Participant | null = null;
    for (const p of room.participants.values()) {
      if (p.id !== segment.participantId && p.online) {
        listener = p;
        break;
      }
    }

    if (!listener) return;
    if (segment.status === 'cancelled' || segment.status === 'retracted') return;

    try {
      const tts = getTts();
      const ttsStartTime = Date.now();
      let firstByteSent = false;

      const totalMs = await tts.streamTts(
        {
          segmentId: segment.id,
          text: segment.trText,
          lang: segment.dstLang,
          intensity: segment.intensity,
          emotion: segment.emotion,
          signal: segment.abortController.signal,
        },
        {
          onChunk: (chunk) => {
            if (segment.abortController.signal.aborted) return;
            if (!firstByteSent) {
              firstByteSent = true;
              segment.ttsFirstByteMs = Date.now() - ttsStartTime;
              const totalEst = (segment.endpointMs || 300) + (segment.sttMs || 150) + (segment.llmMs || 350) + segment.ttsFirstByteMs;
              console.log(
                `[Latency] Segment ${segment.id} | Endpoint: ${segment.endpointMs || 300}ms | STT: ${segment.sttMs || 150}ms | LLM: ${segment.llmMs || 350}ms | TTS: ${segment.ttsFirstByteMs}ms | Total: ${totalEst}ms`
              );
            }
            if (listener && listener.online) {
              roomManager.send(listener, {
                t: 'audio',
                segmentId: chunk.segmentId,
                seq: chunk.seq,
                pcm: chunk.pcm.toString('base64'),
                rate: chunk.rate,
                last: chunk.last,
              });
            }
          },
          onError: (err) => {
            console.error(`[TTS Error] segment ${segment.id}:`, err);
          },
        }
      );

      segment.ttsMs = totalMs;
    } catch (err) {
      console.warn(`[TTS Warning] segment ${segment.id} voice synthesis failed, falling back to captions only:`, err);
      segment.ttsMs = 0;
    }
  }

  public handleClientMsg(ws: WebSocket, msg: ClientMsg) {
    const participant = roomManager.getParticipantByWs(ws);
    if (!participant) return;

    if (msg.t === 'playback_start') {
      const list = this.roomSegments.get(participant.roomId) || [];
      const seg = list.find((s) => s.id === msg.segmentId);
      if (seg) seg.status = 'playing';
    } else if (msg.t === 'playback_end') {
      const list = this.roomSegments.get(participant.roomId) || [];
      const seg = list.find((s) => s.id === msg.segmentId);
      if (seg) {
        seg.status = 'heard';
        seg.heardText = seg.trText;
        seg.pct = 1.0;
        roomManager.broadcast(participant.roomId, {
          t: 'heard',
          segmentId: seg.id,
          heardText: seg.trText,
          pct: 1.0,
          interrupted: false,
        });
      }
    } else if (msg.t === 'barge_in') {
      this.handleBargeIn(participant.roomId, msg.segmentId, msg.playedMs, msg.totalMs);
    }
  }

  public handleBargeIn(roomId: string, segmentId: string, playedMs: number, totalMs: number) {
    const list = this.roomSegments.get(roomId) || [];
    const seg = list.find((s) => s.id === segmentId);
    if (!seg) return;

    // 1. Abort any ongoing TTS or LLM stream for that segment
    seg.abortController.abort();

    // 2. Compute pct and heardText proportional to words
    const pct = totalMs > 0 ? Math.min(1.0, Math.max(0.0, playedMs / totalMs)) : 0;
    const words = seg.trText.trim().split(/\s+/).filter(Boolean);
    const heardWordCount = Math.round(words.length * pct);
    const heardWords = words.slice(0, heardWordCount).join(' ');

    seg.status = 'interrupted';
    seg.pct = pct;
    seg.heardText = heardWords;

    // 3. Broadcast heard to both sides
    roomManager.broadcast(roomId, {
      t: 'heard',
      segmentId: seg.id,
      heardText: heardWords,
      pct,
      interrupted: true,
    });
  }

  public unregister(participantId: string) {
    const pipeline = this.pipelines.get(participantId);
    if (pipeline) {
      pipeline.close();
      this.pipelines.delete(participantId);
    }
    this.participantFrameRates.delete(participantId);

    // Abort all in-flight work for this participant
    for (const segments of this.roomSegments.values()) {
      for (const seg of segments) {
        if (seg.participantId === participantId && (seg.status === 'pending' || seg.status === 'playing')) {
          seg.status = 'cancelled';
          seg.abortController.abort();
        }
      }
    }
  }
}

export const pipelineManager = new PipelineManager();

