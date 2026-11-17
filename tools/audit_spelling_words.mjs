// Diagnostic corpus against production candidate ranking and real dictionaries.
// Run: knowledge_base/editor-src/node_modules/.bin/vite-node tools/audit_spelling_words.mjs
import fs from 'node:fs';
import {createRequire} from 'node:module';
import {fileURLToPath} from 'node:url';
import {createSpellingDictionary,suggestionsFor,wordRanges} from '../knowledge_base/editor-src/src/spellingWords.js';
const require=createRequire(new URL('../knowledge_base/editor-src/package.json',import.meta.url));
const nspell=require('nspell');
const dictionary=language=>nspell(...['aff','dic'].map(ext=>fs.readFileSync(fileURLToPath(new URL(`../knowledge_base/editor-src/node_modules/dictionary-${language}/index.${ext}`,import.meta.url)),'utf8')));
const es=dictionary('es'),en=dictionary('en'),both=createSpellingDictionary(es,en);
const words=['Hécate','canalizador','abjeto','reciept','librery','prueva','mas','esta','conosimiento','árbol','a\u0301rbol','alomejor','aver','REPiL'];
console.log(JSON.stringify({words:words.map(word=>({word,spanish:es.correct(word),english:en.correct(word),accepted:both.correct(word),suggestions:suggestionsFor(both,word)})),segmentation:wordRanges('UTF-8 PyCharm árbol a\u0301rbol foo_bar')},null,2));
