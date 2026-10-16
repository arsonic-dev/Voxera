import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';
import { getTts, mapVoiceSettings } from './tts.js';

describe('Step 4: Spoken Translation (TTS & Playback)', () => {
  const TEST_PORT = 3104;
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

  test('mapVoiceSettings adjusts stability, style and speed based on intensity', () => {
    const low = mapVoiceSettings(0.2, 'calm');
    const high = mapVoiceSettings(0.9, 'angry');

    assert.ok(high.stability < low.stability, 'Higher intensity must lower stability');
    assert.ok(high.style > low.style, 'Higher intensity must raise style');
    assert.ok(high.speed > low.speed, 'Higher intensity must raise speed');
  });

  test('FakeTts streams ordered PCM chunks with correct sample rate and duration', async () => {
    const tts = getTts();
    const chunks: any[] = [];

    const durationMs = await tts.streamTts(
      {
        segmentId: 'test-seg-tts-1',
        text: 'This is a test of spoken translation playback.',
        lang: 'es',
        intensity: 0.7,
        emotion: 'angry',
      },
      {
        onChunk: (c) => chunks.push(c),
        onError: (err) => assert.fail(err),
      }
    );

    assert.ok(durationMs >= 600, `Duration should be >= 600ms, got ${durationMs}`);
    assert.ok(chunks.length >= 2, 'Should stream multiple chunks');
    assert.strictEqual(chunks[0].seq, 0);
    assert.strictEqual(chunks[chunks.length - 1].last, true);
    assert.strictEqual(chunks[0].rate, 16000);
  });

  test('Audio chunks stream to listener only and playback_end marks segment heard', async () => {
    const roomId = 'TTS_ROOM';
    const wsSpeaker = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const wsListener = new WebSocket(`ws://localhost:${TEST_PORT}`);

    const speakerMsgs: ServerMsg[] = [];
    const listenerMsgs: ServerMsg[] = [];

    await Promise.all([
      new Promise<void>((res) => wsSpeaker.on('open', res)),
      new Promise<void>((res) => wsListener.on('open', res)),
    ]);

    wsSpeaker.on('message', (d) => speakerMsgs.push(JSON.parse(d.toString())));
    wsListener.on('message', (d) => listenerMsgs.push(JSON.parse(d.toString())));

    wsSpeaker.send(JSON.stringify({ t: 'join', room: roomId, name: 'Rahul', lang: 'hi' } as ClientMsg));
    wsListener.send(JSON.stringify({ t: 'join', room: roomId, name: 'Elena', lang: 'es' } as ClientMsg));

    await new Promise((r) => setTimeout(r, 100));

    // Send speech from speaker to trigger commit -> translation -> TTS
    const voiceBuf = Buffer.alloc(3200);
    for (let i = 0; i < 1600; i++) {
      const sample = Math.round(18000 * Math.sin((2 * Math.PI * 300 * i) / 16000));
      voiceBuf.writeInt16LE(sample, i * 2);
    }
    const silenceBuf = Buffer.alloc(3200);

    for (let i = 0; i < 4; i++) {
      wsSpeaker.send(voiceBuf);
      await new Promise((r) => setTimeout(r, 40));
    }
    for (let i = 0; i < 4; i++) {
      wsSpeaker.send(silenceBuf);
      await new Promise((r) => setTimeout(r, 40));
    }

    // Wait for translation and audio chunks to stream to listener
    await new Promise((r) => setTimeout(r, 800));

    // Audio messages must arrive at listener only!
    const listenerAudio = listenerMsgs.filter((m) => m.t === 'audio');
    const speakerAudio = speakerMsgs.filter((m) => m.t === 'audio');

    assert.ok(listenerAudio.length >= 1, `Listener should receive audio chunks, got ${listenerAudio.length}`);
    assert.strictEqual(speakerAudio.length, 0, 'Speaker must not receive audio playback chunks');

    const firstChunk = listenerAudio[0];
    if (firstChunk.t === 'audio') {
      assert.ok(firstChunk.segmentId, 'Audio chunk must have segmentId');
      assert.strictEqual(firstChunk.rate, 16000);
      assert.ok(firstChunk.pcm.length > 0, 'Audio chunk must contain base64 PCM data');

      // Send playback_start and playback_end from listener
      wsListener.send(JSON.stringify({ t: 'playback_start', segmentId: firstChunk.segmentId } as ClientMsg));
      await new Promise((r) => setTimeout(r, 50));

      wsListener.send(
        JSON.stringify({ t: 'playback_end', segmentId: firstChunk.segmentId, totalMs: 1200 } as ClientMsg)
      );
      await new Promise((r) => setTimeout(r, 100));

      // Both should receive heard broadcast
      const listenerHeard = listenerMsgs.find((m) => m.t === 'heard' && m.segmentId === firstChunk.segmentId);
      const speakerHeard = speakerMsgs.find((m) => m.t === 'heard' && m.segmentId === firstChunk.segmentId);

      assert.ok(listenerHeard, 'Listener should receive heard event');
      assert.ok(speakerHeard, 'Speaker should receive heard event');
      if (listenerHeard && listenerHeard.t === 'heard') {
        assert.strictEqual(listenerHeard.pct, 1.0);
        assert.strictEqual(listenerHeard.interrupted, false);
      }
    }

    wsSpeaker.close();
    wsListener.close();
  });
});
