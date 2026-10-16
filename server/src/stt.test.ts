import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';
import { calculateRms } from './stt.js';

describe('Step 2: Mic to Live Transcript (STT)', () => {
  const TEST_PORT = 3102;
  let httpServer: http.Server;

  before(async () => {
    httpServer = await startServer(TEST_PORT);
  });

  after(async () => {
    const { wss } = await import('./index.js');
    return new Promise<void>((resolve) => {
      wss.close(() => {
        httpServer.close(() => resolve());
      });
    });
  });

  test('calculateRms computes proper energy from PCM16', () => {
    // Silence
    const silence = Buffer.alloc(3200);
    assert.strictEqual(calculateRms(silence), 0);

    // Sine wave
    const sine = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) {
      const sample = Math.round(16000 * Math.sin((2 * Math.PI * 440 * i) / 16000));
      sine.writeInt16LE(sample, i * 2);
    }
    const rms = calculateRms(sine);
    assert.ok(rms > 0.1 && rms <= 1.0, `RMS should be between 0.1 and 1.0, got ${rms}`);
  });

  test('Speech frames produce live src transcript for Hindi and Spanish', async () => {
    const roomId = 'STT_TEST';
    const wsHindi = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const wsSpanish = new WebSocket(`ws://localhost:${TEST_PORT}`);

    const hindiMsgs: ServerMsg[] = [];
    const spanishMsgs: ServerMsg[] = [];

    await Promise.all([
      new Promise<void>((res) => wsHindi.on('open', res)),
      new Promise<void>((res) => wsSpanish.on('open', res)),
    ]);

    wsHindi.on('message', (d) => hindiMsgs.push(JSON.parse(d.toString())));
    wsSpanish.on('message', (d) => spanishMsgs.push(JSON.parse(d.toString())));

    // Join room
    wsHindi.send(JSON.stringify({ t: 'join', room: roomId, name: 'Aarav', lang: 'hi' } as ClientMsg));
    wsSpanish.send(JSON.stringify({ t: 'join', room: roomId, name: 'Sofia', lang: 'es' } as ClientMsg));

    await new Promise((r) => setTimeout(r, 100));

    // Generate voice-like PCM16 frames (1600 samples = 100ms at 16kHz)
    const makeVoiceFrame = () => {
      const buf = Buffer.alloc(3200);
      for (let i = 0; i < 1600; i++) {
        const sample = Math.round(18000 * Math.sin((2 * Math.PI * 250 * i) / 16000));
        buf.writeInt16LE(sample, i * 2);
      }
      return buf;
    };
    const silenceFrame = Buffer.alloc(3200);

    // 1. Send speech frames from Hindi speaker
    for (let i = 0; i < 4; i++) {
      wsHindi.send(makeVoiceFrame());
      await new Promise((r) => setTimeout(r, 50));
    }

    // Send silence to trigger endpointing
    for (let i = 0; i < 4; i++) {
      wsHindi.send(silenceFrame);
      await new Promise((r) => setTimeout(r, 50));
    }

    await new Promise((r) => setTimeout(r, 150));

    // Verify Hindi speaker received `src` messages
    const hindiSrc = hindiMsgs.filter((m) => m.t === 'src');
    assert.ok(hindiSrc.length >= 1, `Hindi speaker should receive src messages, got ${hindiSrc.length}`);

    // Verify peer (Spanish speaker) did NOT receive Hindi `src` messages (only speaker gets src)
    const spanishSrcFromHindi = spanishMsgs.filter((m) => m.t === 'src');
    assert.strictEqual(spanishSrcFromHindi.length, 0, 'Peer must not receive speaker own src transcript');

    // 2. Send speech frames from Spanish speaker
    for (let i = 0; i < 4; i++) {
      wsSpanish.send(makeVoiceFrame());
      await new Promise((r) => setTimeout(r, 50));
    }
    for (let i = 0; i < 4; i++) {
      wsSpanish.send(silenceFrame);
      await new Promise((r) => setTimeout(r, 50));
    }

    await new Promise((r) => setTimeout(r, 150));

    const spanishSrc = spanishMsgs.filter((m) => m.t === 'src');
    assert.ok(spanishSrc.length >= 1, `Spanish speaker should receive src messages, got ${spanishSrc.length}`);

    wsHindi.close();
    wsSpanish.close();
  });
});
