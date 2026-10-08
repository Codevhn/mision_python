import assert from 'node:assert/strict';
import fs from 'node:fs';
import nspell from 'nspell';
import {wordRanges,suggestionsFor,createSpellingDictionary,editDistance} from '../src/spellingWords.js';
const spell=nspell(fs.readFileSync('node_modules/dictionary-es/index.aff','utf8'),fs.readFileSync('node_modules/dictionary-es/index.dic','utf8'));
assert.equal(spell.correct('abjeto'),false);
assert.equal(spell.correct('objeto'),true);
assert.equal(suggestionsFor(spell,'abjeto')[0],'objeto');
assert.equal(suggestionsFor(spell,'incorecto')[0],'incorrecto');
assert.equal(suggestionsFor(spell,'prueva')[0],'prueba');
assert.deepEqual(wordRanges('😀 abjeto, árbol.'),[{word:'abjeto',offset:3},{word:'árbol',offset:11}]);
const english=nspell(fs.readFileSync('node_modules/dictionary-en/index.aff','utf8'),fs.readFileSync('node_modules/dictionary-en/index.dic','utf8'));
const bilingual=createSpellingDictionary(spell,english);
for (const word of ['REPL','PyCharm','Thonny','macOS','UTF','strings','debugging','objeto']) assert.equal(bilingual.correct(word),true,word);
for (const [wrong,right] of [['REPiL','REPL'],['Pychram','PyCharm'],['Thony','Thonny'],['incorecto','incorrecto'],['abjeto','objeto'],['debuging','debugging']]) {
  assert.equal(bilingual.correct(wrong),false,wrong);
  assert.equal(suggestionsFor(bilingual,wrong)[0],right,wrong);
}
assert.equal(editDistance('charm','chram'),1);
assert.deepEqual(suggestionsFor(bilingual,'zzqqxxzz'),[]);
assert.deepEqual(suggestionsFor(bilingual,'REPiL'),['REPL']);
assert.equal(suggestionsFor(bilingual,'Abjeto')[0],'Objeto');
assert.equal(suggestionsFor(bilingual,'INCORRECTO').includes('INCORRECTO'),false);
console.log('PASS: bilingual and technical vocabulary, typo ranking, distant-candidate filtering, casing and UTF-16 ranges.');
