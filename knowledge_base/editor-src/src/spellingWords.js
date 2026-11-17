import vocabulary from './technicalVocabulary.json';

const normalize = word => word.normalize('NFC').toLocaleLowerCase('es');
const technical = new Map(Object.values(vocabulary).flat().map(word => [normalize(word), word]));

// Damerau-Levenshtein includes insertion, deletion, substitution and adjacent swaps.
export function editDistance(left, right) {
  const a = [...normalize(left)], b = [...normalize(right)];
  const rows = Array.from({length:a.length + 1}, (_, i) => [i]);
  rows[0] = Array.from({length:b.length + 1}, (_, i) => i);
  for (let i = 1; i <= a.length; i++) for (let j = 1; j <= b.length; j++) {
    rows[i][j] = Math.min(rows[i-1][j]+1, rows[i][j-1]+1, rows[i-1][j-1]+(a[i-1] === b[j-1] ? 0 : 1));
    if (i > 1 && j > 1 && a[i-1] === b[j-2] && a[i-2] === b[j-1]) rows[i][j] = Math.min(rows[i][j], rows[i-2][j-2]+1);
  }
  return rows[a.length][b.length];
}

export function createSpellingDictionary(...dictionaries) {
  const correctCache=new Map(),suggestCache=new Map();
  const remember=(cache,key,value)=>{cache.set(key,value);if(cache.size>2000)cache.delete(cache.keys().next().value);return value;};
  return {
    correct(word){const key=word.normalize('NFC');return correctCache.has(key)?correctCache.get(key):remember(correctCache,key,technical.has(normalize(key))||dictionaries.some(dictionary=>dictionary.correct(key)));},
    suggest(word){const key=word.normalize('NFC');return suggestCache.has(key)?suggestCache.get(key):remember(suggestCache,key,[...technical.values(),...dictionaries.flatMap(dictionary=>dictionary.suggest(key))]);}
  };
}

export function suggestionsFor(spell, word) {
  word=word.normalize('NFC');
  if(spell.correct(word))return [];
  const normalized = normalize(word);
  const limit = word.length <= 5 ? 1 : 2;
  const candidates = new Map();
  for (const raw of spell.suggest(word)) {
    const key = normalize(raw);
    if (key === normalized || candidates.has(key) || !spell.correct(raw)) continue;
    const distance = editDistance(word, raw);
    if (distance > limit || distance / Math.max(word.length, raw.length) > .34) continue;
    // Technical names keep canonical spelling; ordinary words retain case.
    const ordinary = normalize(raw);
    const text = technical.get(key) || (word === word.toLocaleUpperCase('es') ? ordinary.toLocaleUpperCase('es') :
      /^[\p{Lu}]/u.test(word) ? ordinary[0].toLocaleUpperCase('es') + ordinary.slice(1) : ordinary);
    candidates.set(key, {text, distance, technical:technical.has(key), relativeDistance:distance/Math.max(word.length,raw.length), lengthDifference:Math.abs(raw.length-word.length), index:candidates.size});
  }
  const mixedCase = /[\p{Lu}]/u.test(word.slice(1)) && /[\p{Ll}]/u.test(word);
  const values = [...candidates.values()];
  const ranked = mixedCase && values.some(candidate => candidate.technical) ? values.filter(candidate => candidate.technical) : values;
  return ranked.sort((a,b) => a.distance-b.distance || Number(b.technical)-Number(a.technical) || a.relativeDistance-b.relativeDistance || a.lengthDifference-b.lengthDifference || a.index-b.index)
    .slice(0,6).map(candidate => candidate.text);
}
// Structural numbering is not prose; validate canonical Roman numerals rather
// than treating arbitrary uppercase words as acronyms and hiding their typos.
export function isRomanNumeral(word) {
  return /^[MDCLXVI]+$/.test(word) && /^(?=.)M{0,3}(CM|CD|D?C{0,3})(XC|XL|L?X{0,3})(IX|IV|V?I{0,3})$/.test(word);
}
export function wordRanges(text) {
  return [...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)].map(match=>({word:match[0],offset:match.index}));
}

// Recognition and candidate generation have different jobs: accept correctly
// spelled words from either language, but rank replacements in one language.
// The preferred language is only a tie-breaker, never a ban on foreign words.
export function createMultilingualSpelling(spanish, english) {
  const recognition=createSpellingDictionary(spanish,english);
  const es=createSpellingDictionary(spanish),en=createSpellingDictionary(english);
  const spanishConnectors=new Set('de el la los las del que para por con sin una unos unas este esta estos estas como'.split(' '));
  const englishConnectors=new Set('the with and from this that these those is are was were which where have has their your our of for to'.split(' '));
  function languageFor(text,preferred='auto') {
    let spanishWords=0,englishWords=0;
    for(const {word} of wordRanges(text)) {
      if(isRomanNumeral(word))continue;
      const lower=normalize(word);
      if(spanishConnectors.has(lower))spanishWords+=3;
      if(englishConnectors.has(lower))englishWords+=3;
      const a=es.correct(word),b=en.correct(word);
      if(a&&!b)spanishWords++;else if(b&&!a)englishWords++;
    }
    if(spanishWords>englishWords)return 'es';
    if(englishWords>spanishWords)return 'en-US';
    return preferred==='en-US'?'en-US':'es';
  }
  return {
    correct:recognition.correct,
    languageFor,
    candidatesFor(word,text,preferred='auto') {
      if(recognition.correct(word))return [];
      const primary=languageFor(text,preferred)==='es'?es:en;
      const candidates=suggestionsFor(primary,word),alternative=suggestionsFor(primary===es?en:es,word);
      // A clearly closer correction can belong to an embedded foreign word.
      // Keep a single language's list; ties follow the paragraph preference.
      if(alternative.length&&(!candidates.length||editDistance(word,alternative[0])<editDistance(word,candidates[0])))return alternative;
      return candidates;
    },
  };
}
