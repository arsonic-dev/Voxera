import { test, describe, before, after } from 'node:test';
import assert from 'node:assert';
import http from 'http';
import { WebSocket } from 'ws';
import { startServer } from './index.js';
import { ClientMsg, ServerMsg } from '@crossfire/shared';
import { getTranslator, FakeTranslator } from './translate.js';

describe('Step 3: Segments and Translation (Text only)', () => {
  const TEST_PORT = 3103;
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

  test('Translator streams header and full unsoftened translation', async () => {
    const translator = getTranslator();
    let headerReceived: any = null;
    let chunks: string[] = [];
    let completedText = '';

    await translator.translate(
      {
        segmentId: 'test-seg-1',
        srcLang: 'en',
        dstLang: 'es',
        speakerName: 'Elena',
        text: 'You are an absolute idiot!',
        loudness: 0.8,
        wpm: 150,
        contextLines: [],
      },
      {
        onHeader: (h) => {
          headerReceived = h;
        },
        onChunk: (c) => {
          chunks.push(c);
        },
        onComplete: (full, h) => {
          completedText = full;
        },
        onError: (err) => {
          assert.fail(err);
        },
      }
    );

    assert.ok(headerReceived, 'Header should be parsed');
    assert.ok(headerReceived.intensity >= 0.5, 'Intensity should reflect loudness');
    assert.ok(chunks.length >= 1, 'Should have streamed chunks');
    assert.strictEqual(completedText, '¡Eres un completo idiota!', 'Insult must not be softened');
  });

  test('Runs same insult 3 times to confirm stability', async () => {
    const translator = getTranslator();
    const results: string[] = [];

    for (let i = 0; i < 3; i++) {
      let res = '';
      await translator.translate(
        {
          segmentId: `test-stable-${i}`,
          srcLang: 'en',
          dstLang: 'es',
          speakerName: 'Elena',
          text: 'Shut your mouth!',
          loudness: 0.9,
          contextLines: [],
        },
        {
          onHeader: () => {},
          onChunk: () => {},
          onComplete: (full) => {
            res = full;
          },
          onError: (e) => assert.fail(e),
        }
      );
      results.push(res);
    }

    assert.strictEqual(results[0], '¡Cierra la boca!');
    assert.strictEqual(results[0], results[1]);
    assert.strictEqual(results[1], results[2]);
  });

  test('Committed segment broadcasts tr to both participants in room', async () => {
    const roomId = 'TR_TEST';
    const ws1 = new WebSocket(`ws://localhost:${TEST_PORT}`);
    const ws2 = new WebSocket(`ws://localhost:${TEST_PORT}`);

    const ws1Msgs: ServerMsg[] = [];
    const ws2Msgs: ServerMsg[] = [];

    await Promise.all([
      new Promise<void>((res) => ws1.on('open', res)),
      new Promise<void>((res) => ws2.on('open', res)),
    ]);

    ws1.on('message', (d) => ws1Msgs.push(JSON.parse(d.toString())));
    ws2.on('message', (d) => ws2Msgs.push(JSON.parse(d.toString())));

    ws1.send(JSON.stringify({ t: 'join', room: roomId, name: 'Rahul', lang: 'hi' } as ClientMsg));
    ws2.send(JSON.stringify({ t: 'join', room: roomId, name: 'Elena', lang: 'es' } as ClientMsg));

    await new Promise((r) => setTimeout(r, 100));

    // Send audio frames from Rahul (Hindi) that trigger a committed segment
    const makeVoice = () => {
      const buf = Buffer.alloc(3200);
      for (let i = 0; i < 1600; i++) {
        const sample = Math.round(18000 * Math.sin((2 * Math.PI * 250 * i) / 16000));
        buf.writeInt16LE(sample, i * 2);
      }
      return buf;
    };
    const silence = Buffer.alloc(3200);

    for (let i = 0; i < 4; i++) {
      ws1.send(makeVoice());
      await new Promise((r) => setTimeout(r, 40));
    }
    for (let i = 0; i < 4; i++) {
      ws1.send(silence);
      await new Promise((r) => setTimeout(r, 40));
    }

    // Wait for translation to stream and complete
    await new Promise((r) => setTimeout(r, 600));

    // Both ws1 (speaker) and ws2 (listener) must receive `tr` messages
    const ws1Tr = ws1Msgs.filter((m) => m.t === 'tr');
    const ws2Tr = ws2Msgs.filter((m) => m.t === 'tr');

    assert.ok(ws1Tr.length >= 1, `Speaker should receive tr messages, got ${ws1Tr.length}`);
    assert.ok(ws2Tr.length >= 1, `Listener should receive tr messages, got ${ws2Tr.length}`);

    // Check segmentId and final true
    const finalTr = ws2Tr.find((m) => m.t === 'tr' && m.final);
    assert.ok(finalTr, 'Listener should receive final tr message');
    if (finalTr && finalTr.t === 'tr') {
      assert.ok(finalTr.segmentId, 'tr message must have segmentId');
      assert.ok(finalTr.text.length > 0, 'tr text must be non-empty');
    }

    ws1.close();
    ws2.close();
  });

  test('OpenRouterTranslator is instantiated when OPENROUTER_API_KEY or sk-or-* is configured', async () => {
    const { OpenRouterTranslator } = await import('./translate.js');
    const ort = new OpenRouterTranslator('sk-or-v1-test', 'custom-model');
    assert.ok(ort, 'OpenRouterTranslator instance created');
    assert.strictEqual(typeof ort.translate, 'function');
  });
});

