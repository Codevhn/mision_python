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
  return {
    correct: word => technical.has(normalize(word)) || dictionaries.some(dictionary => dictionary.correct(word)),
    suggest: word => [...technical.values(), ...dictionaries.flatMap(dictionary => dictionary.suggest(word))]
  };
}

export function suggestionsFor(spell, word) {
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
export function wordRanges(text) {
  return [...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)].map(match=>({word:match[0],offset:match.index}));
}
