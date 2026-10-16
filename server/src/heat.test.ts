import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FakeTranslator, TranslateHeader } from './translate.js';
import { mapVoiceSettings } from './tts.js';

describe('Step 7: Heat and Insult Verification', () => {
  test('Voice settings scale linearly with intensity', () => {
    const calm = mapVoiceSettings(0.0);
    assert.strictEqual(calm.stability, 0.5);
    assert.strictEqual(calm.style, 0.2);
    assert.strictEqual(calm.speed, 1.0);

    const moderate = mapVoiceSettings(0.5);
    assert.strictEqual(Number(moderate.stability.toFixed(2)), 0.35);
    assert.strictEqual(Number(moderate.style.toFixed(2)), 0.5);
    assert.strictEqual(Number(moderate.speed.toFixed(3)), 1.125);

    const heated = mapVoiceSettings(1.0);
    assert.strictEqual(Number(heated.stability.toFixed(2)), 0.2);
    assert.strictEqual(Number(heated.style.toFixed(2)), 0.8);
    assert.strictEqual(Number(heated.speed.toFixed(2)), 1.25);
  });

  test('Translator returns high intensity for heated insults without softening', async () => {
    const translator = new FakeTranslator();
    const insults = [
      'You are an absolute idiot!',
      'Shut your mouth!',
      'Stop lying to my face!',
      'You ruined everything!',
      'You are pathetic!'
    ];

    for (const insult of insults) {
      let headerReceived: TranslateHeader | null = null;
      let text = '';

      await new Promise<void>((resolve, reject) => {
        translator.translate(
          {
            segmentId: `heat-test-${Date.now()}`,
            srcLang: 'en',
            dstLang: 'es',
            speakerName: 'Speaker',
            text: insult,
            loudness: 0.1,
            contextLines: []
          },
          {
            onHeader: (h) => {
              headerReceived = h;
            },
            onChunk: (chunk) => {
              text += chunk;
            },
            onComplete: (fullText, h) => {
              text = fullText;
              headerReceived = h;
              resolve();
            },
            onError: (err) => reject(err)
          }
        ).catch(reject);
      });

      assert.ok(headerReceived, `Header missing for insult: ${insult}`);
      assert.ok((headerReceived as TranslateHeader).intensity >= 0.7, `Expected high intensity >= 0.7, got ${(headerReceived as any)?.intensity}`);
      assert.ok(text.length > 0, `Expected translation text for: ${insult}`);
      // Ensure insult was not softened
      const lowercase = text.toLowerCase();
      assert.ok(!lowercase.includes('por favor'), `Insult was softened with please: ${text}`);
      assert.ok(!lowercase.includes('disculpe'), `Insult was softened with excuse me: ${text}`);
    }
  });
});
