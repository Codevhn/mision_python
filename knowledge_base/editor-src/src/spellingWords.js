/* Rank comparable Hunspell candidates without changing the user's text. */
export function suggestionsFor(spell, word) {
  const candidates = spell.suggest(word).slice(0, 12);
  return candidates.map((text, index) => ({text, index, score:Math.abs(text.length-word.length)}))
    .sort((a,b)=>a.score-b.score||a.index-b.index).slice(0,6).map(item=>item.text);
}
export function wordRanges(text) {
  return [...text.matchAll(/[\p{L}\p{M}]+(?:['’][\p{L}\p{M}]+)*/gu)].map(match=>({word:match[0],offset:match.index}));
}
