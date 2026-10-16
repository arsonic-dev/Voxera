import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer, server } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';

describe('Step 1: Rooms and Peer Status', () => {
  const TEST_PORT = 3101;
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

  test('Health endpoint returns ok', async () => {
    const res = await fetch(`http://localhost:${TEST_PORT}/health`);
    assert.strictEqual(res.status, 200);
    const data = await res.json();
    assert.strictEqual(data.status, 'ok');
  });

  test('Two participants join same room and see peer status', async () => {
    const roomId = 'TEST01';
    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}`);

    const ws1Messages: ServerMsg[] = [];
    const ws2Messages: ServerMsg[] = [];

    await Promise.all([
      new Promise<void>((res) => ws1.on('open', res)),
      new Promise<void>((res) => ws2.on('open', res)),
    ]);

    ws1.on('message', (d) => ws1Messages.push(JSON.parse(d.toString())));
    ws2.on('message', (d) => ws2Messages.push(JSON.parse(d.toString())));

    // 1. Participant 1 joins
    const join1: ClientMsg = { t: 'join', room: roomId, name: 'Rahul', lang: 'hi' };
    ws1.send(JSON.stringify(join1));

    await new Promise((r) => setTimeout(r, 100));
    assert.strictEqual(ws1Messages.length, 1);
    assert.strictEqual(ws1Messages[0].t, 'joined');
    if (ws1Messages[0].t === 'joined') {
      assert.strictEqual(ws1Messages[0].peer, null);
    }

    // 2. Participant 2 joins
    const join2: ClientMsg = { t: 'join', room: roomId, name: 'Elena', lang: 'es' };
    ws2.send(JSON.stringify(join2));

    await new Promise((r) => setTimeout(r, 100));

    // ws2 should receive "joined" with peer = Rahul
    assert.strictEqual(ws2Messages.length, 1);
    assert.strictEqual(ws2Messages[0].t, 'joined');
    if (ws2Messages[0].t === 'joined') {
      assert.ok(ws2Messages[0].peer);
      assert.strictEqual(ws2Messages[0].peer.name, 'Rahul');
      assert.strictEqual(ws2Messages[0].peer.lang, 'hi');
      assert.strictEqual(ws2Messages[0].peer.online, true);
    }

    // ws1 should receive "peer" message with Elena
    const peerMsgForWs1 = ws1Messages.find((m) => m.t === 'peer');
    assert.ok(peerMsgForWs1, 'ws1 should receive peer event');
    if (peerMsgForWs1 && peerMsgForWs1.t === 'peer') {
      assert.ok(peerMsgForWs1.peer);
      assert.strictEqual(peerMsgForWs1.peer.name, 'Elena');
      assert.strictEqual(peerMsgForWs1.peer.lang, 'es');
      assert.strictEqual(peerMsgForWs1.peer.online, true);
    }

    // 3. Close participant 2 and verify participant 1 sees them go offline
    ws2.close();
    await new Promise((r) => setTimeout(r, 100));

    const offlineMsg = ws1Messages.filter((m) => m.t === 'peer').pop();
    assert.ok(offlineMsg, 'ws1 should receive peer offline event');
    if (offlineMsg && offlineMsg.t === 'peer') {
      assert.ok(offlineMsg.peer);
      assert.strictEqual(offlineMsg.peer.name, 'Elena');
      assert.strictEqual(offlineMsg.peer.online, false);
    }

    ws1.close();
  });
});
