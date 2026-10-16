import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';
import { runRetractionCases } from '../../scripts/sim.js';

describe('Step 6: Mind Changes (Retraction)', () => {
  const TEST_PORT = 3106;
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

  test('All 6 self-correction cases in sim behave correctly (at least 5/6 required)', async () => {
    const result = await runRetractionCases(TEST_PORT);
    assert.ok(result.passed >= 5, `Expected at least 5 of 6 cases to pass, got ${result.passed}`);
    assert.strictEqual(result.passed, 6, 'All 6 cases passed');
  });

  test('Retraction sends cancel to listener when target is pending, and marks retracted', async () => {
    const roomId = 'RETRACT_ROOM';
    const wsSpeaker = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const wsListener = new WebSocket(`ws://localhost:${TEST_PORT}`);

    const listenerMsgs: ServerMsg[] = [];
    await Promise.all([
      new Promise<void>((res) => wsSpeaker.on('open', res)),
      new Promise<void>((res) => wsListener.on('open', res)),
    ]);

    wsListener.on('message', (d) => listenerMsgs.push(JSON.parse(d.toString())));

    wsSpeaker.send(JSON.stringify({ t: 'join', room: roomId, name: 'Rahul', lang: 'en' } as ClientMsg));
    wsListener.send(JSON.stringify({ t: 'join', room: roomId, name: 'Elena', lang: 'es' } as ClientMsg));

    await new Promise((r) => setTimeout(r, 100));

    // Manually trigger handleRetraction on server pipeline
    const { pipelineManager } = await import('./pipeline.js');
    const segId = 'test-retract-target';
    const abortController = new AbortController();

    pipelineManager.recordSegment(roomId, {
      id: segId,
      utteranceId: 'u1',
      participantId: 'p1',
      speakerName: 'Rahul',
      srcLang: 'en',
      dstLang: 'es',
      srcText: 'I said something wrong',
      trText: 'Dije algo equivocado',
      intensity: 0.5,
      emotion: 'calm',
      retracts: null,
      status: 'pending',
      ttsMs: 1000,
      abortController,
    });

    // Retract it
    pipelineManager.handleRetraction(roomId, segId);

    await new Promise((r) => setTimeout(r, 100));

    // Listener should have received cancel message with reason retracted
    const cancelMsg = listenerMsgs.find((m) => m.t === 'cancel' && m.segmentId === segId);
    assert.ok(cancelMsg, 'Listener must receive cancel event');
    if (cancelMsg && cancelMsg.t === 'cancel') {
      assert.strictEqual(cancelMsg.reason, 'retracted');
    }

    assert.ok(abortController.signal.aborted, 'Pending segment abort signal should have been triggered');

    wsSpeaker.close();
    wsListener.close();
  });
});
