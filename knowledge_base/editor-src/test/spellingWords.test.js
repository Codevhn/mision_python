import assert from 'node:assert/strict';
import fs from 'node:fs';
import nspell from 'nspell';
import {wordRanges,suggestionsFor,createSpellingDictionary,editDistance,isRomanNumeral} from '../src/spellingWords.js';
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
// Production scopes each dictionary to the language chosen for the paragraph.
const spanishOnly=createSpellingDictionary(spell),englishOnly=createSpellingDictionary(english);
assert.equal(spanishOnly.correct('aver'),false,'English dictionary must not hide a Spanish error');
assert.deepEqual(suggestionsFor(englishOnly,'librery'),['library']);
assert.ok(!suggestionsFor(spanishOnly,'abjeto').includes('abject'));
assert.equal(spanishOnly.correct('a\u0301rbol'),true,'NFD and NFC spelling are equivalent');
assert.deepEqual(suggestionsFor(spanishOnly,'a\u0301rbol'),[]);
assert.deepEqual(suggestionsFor(spanishOnly,'árbol'),[]);
console.log('PASS: language isolation, English correction ranking and NFC/NFD equivalence.');
for(const word of ['JVM','JDBC','JPA','Spring','Boot','Hibernate','REST','streaming','Microservicios','Cloud','native','CI','CD'])assert.equal(spanishOnly.correct(word),true,word);
assert.equal(spanishOnly.correct('ABJETO'),false,'Ordinary uppercase typos must still be detected');
console.log('PASS: Java/framework and architecture vocabulary without suppressing uppercase misspellings.');

for(const number of ['IV','V','VI','VII','XXIII','MCMXCIX'])assert.equal(isRomanNumeral(number),true,number);
for(const word of ['IIV','IM','JVM','CDIXX','incorrecto','ABJETO'])assert.equal(isRomanNumeral(word),false,word);
