// shared/protocol.ts
export type Lang = "en" | "hi" | "es" | "fr" | "de" | "pt" | "it" | "ru";

export type ClientMsg =
  | { t: "join"; room: string; name: string; lang: Lang }
  | { t: "playback_start"; segmentId: string }
  | { t: "playback_end"; segmentId: string; totalMs: number }
  | { t: "barge_in"; segmentId: string; playedMs: number; totalMs: number };

export type ServerMsg =
  | { t: "joined"; you: string; peer: PeerInfo | null }
  | { t: "peer"; peer: PeerInfo | null }
  | { t: "src"; utteranceId: string; text: string; final: boolean; loudness: number }
  | { t: "tr"; utteranceId: string; segmentId: string; text: string; final: boolean;
      intensity: number; emotion: string; retracts: string | null;
      latency?: { endpointMs?: number; sttMs?: number; llmMs?: number; ttsMs?: number; totalMs?: number } }
  | { t: "audio"; segmentId: string; seq: number; pcm: string; rate: number; last: boolean }
  | { t: "cancel"; segmentId: string; reason: "barge_in" | "retracted" }
  | { t: "heard"; segmentId: string; heardText: string; pct: number; interrupted: boolean };

export interface PeerInfo { id: string; name: string; lang: Lang; online: boolean }
