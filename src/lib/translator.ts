import AsyncStorage from '@react-native-async-storage/async-storage';

const GOOGLE_API_KEY = process.env.EXPO_PUBLIC_GOOGLE_API_KEY;
const GEMINI_API_KEY = process.env.EXPO_PUBLIC_GEMINI_API_KEY;
const GOOGLE_URL = 'https://translation.googleapis.com/language/translate/v2';

export const LANGUAGES: { [key: string]: string } = {
  'en': 'en',
  'fil': 'tl',
};

// ─── Modern Practical Tagalog UI Dictionary ────────────────────────────

const FILIPINO_DICTIONARY: Record<string, string> = {
  // Greetings & Core App Branding
  'good day.': 'Magandang araw!',
  'good day!': 'Magandang araw!',
  'good day': 'Magandang araw',
  'good morning.': 'Magandang umaga!',
  'good morning!': 'Magandang umaga!',
  'good morning': 'Magandang umaga',
  'good afternoon': 'Magandang hapon',
  'good evening': 'Magandang gabi',
  'how can i assist your farm today?': 'Paano ko matutulungan ang farm mo ngayon?',
  'anigrow': 'AniGrow',
  'anifeed': 'AniFeed',
  'aniweigh': 'AniWeigh',

  // Animals & Livestock (Explicitly accurate farming terms)
  'chicks': 'Mga Sisiw',
  'chick': 'Sisiw',
  'chickens': 'Mga Manok',
  'chicken': 'Manok',
  'pigs': 'Mga Baboy',
  'pig': 'Baboy',
  'piglet': 'Biik',
  'piglets': 'Mga Biik',
  'swine': 'Baboy',
  'poultry': 'Manukan',
  'broiler': 'Broiler',
  'layers': 'Layers',
  'sow': 'Inahing Baboy',
  'boar': 'Barako',
  'pig pen': 'Pig Pen',
  'chicken coop': 'Chicken Coop',

  // Navigation & Headers (Kept in natural Taglish)
  'home': 'Home',
  'home dashboard': 'Home Dashboard',
  'animals': 'Mga Hayop',
  'animal details': 'Mga Detalye ng Hayop',
  'devices': 'Mga Device',
  'settings': 'Settings',
  'notifications': 'Mga Notification',
  'quick actions': 'Mabilis na Aksyon',
  'farm overview': 'Overview ng Farm',
  'search': 'Maghanap',
  'search devices...': 'Maghanap ng device...',
  'filter': 'Filter',
  'all': 'Lahat',
  'active': 'Active',
  'offline': 'Offline',
  'online': 'Online',
  'connected': 'Naka-connect',
  'disconnected': 'Hindi Naka-connect',
  'app language': 'Wika ng App',
  'language': 'Wika',
  'choose the language you want to use throughout the app.': 'Pumili ng wika na gagamitin sa buong app.',
  'english': 'English',
  'filipino': 'Filipino',
  'save changes': 'I-save ang Changes',
  'changing language...': 'Binabago ang wika...',

  // Home Screen Cards & Headers
  'total animals': 'Kabuuan ng Hayop',
  'active feeders': 'Active na Pakainan',
  'active scales': 'Active na Timbangan',
  'feed dispensed today': 'Naipakain Ngayong Araw',
  'weight sessions today': 'Timbang Ngayong Araw',
  'mortality this week': 'Namatay Ngayong Linggo',
  'general alert': 'General Alert',
  'device hardware': 'Device Hardware',
  'herd health': 'Kalusugan ng Hayop',
  'farm setup': 'Farm Setup',
  'system alert': 'System Alert',
  'staff invitation': 'Imbitasyon sa Staff',
  'ai insight': 'AI Insight',
  'view all': 'Tingnan Lahat',
  'recent alerts': 'Kamakailang Alert',
  'farm state': 'Kalagayan ng Farm',
  'all farms': 'Lahat ng Farm',
  'no alerts at this time': 'Walang alert sa ngayon',
  'no recent activity': 'Walang kamakailang activity',

  // Profile & Settings
  'edit profile': 'I-edit ang Profile',
  'change password': 'Palitan ang Password',
  'security & mfa': 'Security & MFA',
  'my farms': 'Aking mga Farm',
  'invite codes': 'Invite Codes',
  'notifications settings': 'Notification Settings',
  'user manual': 'User Manual',
  'about ani-grow': 'Tungkol sa Ani-Grow',
  'privacy policy': 'Privacy Policy',
  'account settings': 'Account Settings',
  'administration': 'Admin Settings',
  'app & information': 'App & Impormasyon',
  'device': 'Device',
  'light': 'Light Mode',
  'dark': 'Dark Mode',
  'log out': 'Log Out',
  'are you sure you want to log out?': 'Sigurado ka bang gusto mong mag-log out?',
  'are you sure you want to log out of your account?': 'Sigurado ka bang gusto mong mag-log out sa iyong account?',

  // Actions & Controls
  'back': 'Bumalik',
  'close': 'Isara',
  'delete': 'Burahin',
  'edit': 'I-edit',
  'update': 'I-update',
  'view': 'Tingnan',
  'view details': 'Tingnan ang Details',
  'view page': 'Tingnan ang Page',
  'see more': 'Tingnan ang Iba Pa',
  'see less': 'I-collapse',
  'optional': 'Optional',
  'required': 'Required',
  'success': 'Success',
  'error': 'Error',
  'warning': 'Warning',
  'cancel': 'Cancel',
  'confirm': 'Confirm',
  'retry': 'Subukang Muli',
  'loading...': 'Naglo-load...',

  // Farm & Batches
  'register animal batch': 'Mag-register ng Batch',
  'register batch': 'Mag-register ng Batch',
  'register new batch': 'Mag-register ng Bagong Batch',
  'add animal batch': 'Magdagdag ng Batch',
  'add heads to batch': 'Magdagdag sa Batch',
  'record mortality': 'Mag-record ng Namatay',
  'record deceased': 'Mag-record ng Namatay',
  'health records': 'Health Records',
  'weight logs': 'Weight Logs',
  'feed records': 'Feed Records',
  'recent activity': 'Kamakailang Activity',
  'housing capacity': 'Kapasidad ng Housing',
  'available space': 'Bakanteng Espasyo',
  'current count': 'Kasalukuyang Bilang',
  'initial count': 'Simulang Bilang',

  // Devices & Hardware (Kept standard)
  'aniweigh scale': 'AniWeigh Scale',
  'anifeed dispenser': 'AniFeed Dispenser',
  'anifeed device': 'AniFeed Device',
  'aniweigh device': 'AniWeigh Device',
  'live weight': 'Live Weight',
  'average weight': 'Average Weight',
  'total dispensed': 'Kabuuan ng Naipakain',
  'dispense feed': 'Magpakain',
  'dispense now': 'Magpakain Ngayon',
  'connect scale': 'I-connect ang Scale',
  'disconnect scale': 'I-disconnect ang Scale',
  'reading scale...': 'Nagbabasa ng Scale...',
  'hopper level': 'Feed Hopper Level',
  'add device': 'Magdagdag ng Device',
  'add new device': 'Magdagdag ng Bagong Device',

  // Notifications Page Specific
  'no notifications yet': 'Walang notifications sa ngayon',
  'you are all caught up. new alerts and messages will appear here.': 'Updated ka na! Dito lalabas ang mga bagong alert at mensahe.',
};

function sanitizeFilipinoTranslation(text: string): string {
  if (!text || typeof text !== 'string') return text;
  let cleaned = text;

  // Prevent "chicks" from being translated into "batang babae" (young female/girls)
  cleaned = cleaned.replace(/\bmga batang babae\b/gi, 'mga sisiw');
  cleaned = cleaned.replace(/\bbatang babae\b/gi, 'sisiw');

  // Fix obscure or overly deep Tagalog translations
  cleaned = cleaned.replace(/\bpalaalaman\b/gi, 'settings');
  cleaned = cleaned.replace(/\btalaan\b/gi, 'logs');
  cleaned = cleaned.replace(/\bpalaisdaan\b/gi, 'farm');

  return cleaned;
}

// ─── Cache helpers ────────────────────────────────────────────────────────────

function getCacheKey(targetCode: string, text: string): string {
  return `gt_v2_${targetCode}_${encodeURIComponent(text.trim().toLowerCase())}`;
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

// ─── MyMemory Free Public Translator (Zero API key needed) ───────────────────

async function translateWithMyMemory(text: string, targetLang: string): Promise<string | null> {
  try {
    const langPair = targetLang === 'fil' || targetLang === 'tl' ? 'en|tl' : `en|${targetLang}`;
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(text)}&langpair=${langPair}`;
    const res = await fetch(url).catch(() => null);
    if (res && res.ok) {
      const data = await res.json().catch(() => null);
      const translated = data?.responseData?.translatedText;
      if (translated && typeof translated === 'string' && !translated.includes('MYMEMORY WARNING')) {
        return translated.trim();
      }
    }
  } catch {}
  return null;
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

      // 1. Check Offline Built-in Tagalog Dictionary (Instant, offline, zero API call)
      const lower = trimmed.toLowerCase();
      if (FILIPINO_DICTIONARY[lower]) {
        let dictResult = FILIPINO_DICTIONARY[lower];
        if (trimmed.charAt(0) === trimmed.charAt(0).toUpperCase()) {
          dictResult = dictResult.charAt(0).toUpperCase() + dictResult.slice(1);
        }
        results[index] = dictResult;
        return;
      }

      // 2. Check AsyncStorage Cache
      const cached = await getCache(getCacheKey(targetCode, trimmed));
      if (cached) {
        results[index] = targetCode === 'tl' ? sanitizeFilipinoTranslation(cached) : cached;
      } else {
        indicesToFetch.push(index);
        textsToFetch.push(trimmed);
      }
    })
  );

  if (textsToFetch.length === 0) return results;

  // 3. Translate via Google Translate API if GOOGLE_API_KEY exists
  if (GOOGLE_API_KEY) {
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
        }).catch(() => null);

        if (response && response.ok) {
          const data = await response.json().catch(() => null);
          const translations: { translatedText: string }[] = data?.data?.translations || [];

          await Promise.all(
            chunkIndices.map(async (originalIndex, i) => {
              const originalText = texts[originalIndex];
              let translatedText = translations[i]?.translatedText || originalText;
              if (targetCode === 'tl' && typeof translatedText === 'string') {
                translatedText = sanitizeFilipinoTranslation(translatedText);
              }
              await setCache(getCacheKey(targetCode, originalText.trim()), translatedText);
              results[originalIndex] = translatedText;
            })
          );
          continue;
        }
      } catch {}
    }
  }

  // 4. Translate unhandled texts using free MyMemory API (zero API key needed)
  const unfetchedIndices = indicesToFetch.filter(i => results[i] === undefined);
  if (unfetchedIndices.length > 0) {
    await Promise.all(
      unfetchedIndices.map(async (originalIndex) => {
        const originalText = texts[originalIndex];
        let translated = await translateWithMyMemory(originalText, targetLang);
        if (translated) {
          if (targetCode === 'tl') {
            translated = sanitizeFilipinoTranslation(translated);
          }
          await setCache(getCacheKey(targetCode, originalText.trim()), translated);
          results[originalIndex] = translated;
        } else {
          results[originalIndex] = originalText;
        }
      })
    );
  }

  return results;
}
