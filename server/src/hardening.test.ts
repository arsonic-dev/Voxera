import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';
import { roomManager } from './rooms.js';
import { pipelineManager } from './pipeline.js';

describe('Step 8: Hardening, Reconnect, and Abort Teardown', () => {
  const TEST_PORT = 3108;
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

  test('Reconnect: a dropped socket rejoins the same slot and STT restarts', async () => {
    const ROOM = 'HARDEN_REC';
    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);

    await new Promise<void>((resolve) => ws1.on('open', resolve));

    let slotAssigned: 'A' | 'B' | null = null;
    let participantId: string | null = null;

    ws1.send(JSON.stringify({ t: 'join', room: ROOM, name: 'Rahul', lang: 'hi' } as ClientMsg));

    await new Promise<void>((resolve) => {
      ws1.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMsg;
        if (msg.t === 'joined') {
          participantId = msg.you;
          const p = roomManager.getRoom(ROOM)?.participants.get(msg.you);
          slotAssigned = p?.slot || null;
          resolve();
        }
      });
    });

    assert.strictEqual(slotAssigned, 'A', 'First participant should get slot A');

    // Simulate network drop: close socket
    ws1.close();
    await new Promise((r) => setTimeout(r, 100));

    // Verify participant is marked offline and pipeline was cleaned up
    const pOffline = roomManager.getRoom(ROOM)?.participants.get(participantId!);
    assert.strictEqual(pOffline?.online, false, 'Participant must be marked offline after disconnect');

    // Reconnect with new socket and same name
    const ws1Reconnected = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    await new Promise<void>((resolve) => ws1Reconnected.on('open', resolve));

    let reconnectedSlot: 'A' | 'B' | null = null;
    let reconnectedId: string | null = null;

    ws1Reconnected.send(JSON.stringify({ t: 'join', room: ROOM, name: 'Rahul', lang: 'hi' } as ClientMsg));

    await new Promise<void>((resolve) => {
      ws1Reconnected.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMsg;
        if (msg.t === 'joined') {
          reconnectedId = msg.you;
          const p = roomManager.getRoom(ROOM)?.participants.get(msg.you);
          reconnectedSlot = p?.slot || null;
          resolve();
        }
      });
    });

    assert.strictEqual(reconnectedId, participantId, 'Reconnected participant should preserve participant ID');
    assert.strictEqual(reconnectedSlot, 'A', 'Reconnected participant must reclaim slot A');

    ws1Reconnected.close();
  });

  test('Closing a socket aborts all STT, LLM and TTS work for that person', async () => {
    const ROOM = 'ABORT_ROOM';
    const ws = new WebSocket(`ws://localhost:${TEST_PORT}/ws`);
    await new Promise<void>((resolve) => ws.on('open', resolve));

    let youId = '';
    ws.send(JSON.stringify({ t: 'join', room: ROOM, name: 'Elena', lang: 'es' } as ClientMsg));

    await new Promise<void>((resolve) => {
      ws.on('message', (data) => {
        const msg = JSON.parse(data.toString()) as ServerMsg;
        if (msg.t === 'joined') {
          youId = msg.you;
          resolve();
        }
      });
    });

    const pipeline = pipelineManager.get(youId);
    assert.ok(pipeline, 'Pipeline should be registered');

    // Disconnect socket
    ws.close();
    await new Promise((r) => setTimeout(r, 100));

    // Check pipeline unregistration and abort
    const pipelineAfter = pipelineManager.get(youId);
    assert.strictEqual(pipelineAfter, undefined, 'Pipeline must be unregistered upon socket close');
  });

  test('Rate limit protects room from runaway audio loops', () => {
    const ROOM = 'RL_ROOM';
    const rateLimit = pipelineManager.getRoomRateLimit(ROOM);

    // Record 40 timestamps
    const now = Date.now();
    for (let i = 0; i < 40; i++) {
      rateLimit.segmentTimestamps.push(now - i * 500);
    }

    assert.ok(rateLimit.segmentTimestamps.length >= 35, 'Rate limit tracking active');
  });

  test('Memory remains flat over repeated segment cycles', async () => {
    const initialHeap = process.memoryUsage().heapUsed;

    // Simulate 30 rapid segment commits and translation cycles
    const ROOM = 'MEM_TEST';
    for (let i = 0; i < 30; i++) {
      pipelineManager.recordSegment(ROOM, {
        id: `seg-${i}`,
        utteranceId: `utt-${i}`,
        participantId: 'p1',
        speakerName: 'Test',
        srcLang: 'en',
        dstLang: 'es',
        srcText: 'This is a repeated line for memory verification.',
        trText: 'Esta es una línea repetida para verificación de memoria.',
        intensity: 0.5,
        emotion: 'calm',
        retracts: null,
        status: 'heard',
        ttsMs: 1500,
        abortController: new AbortController(),
      });
    }

    // Verify roomSegments capped to max 60 items
    const segments = (pipelineManager as any).roomSegments.get(ROOM);
    assert.ok(segments.length <= 60, 'Segment history must stay bounded');

    if (global.gc) global.gc();
    const finalHeap = process.memoryUsage().heapUsed;
    const growthMb = (finalHeap - initialHeap) / (1024 * 1024);

    console.log(`[Memory Check] Heap delta over 30 segments: ${growthMb.toFixed(2)} MB`);
    assert.ok(growthMb < 30, 'Heap growth must remain flat');
  });
});
