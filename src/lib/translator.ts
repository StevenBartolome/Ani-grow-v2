import AsyncStorage from '@react-native-async-storage/async-storage';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2';

export const LANGUAGES: { [key: string]: string } = {
  'en': 'en',
  'fil': 'tl',
};

// ─── Cache helpers ────────────────────────────────────────────────────────────

function getCacheKey(targetCode: string, text: string): string {
  return `gt_v1_${targetCode}_${encodeURIComponent(text.trim().toLowerCase())}`;
}

async function getCache(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch {
    return null;
  }
}

async function setCache(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch {}
}

// ─── Micro-task batcher ───────────────────────────────────────────────────────

type Resolver = (result: string) => void;
interface PendingItem { text: string; resolve: Resolver }

const pendingByLang = new Map<string, PendingItem[]>();
let batchScheduled = false;

export function queueTranslation(text: string, lang: string): Promise<string> {
  if (lang === 'en') return Promise.resolve(text);

  const leadingSpace = text.match(/^(\s+)/)?.[1] || '';
  const trailingSpace = text.match(/(\s+)$/)?.[1] || '';
  const trimmed = text.trim();

  if (!trimmed) return Promise.resolve(text);

  return new Promise((resolve) => {
    if (!pendingByLang.has(lang)) pendingByLang.set(lang, []);
    pendingByLang.get(lang)!.push({
      text: trimmed,
      resolve: (res) => resolve(`${leadingSpace}${res}${trailingSpace}`),
    });

    if (!batchScheduled) {
      batchScheduled = true;
      setTimeout(async () => {
        batchScheduled = false;
        for (const [batchLang, items] of Array.from(pendingByLang)) {
          pendingByLang.delete(batchLang);
          const texts = items.map((i) => i.text);
          const results = await translateBatch(texts, batchLang);
          items.forEach((item, idx) => item.resolve(results[idx]));
        }
      }, 0);
    }
  });
}

// ─── Batch translation ────────────────────────────────────────────────────────

export async function translateBatch(texts: string[], targetLang: string): Promise<string[]> {
  const targetCode = LANGUAGES[targetLang];
  if (!targetCode || targetCode === 'en' || texts.length === 0) return texts;

  const results: string[] = new Array(texts.length);
  const indicesToFetch: number[] = [];
  const textsToFetch: string[] = [];

  await Promise.all(
    texts.map(async (text, index) => {
      const trimmed = text.trim();
      if (!trimmed || trimmed.length < 2 || /^\d[\d\s,.:%-]*$/.test(trimmed)) {
        results[index] = text;
        return;
      }
      const cached = await getCache(getCacheKey(targetCode, trimmed));
      if (cached) {
        results[index] = cached;
      } else {
        indicesToFetch.push(index);
        textsToFetch.push(trimmed);
      }
    })
  );

  if (textsToFetch.length === 0) return results;

  if (!GOOGLE_API_KEY) {
    indicesToFetch.forEach((i) => { results[i] = texts[i]; });
    return results;
  }

  const CHUNK = 128;
  for (let start = 0; start < textsToFetch.length; start += CHUNK) {
    const chunkTexts = textsToFetch.slice(start, start + CHUNK);
    const chunkIndices = indicesToFetch.slice(start, start + CHUNK);

    try {
      const url = `${GOOGLE_URL}?key=${GOOGLE_API_KEY}`;
      const body = { q: chunkTexts, source: 'en', target: targetCode, format: 'text' };

      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        throw new Error(`Google Translate error: ${response.status}`);
      }

      const data = await response.json();
      const translations: { translatedText: string }[] = data.data?.translations || [];

      await Promise.all(
        chunkIndices.map(async (originalIndex, i) => {
          const originalText = texts[originalIndex];
          let translatedText = translations[i]?.translatedText || originalText;
          if (targetCode === 'tl' && typeof translatedText === 'string') {
            translatedText = translatedText.replace(/\bnamatay\b/gi, (m) => m.charAt(0).toUpperCase() + m.slice(1));
            translatedText = translatedText.replace(/\bmanok\b/gi, (m, offset, str) => {
              const prev = str.slice(0, offset).trim();
              if (/(\bmga|\bng|\bsa|\bang|^)$/i.test(prev)) {
                return 'Manok';
              }
              return m;
            });
            translatedText = translatedText.replace(/\bbaboy\b/gi, (m, offset, str) => {
              const prev = str.slice(0, offset).trim();
              if (/(\bmga|\bng|\bsa|\bang|^)$/i.test(prev)) {
                return 'Baboy';
              }
              return m;
            });
            translatedText = translatedText.replace(/^\s*mga\s+/i, 'Mga ');
          }
          await setCache(getCacheKey(targetCode, originalText.trim()), translatedText);
          results[originalIndex] = translatedText;
        })
      );
    } catch (error) {
      console.error('Batch translation failed:', error);
      chunkIndices.forEach((i) => { results[i] = texts[i]; });
    }
  }

  return results;
}
