/**
 * Martin Porter Stemming Algorithm
 *
 * Provides exact parity with SQLite FTS5 'porter' tokenizer stemmer.
 * Reduces words like 'repository' -> 'repositori', 'connecting' -> 'connect', etc.
 */

const step2list: Record<string, string> = {
  ational: 'ate',
  tional: 'tion',
  enci: 'ence',
  anci: 'ance',
  izer: 'ize',
  bli: 'ble',
  alli: 'al',
  entli: 'ent',
  eli: 'e',
  ousli: 'ous',
  ization: 'ize',
  ation: 'ate',
  ator: 'ate',
  alism: 'al',
  iveness: 'ive',
  fulness: 'ful',
  ousness: 'ous',
  aliti: 'al',
  iviti: 'ive',
  biliti: 'ble',
  logi: 'log',
};

const step3list: Record<string, string> = {
  icate: 'ic',
  ative: '',
  alize: 'al',
  iciti: 'ic',
  ical: 'ic',
  ful: '',
  ness: '',
};

const c = '[^aeiou]'; // consonant
const v = '[aeiouy]'; // vowel
const C = c + '[^aeiouy]*'; // consonant sequence
const V = v + '[aeiou]*'; // vowel sequence

const mgr0 = new RegExp('^(' + C + ')?' + V + C); // [C]VC... is m>0
const meq1 = new RegExp('^(' + C + ')?' + V + C + '(' + V + ')?$'); // [C]VC[V] is m=1
const mgr1 = new RegExp('^(' + C + ')?' + V + C + V + C); // [C]VCVC... is m>1
const s_v = new RegExp('^(' + C + ')?' + v); // vowel in stem

const stemCache = new Map<string, string>();
const MAX_STEM_CACHE = 10000;

export function stemWord(w: string): string {
  if (w.length < 3) return w;

  const cached = stemCache.get(w);
  if (cached !== undefined) return cached;

  let stem: string;
  let suffix: string;
  let firstch: string;
  let orig = w;

  firstch = w.slice(0, 1);
  if (firstch === 'y') {
    w = 'Y' + w.slice(1);
  }

  // Step 1a
  let re = /^(.+?)(ss|i)es$/;
  let re2 = /^(.+?)([^s])s$/;

  if (re.test(w)) {
    w = w.replace(re, '$1$2');
  } else if (re2.test(w)) {
    w = w.replace(re2, '$1$2');
  }

  // Step 1b
  re = /^(.+?)eed$/;
  re2 = /^(.+?)(ed|ing)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    re = mgr0;
    if (fp && re.test(fp[1])) {
      re = /.$/;
      w = w.replace(re, '');
    }
  } else if (re2.test(w)) {
    const fp = re2.exec(w);
    if (fp) {
      stem = fp[1];
      re2 = s_v;
      if (re2.test(stem)) {
        w = stem;
        re2 = /(at|bl|iz)$/;
        const re3 = new RegExp('([^aeiouylsz])\\1$');
        const re4 = new RegExp('^' + C + v + '[^aeiouwxy]$');
        if (re2.test(w)) {
          w = w + 'e';
        } else if (re3.test(w)) {
          re = /.$/;
          w = w.replace(re, '');
        } else if (re4.test(w)) {
          w = w + 'e';
        }
      }
    }
  }

  // Step 1c
  re = /^(.+?)y$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (fp) {
      stem = fp[1];
      re = s_v;
      if (re.test(stem)) {
        w = stem + 'i';
      }
    }
  }

  // Step 2
  re =
    /^(.+?)(ational|tional|enci|anci|izer|bli|alli|entli|eli|ousli|ization|ation|ator|alism|iveness|fulness|ousness|aliti|iviti|biliti|logi)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (fp) {
      stem = fp[1];
      suffix = fp[2];
      re = mgr0;
      if (re.test(stem)) {
        w = stem + step2list[suffix];
      }
    }
  }

  // Step 3
  re = /^(.+?)(icate|ative|alize|iciti|ical|ful|ness)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (fp) {
      stem = fp[1];
      suffix = fp[2];
      re = mgr0;
      if (re.test(stem)) {
        w = stem + step3list[suffix];
      }
    }
  }

  // Step 4
  re = /^(.+?)(al|ance|ence|er|ic|able|ible|ant|ement|ment|ent|ou|ism|ate|iti|ous|ive|ize)$/;
  re2 = /^(.+?)(s|t)(ion)$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (fp) {
      stem = fp[1];
      re = mgr1;
      if (re.test(stem)) {
        w = stem;
      }
    }
  } else if (re2.test(w)) {
    const fp = re2.exec(w);
    if (fp) {
      stem = fp[1] + fp[2];
      re2 = mgr1;
      if (re2.test(stem)) {
        w = stem;
      }
    }
  }

  // Step 5
  re = /^(.+?)e$/;
  if (re.test(w)) {
    const fp = re.exec(w);
    if (fp) {
      stem = fp[1];
      re = mgr1;
      re2 = meq1;
      const re3 = new RegExp('^' + C + v + '[^aeiouwxy]$');
      if (re.test(stem) || (re2.test(stem) && !re3.test(stem))) {
        w = stem;
      }
    }
  }

  re = /ll$/;
  re2 = mgr1;
  if (re.test(w) && re2.test(w)) {
    re = /.$/;
    w = w.replace(re, '');
  }

  if (firstch === 'y') {
    w = 'y' + w.slice(1);
  }

  if (stemCache.size < MAX_STEM_CACHE) {
    stemCache.set(orig, w);
  }

  return w;
}

/**
 * Tokenize string applying unicode61 normalization and porter stemming.
 */
export function tokenizeFts5(text: string): { original: string[]; stemmed: string[] } {
  if (!text) return { original: [], stemmed: [] };

  const rawTokens = text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '') // remove diacritics (unicode61 remove_diacritics)
    .replace(/[^a-z0-9@_.-]+/g, ' ')
    .split(/\s+/)
    .filter((t) => t.length > 0);

  const stemmed = rawTokens.map((t) => stemWord(t));
  return { original: rawTokens, stemmed };
}
