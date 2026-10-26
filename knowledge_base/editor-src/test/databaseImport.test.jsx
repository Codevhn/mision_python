import assert from 'node:assert/strict';
import React from 'react';
import {renderToStaticMarkup} from 'react-dom/server';
import {ImportReport} from '../src/databaseImport.jsx';
const html=renderToStaticMarkup(<ImportReport report={{counts:{ready:1,invalid:1,duplicate_in_trash:1},rows:[
  {row:1,drive_id:'synthetic_drive_001',status:'ready'},
  {row:2,status:'invalid',error:'Número inválido <script>alert(1)</script>'},
  {row:3,drive_id:'synthetic_drive_003',status:'duplicate_in_trash',record_id:'kept-record'}
]}}/>);
assert(html.includes('Listo: 1'));
assert(html.includes('En papelera · conservado'));
assert(html.includes('kept-record'));
assert(html.includes('&lt;script&gt;'));
assert(!html.includes('<script>'));
console.log('Import report: counts, row diagnostics, preserved-trash status and escaped source text passed');
