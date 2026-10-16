import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { Lang } from '@crossfire/shared';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Read translate prompt from server/prompts/translate.md
const promptCandidates = [
  path.resolve(__dirname, '../prompts/translate.md'),
  path.resolve(__dirname, '../../server/prompts/translate.md'),
  path.resolve(process.cwd(), 'server/prompts/translate.md'),
];
const promptPath = promptCandidates.find((p) => fs.existsSync(p)) || promptCandidates[0];
const SYSTEM_PROMPT_TEMPLATE = fs.existsSync(promptPath)
  ? fs.readFileSync(promptPath, 'utf-8')
  : `You are the live interpreter in a heated argument between two people.
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
   then a line containing only ---, then the translation. Nothing else.`;

export interface ContextLine {
  segmentId: string;
  speakerName: string;
  lang: Lang;
  text: string;
  heardText?: string;
}

export interface TranslateRequest {
  segmentId: string;
  srcLang: Lang;
  dstLang: Lang;
  speakerName: string;
  text: string;
  loudness: number;
  wpm?: number;
  contextLines: ContextLine[];
  signal?: AbortSignal;
}

export interface TranslateHeader {
  intensity: number;
  emotion: string;
  retracts: string | null;
}

export interface TranslateCallbacks {
  onHeader: (header: TranslateHeader) => void;
  onChunk: (chunk: string) => void;
  onComplete: (fullTranslation: string, header: TranslateHeader) => void;
  onError: (err: Error) => void;
}

export interface Translator {
  translate: (req: TranslateRequest, callbacks: TranslateCallbacks) => Promise<void>;
}

// Built-in insult and heated phrases translations for deterministic testing
const HEATED_DICTIONARY: Record<string, Record<Lang, string>> = {
  'You never listen to me!': {
    en: 'You never listen to me!',
    hi: 'तुम कभी मेरी बात नहीं सुनते!',
    es: '¡Nunca me escuchas!',
    fr: 'Tu ne m\'écoutes jamais!',
    de: 'Du hörst mir nie zu!',
    pt: 'Você nunca me escuta!',
    it: 'Non mi ascolti mai!',
    ru: 'Ты никогда меня не слушаешь!',
  },
  'You are an absolute idiot!': {
    en: 'You are an absolute idiot!',
    hi: 'तुम बिल्कुल बेवकूफ हो!',
    es: '¡Eres un completo idiota!',
    fr: 'Tu es un parfait idiot!',
    de: 'Du bist ein absoluter Idiot!',
    pt: 'Você é um idiota completo!',
    it: 'Sei un completo idiota!',
    ru: 'Ты абсолютный идиот!',
  },
  'Shut your mouth!': {
    en: 'Shut your mouth!',
    hi: 'अपना मुंह बंद करो!',
    es: '¡Cierra la boca!',
    fr: 'Ferme ta gueule!',
    de: 'Halt dein Maul!',
    pt: 'Cala a boca!',
    it: 'Chiudi quella bocca!',
    ru: 'Заткни свою пасть!',
  },
  'That is completely ridiculous and you know it.': {
    en: 'That is completely ridiculous and you know it.',
    hi: 'यह पूरी तरह से बकवास है और आप जानते हैं।',
    es: 'Eso es completamente ridículo y lo sabes.',
    fr: 'C\'est complètement ridicule et tu le sais.',
    de: 'Das ist absolut lächerlich und das weißt du.',
    pt: 'Isso é completamente ridículo e você sabe.',
    it: 'È completamente ridicolo e lo sai.',
    ru: 'Это совершенно смехотворно, и ты это знаешь.',
  },
  'You ruined everything!': {
    en: 'You ruined everything!',
    hi: 'तुमने सब कुछ बर्बाद कर दिया!',
    es: '¡Arruinaste todo!',
    fr: 'Tu as tout gâché!',
    de: 'Du hast alles ruiniert!',
    pt: 'Você arruinou tudo!',
    it: 'Hai rovinato tutto!',
    ru: 'Ты всё испортил!',
  },
  'Stop lying to my face!': {
    en: 'Stop lying to my face!',
    hi: 'मेरे चेहरे पर झूठ बोलना बंद करो!',
    es: '¡Deja de mentirme en la cara!',
    fr: 'Arrête de me mentir en face!',
    de: 'Hör auf, mir ins Gesicht zu lügen!',
    pt: 'Pare de mentir na minha cara!',
    it: 'Smettila di mentirmi in faccia!',
    ru: 'Перестань врать мне в лицо!',
  },
  'You are completely incompetent!': {
    en: 'You are completely incompetent!',
    hi: 'तुम पूरी तरह से अयोग्य हो!',
    es: '¡Eres completamente incompetente!',
    fr: 'Tu es complètement incompétent!',
    de: 'Du bist völlig inkompetent!',
    pt: 'Você é completamente incompetente!',
    it: 'Sei completamente incompetente!',
    ru: 'Ты совершенно некомпетентен!',
  },
  'I can\'t stand listening to your nonsense!': {
    en: 'I can\'t stand listening to your nonsense!',
    hi: 'मैं तुम्हारी बकवास नहीं सुन सकता!',
    es: '¡No soporto escuchar tus tonterías!',
    fr: 'Je ne supporte plus tes bêtises!',
    de: 'Ich kann deinen Unsinn nicht mehr hören!',
    pt: 'Não aguento mais ouvir suas bobagens!',
    it: 'Non sopporto più di sentire le tue sciocchezze!',
    ru: 'Я не могу больше слушать твой бред!',
  },
  'Get out of here!': {
    en: 'Get out of here!',
    hi: 'यहाँ से बाहर निकलो!',
    es: '¡Lárgate de aquí!',
    fr: 'Dégage d\'ici!',
    de: 'Hau ab von hier!',
    pt: 'Dá o fora daqui!',
    it: 'Vattene via da qui!',
    ru: 'Убирайся отсюда!',
  },
  'You are pathetic!': {
    en: 'You are pathetic!',
    hi: 'तुम दयनीय हो!',
    es: '¡Eres patético!',
    fr: 'Tu es pathétique!',
    de: 'Du bist erbärmlich!',
    pt: 'Você é patético!',
    it: 'Sei patetico!',
    ru: 'Ты жалок!',
  },
};

export class FakeTranslator implements Translator {
  private scriptOverrides: Map<string, { header: TranslateHeader; translation: string }> = new Map();

  public setOverride(text: string, header: TranslateHeader, translation: string) {
    this.scriptOverrides.set(text.trim(), { header, translation });
  }

  public async translate(req: TranslateRequest, callbacks: TranslateCallbacks): Promise<void> {
    const { text, loudness, contextLines, dstLang, signal } = req;

    if (signal?.aborted) return;

    // Check for override
    const override = this.scriptOverrides.get(text.trim());
    let header: TranslateHeader;
    let translationText: string;

    if (override) {
      header = override.header;
      translationText = override.translation;
    } else {
      // Check for retraction trigger words
      const lower = text.toLowerCase();
      const isRetraction =
        lower.includes('no wait') ||
        lower.includes('i mean') ||
        lower.includes('forget that') ||
        lower.includes('नहीं रुको') ||
        lower.includes('मेरा मतलब') ||
        lower.includes('no espera') ||
        lower.includes('quise decir');

      let retractsId: string | null = null;
      if (isRetraction && contextLines.length > 0) {
        // Retract last segment said by same speaker or last active segment
        const lastTarget = [...contextLines].reverse().find((c) => c.speakerName === req.speakerName) || contextLines[contextLines.length - 1];
        retractsId = lastTarget?.segmentId || null;
      }

      // Look up in dictionary or produce sensible translation
      const match = HEATED_DICTIONARY[text.trim()];
      const isInsult = !!match || text.includes('!') || /idiot|mouth|liar|lying|ruined|shut|stop|incompetent|ridiculous|pathetic|tonterías|estúpido|बेवकूफ/i.test(text);
      const baseIntensity = isInsult ? 0.9 : Math.max(0.3, loudness * 1.4);
      const intensity = Math.min(1, baseIntensity);
      const emotion = intensity > 0.6 ? 'angry' : isRetraction ? 'pleading' : 'sarcastic';
      header = { intensity, emotion, retracts: retractsId };

      if (match && match[dstLang]) {
        translationText = match[dstLang];
      } else {
        // Deterministic translation simulation
        translationText = `[${dstLang.toUpperCase()}] ${text}`;
      }
    }

    // Call header callback
    callbacks.onHeader(header);

    // Stream chunks with small realistic delays
    const words = translationText.split(' ');
    let accumulated = '';

    for (let i = 0; i < words.length; i++) {
      if (signal?.aborted) return;
      const word = (i === 0 ? '' : ' ') + words[i];
      accumulated += word;
      callbacks.onChunk(word);
      await new Promise((r) => setTimeout(r, 20));
    }

    if (!signal?.aborted) {
      callbacks.onComplete(accumulated, header);
    }
  }
}

export class ClaudeTranslator implements Translator {
  private apiKey: string;

  constructor(apiKey: string) {
    this.apiKey = apiKey;
  }

  public async translate(req: TranslateRequest, callbacks: TranslateCallbacks): Promise<void> {
    const { text, srcLang, dstLang, loudness, wpm, contextLines, signal } = req;

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{src}', srcLang).replace('{dst}', dstLang);

    // Format user content per TechSpec line 111:
    // `[id] speaker (lang): text | heard: "..."`
    const last12 = contextLines.slice(-12);
    const contextFormatted = last12
      .map(
        (c) =>
          `[${c.segmentId}] ${c.speakerName} (${c.lang}): ${c.text} | heard: "${c.heardText || c.text}"`
      )
      .join('\n');

    const loudnessHint = loudness > 0.65 ? ', hint: speaker is shouting' : loudness < 0.2 ? ', hint: whisper' : '';
    const wpmHint = wpm ? `, wpm: ${Math.round(wpm)}` : '';
    const userContent = `${contextFormatted ? `${contextFormatted}\n\n` : ''}New segment to translate:
[${req.segmentId}] ${req.speakerName} (${srcLang}): ${text} (loudness: ${loudness.toFixed(2)}${wpmHint}${loudnessHint})`;

    try {
      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: {
          'x-api-key': this.apiKey,
          'anthropic-version': '2023-06-01',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: 'claude-haiku-5-5',
          max_tokens: 1024,
          system: systemPrompt,
          messages: [{ role: 'user', content: userContent }],
          stream: true,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`Anthropic API error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let headerParsed = false;
      let header: TranslateHeader = { intensity: 0.5, emotion: 'angry', retracts: null };
      let translationAccumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            if (parsed.type === 'content_block_delta' && parsed.delta?.text) {
              const textChunk = parsed.delta.text;

              if (!headerParsed) {
                // Header is before ---
                translationAccumulated += textChunk;
                if (translationAccumulated.includes('---')) {
                  const parts = translationAccumulated.split('---');
                  const headerText = parts[0].trim();
                  translationAccumulated = parts.slice(1).join('---').trimStart();

                  try {
                    // Extract JSON from headerText
                    const jsonMatch = headerText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      const h = JSON.parse(jsonMatch[0]);
                      header = {
                        intensity: typeof h.intensity === 'number' ? h.intensity : 0.5,
                        emotion: typeof h.emotion === 'string' ? h.emotion : 'other',
                        retracts: typeof h.retracts === 'string' ? h.retracts : null,
                      };
                    }
                  } catch (e) {
                    console.warn('[Translator] Failed to parse JSON header, using fallback', e);
                  }

                  headerParsed = true;
                  callbacks.onHeader(header);

                  if (translationAccumulated.length > 0) {
                    callbacks.onChunk(translationAccumulated);
                  }
                }
              } else {
                translationAccumulated += textChunk;
                callbacks.onChunk(textChunk);
              }
            }
          } catch {
            // Non-JSON SSE line
          }
        }
      }

      callbacks.onComplete(translationAccumulated.trim(), header);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // Normal cancellation
      }
      callbacks.onError(err as Error);
    }
  }
}

export class OpenRouterTranslator implements Translator {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string = 'anthropic/claude-3.5-haiku') {
    this.apiKey = apiKey;
    this.model = model;
  }

  public async translate(req: TranslateRequest, callbacks: TranslateCallbacks): Promise<void> {
    const { text, srcLang, dstLang, loudness, wpm, contextLines, signal } = req;

    const systemPrompt = SYSTEM_PROMPT_TEMPLATE.replace('{src}', srcLang).replace('{dst}', dstLang);

    const last12 = contextLines.slice(-12);
    const contextFormatted = last12
      .map(
        (c) =>
          `[${c.segmentId}] ${c.speakerName} (${c.lang}): ${c.text} | heard: "${c.heardText || c.text}"`
      )
      .join('\n');

    const loudnessHint = loudness > 0.65 ? ', hint: speaker is shouting' : loudness < 0.2 ? ', hint: whisper' : '';
    const wpmHint = wpm ? `, wpm: ${Math.round(wpm)}` : '';
    const userContent = `${contextFormatted ? `${contextFormatted}\n\n` : ''}New segment to translate:
[${req.segmentId}] ${req.speakerName} (${srcLang}): ${text} (loudness: ${loudness.toFixed(2)}${wpmHint}${loudnessHint})`;

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${this.apiKey}`,
          'HTTP-Referer': 'https://github.com/arsonic-dev/Voxera',
          'X-Title': 'Voxera Live Interpreter',
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          model: this.model,
          messages: [
            { role: 'system', content: systemPrompt },
            { role: 'user', content: userContent },
          ],
          max_tokens: 350,
          stream: true,
          temperature: 0.3,
        }),
        signal,
      });

      if (!response.ok) {
        const errText = await response.text();
        throw new Error(`OpenRouter API error (${response.status}): ${errText}`);
      }

      if (!response.body) {
        throw new Error('Response body is null');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';
      let headerParsed = false;
      let header: TranslateHeader = { intensity: 0.5, emotion: 'angry', retracts: null };
      let translationAccumulated = '';

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });

        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (!line.startsWith('data: ')) continue;
          const dataStr = line.slice(6).trim();
          if (dataStr === '[DONE]') continue;

          try {
            const parsed = JSON.parse(dataStr);
            const textChunk = parsed.choices?.[0]?.delta?.content;
            if (typeof textChunk === 'string' && textChunk.length > 0) {
              if (!headerParsed) {
                translationAccumulated += textChunk;
                if (translationAccumulated.includes('---')) {
                  const parts = translationAccumulated.split('---');
                  const headerText = parts[0].trim();
                  translationAccumulated = parts.slice(1).join('---').trimStart();

                  try {
                    const jsonMatch = headerText.match(/\{[\s\S]*\}/);
                    if (jsonMatch) {
                      const h = JSON.parse(jsonMatch[0]);
                      header = {
                        intensity: typeof h.intensity === 'number' ? h.intensity : 0.5,
                        emotion: typeof h.emotion === 'string' ? h.emotion : 'other',
                        retracts: typeof h.retracts === 'string' ? h.retracts : null,
                      };
                    }
                  } catch (e) {
                    console.warn('[OpenRouter] Failed to parse JSON header, using fallback', e);
                  }

                  headerParsed = true;
                  callbacks.onHeader(header);

                  if (translationAccumulated.length > 0) {
                    callbacks.onChunk(translationAccumulated);
                  }
                }
              } else {
                translationAccumulated += textChunk;
                callbacks.onChunk(textChunk);
              }
            }
          } catch {
            // Non-JSON line
          }
        }
      }

      callbacks.onComplete(translationAccumulated.trim(), header);
    } catch (err: unknown) {
      if ((err as Error)?.name === 'AbortError') {
        return; // Normal cancellation
      }
      callbacks.onError(err as Error);
    }
  }
}

let activeTranslator: Translator | null = null;

export function getTranslator(): Translator {
  if (activeTranslator) return activeTranslator;

  const openRouterKey =
    process.env.OPENROUTER_API_KEY ||
    (process.env.ANTHROPIC_API_KEY?.startsWith('sk-or-') ? process.env.ANTHROPIC_API_KEY : undefined);
  const anthropicKey =
    process.env.ANTHROPIC_API_KEY && !process.env.ANTHROPIC_API_KEY.startsWith('sk-or-')
      ? process.env.ANTHROPIC_API_KEY
      : undefined;

  const useFakes = process.env.USE_FAKES === 'true' || (!anthropicKey && !openRouterKey);
  if (useFakes) {
    activeTranslator = new FakeTranslator();
  } else if (openRouterKey) {
    const model = process.env.OPENROUTER_MODEL || 'anthropic/claude-3.5-haiku';
    activeTranslator = new OpenRouterTranslator(openRouterKey, model);
  } else {
    activeTranslator = new ClaudeTranslator(anthropicKey!);
  }
  return activeTranslator;
}

export function setTranslatorForTesting(t: Translator) {
  activeTranslator = t;
}
