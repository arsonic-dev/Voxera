# ⚙️ TechSpec.md

**Status:** In Progress

## Architecture

```
Browser A  <--WebSocket-->  Node server (rooms + pipeline)  <--WebSocket-->  Browser B
 mic, VAD,                        |
 audio player                     |-- Deepgram streaming STT (one stream per speaker)
                                  |-- LLM translation (streamed, with room context)
                                  |-- TTS (one streamed request per segment)
```

Cascaded pipeline on purpose. A speech-to-speech model hides the text, which makes cancellation, retraction and "heard up to here" much harder to build.

## Stack
| Layer      | Choice                              | Reason                                                            |
|------------|-------------------------------------|-------------------------------------------------------------------|
| Frontend   | Vite + React + TypeScript           | Fast to build, no SSR needed                                      |
| Audio      | Web Audio API + AudioWorklet        | Raw PCM capture, sample-accurate playback and instant stop        |
| Backend    | Node 20 + `ws` + TypeScript         | Persistent sockets, one process per room set                      |
| STT        | Deepgram Nova-3, streaming          | Interim results, endpointing, word timings, Hindi and Spanish     |
| Translate  | Claude Haiku 5.5 (`claude-haiku-5-5`) behind a `Translator` interface | Low latency, follows the no-softening rule, easy to swap |
| TTS        | ElevenLabs Flash v2.5, streamed PCM | Low latency, multilingual, voice settings for intensity           |
| State      | In-memory Map                       | Nothing to persist in v1                                          |
| Hosting    | Fly.io or Railway, one service      | Needs long-lived WebSockets and HTTPS for the mic. No serverless. |

Check vendor docs on Day 1 that all eight languages are supported by STT and TTS. Drop any that are not.

## Repo layout
```
voxera/
  shared/protocol.ts     message types used by both sides
  server/                ws server, room manager, stt.ts, translate.ts, tts.ts
  web/                   Vite app, audio worklets, UI
  scripts/sim.ts         replays two audio files as two speakers, for tests
  docs/                  these planning files
```
The server serves `web/dist`, so one deploy covers everything.

## Environment variables
`DEEPGRAM_API_KEY`, `ANTHROPIC_API_KEY`, `ELEVENLABS_API_KEY`, `PORT`

## Wire protocol
Mic audio goes client to server as binary frames: PCM16, 16 kHz, mono, about 100 ms per frame. Everything else is JSON text.

```typescript
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
      intensity: number; emotion: string; retracts: string | null }
  | { t: "audio"; segmentId: string; seq: number; pcm: string; rate: number; last: boolean }
  | { t: "cancel"; segmentId: string; reason: "barge_in" | "retracted" }
  | { t: "heard"; segmentId: string; heardText: string; pct: number; interrupted: boolean };

export interface PeerInfo { id: string; name: string; lang: Lang; online: boolean }
```

`src` goes to the speaker only (their own live transcript). `tr` goes to both, so the speaker sees what the listener is getting. `audio` goes to the listener only. `heard` goes to both.

## Pipeline per speaker
1. Mic frames arrive. The server computes RMS per frame for `loudness` and forwards the audio to that speaker's Deepgram stream (`interim_results=true`, `endpointing` around 300 ms, `utterance_end_ms` as backup).
2. Interim text is sent as `src` with `final: false` so the speaker's own caption updates live.
3. A **segment commits** when Deepgram marks a chunk final and it has at least 3 words or ends with punctuation, or when `speech_final` fires. Short fragments wait for the next chunk.
4. On commit, the server calls the translator with the new segment plus the last 12 lines of the room (source, translation, and what the listener actually heard). The translation streams out as `tr` with `final: false`.
5. When the header is parsed, the translation text goes to TTS. Audio streams to the listener as `audio` chunks.
6. Audio only ever comes from committed segments. Live text can change, audio cannot be un-said, so we do not speak interim guesses.

## Translator contract
The model first writes one JSON header line, then `---`, then the translation text. This lets us read intensity and retraction before the text streams.

```
{"intensity": 0.8, "emotion": "angry", "retracts": null}
---
You never listen to me!
```

System prompt (stored in `server/prompts/translate.md`):

```
You are the live interpreter in a heated argument between two people.
Translate from {src} to {dst}.

1. Translate everything. Keep insults, profanity, threats, sarcasm and slang
   at the same strength. Never soften, never warn, never comment.
2. Match register and length. Fragments stay fragments. Repetition and
   trailing off stay.
3. Keep pronouns and references consistent with the conversation so far.
4. If the speaker takes back or fixes something they just said ("no wait",
   "I mean", "forget that"), set "retracts" to the id of the segment being
   corrected, and translate the correction naturally.
5. Each earlier line lists what the listener actually heard. Do not repeat
   parts they never heard unless the speaker repeats them.
6. Output one JSON header line with intensity (0 to 1), emotion
   (angry, sarcastic, pleading, calm, hurt, contempt, other) and retracts,
   then a line containing only ---, then the translation. Nothing else.
```

Per-call user content lists the context lines as `[id] speaker (lang): text | heard: "..."` followed by the new segment with its `loudness` and `wpm` as hints ("speaker is shouting" when loudness is high).

## Barge-in
Runs on the **listener's** client, so cancel latency does not depend on the network.

```typescript
// web/src/audio/bargeIn.ts (logic sketch)
const ENERGY_THRESHOLD = 0.04;   // tune on real hardware
const HOLD_MS = 150;             // sustained voice, not a cough

onMicFrame(rms) {
  if (player.isPlaying() && rms > ENERGY_THRESHOLD) {
    voicedMs += FRAME_MS;
    if (voicedMs >= HOLD_MS) {
      const cut = player.stopAll();            // returns { segmentId, playedMs, totalMs }
      if (cut) ws.send({ t: "barge_in", ...cut });
      voicedMs = 0;
    }
  } else voicedMs = 0;
}
```

The player schedules each segment as a chain of `AudioBufferSourceNode`s and records `startTime`, so `playedMs = (ctx.currentTime - startTime) * 1000`. `stopAll()` stops every node and drops the queue.

On `barge_in` the server:
1. Aborts any TTS request and LLM stream still running for that segment.
2. Computes `pct = playedMs / totalMs` and `heardText` as the first `round(words * pct)` words of the translation.
3. Marks the segment `interrupted`, logs it in room context, and broadcasts `heard` to both sides.

```typescript
function heardText(text: string, pct: number): string {
  const words = text.trim().split(/\s+/);
  return words.slice(0, Math.round(words.length * pct)).join(" ");
}
```

If TTS provides character timings, use them instead of the proportional estimate.

## Retraction
When a segment arrives with `retracts` set:
- Not yet played: server sends `cancel` with reason `retracted`, listener drops it from the queue.
- Already played: no cancel. The caption gets the strike-through and the correction plays as normal speech.

## Heat
- `loudness` (server RMS) and `wpm` go into the LLM call as hints.
- `intensity` and `emotion` from the header map to TTS voice settings: higher intensity lowers `stability`, raises `style`, and raises `speed` slightly.
- The client sets CSS variable `--heat` from `intensity` and scales caption weight and size.

## Echo and loops
- `getUserMedia` with `echoCancellation`, `noiseSuppression` and `autoGainControl` on.
- Join screen requires a "I'm wearing headphones" tick before the mic opens.
- While the player is running, the barge-in threshold is raised by 50% to cut false triggers from speaker bleed.

## Latency budget (end of speech to first audio)
| Stage                     | Target   |
|---------------------------|----------|
| Endpointing wait          | 300 ms   |
| STT final                 | 150 ms   |
| LLM first token and header | 400 ms  |
| TTS first audio byte      | 300 ms   |
| Network and buffer        | 150 ms   |
| **Total**                 | **~1.3 s** |

Log each stage per segment. Show it with `?hud=1`.

## Known risks
- Hindi STT accuracy and Hindi-English mixing. Test on Day 1 with real speech, before building on top.
- Browser autoplay rules. Resume the `AudioContext` on the Join click.
- Two tabs on one machine share a mic permission and can loop. Headphones tick plus a "second tab detected" warning.
- Free-tier hosting that sleeps. Use an always-on instance for the demo window.

## Key Patterns
- One WebSocket per participant, one Deepgram stream per participant.
- Every segment has an id from commit time, and every message that touches it carries that id.
- Server owns the truth about segment status. Clients render from messages.
- `Translator`, `Stt` and `Tts` are interfaces, so any vendor can be swapped without touching the room logic.
