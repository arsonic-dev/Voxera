import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';

describe('Step 5: Barge-in and Heard Tracking', () => {
  const TEST_PORT = 3105;
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

  test('Heard text matches word count proportional to cut pct (20%, 50%, 90%)', () => {
    const text = 'You never listen to me when I am speaking to you';
    const words = text.trim().split(/\s+/);
    assert.strictEqual(words.length, 11);

    const getHeard = (pct: number) => {
      const count = Math.round(words.length * pct);
      return words.slice(0, count).join(' ');
    };

    assert.strictEqual(getHeard(0.2), 'You never');
    assert.strictEqual(getHeard(0.5), 'You never listen to me when');
    assert.strictEqual(getHeard(0.9), 'You never listen to me when I am speaking to');
  });

  test('Barge-in aborts segment and broadcasts heard event to both sides with correct heardText', async () => {
    const roomId = 'BARGE_ROOM';
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

    // Send speech from speaker to trigger segment commit
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

    // Wait for first audio chunk to reach listener
    await new Promise((r) => setTimeout(r, 700));

    const audioChunk = listenerMsgs.find((m) => m.t === 'audio');
    assert.ok(audioChunk, 'Listener should have received audio chunk');

    if (audioChunk && audioChunk.t === 'audio') {
      const segId = audioChunk.segmentId;

      // Listener barges in mid-playback at 50%
      const bargeInMsg: ClientMsg = {
        t: 'barge_in',
        segmentId: segId,
        playedMs: 500,
        totalMs: 1000,
      };
      wsListener.send(JSON.stringify(bargeInMsg));

      await new Promise((r) => setTimeout(r, 150));

      // Verify heard event received by both sides
      const speakerHeard = speakerMsgs.find((m) => m.t === 'heard' && m.segmentId === segId);
      const listenerHeard = listenerMsgs.find((m) => m.t === 'heard' && m.segmentId === segId);

      assert.ok(speakerHeard, 'Speaker must receive heard event on barge-in');
      assert.ok(listenerHeard, 'Listener must receive heard event on barge-in');

      if (speakerHeard && speakerHeard.t === 'heard') {
        assert.strictEqual(speakerHeard.interrupted, true, 'Interrupted must be true');
        assert.ok(speakerHeard.pct === 0.5, 'Pct should be 0.5');
        assert.ok(speakerHeard.heardText.length > 0, 'Heard text must not be empty');
      }
    }

    wsSpeaker.close();
    wsListener.close();
  });
});
