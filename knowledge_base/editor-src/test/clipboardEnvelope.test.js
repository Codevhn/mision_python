import assert from 'node:assert/strict';
import {cfHTMLFragment} from '../src/clipboardEnvelope.js';
const encode=value=>new TextEncoder().encode(value).length;
function envelope(prefix,fragment,suffix){
  const header='Version:0.9\r\nStartHTML:0000000000\r\nEndHTML:0000000000\r\nStartFragment:0000000000\r\nEndFragment:0000000000\r\n';
  const start=encode(header),end=start+encode(prefix+fragment+suffix);
  const positions={StartHTML:start,EndHTML:end,StartFragment:start+encode(prefix),EndFragment:start+encode(prefix+fragment)};
  return header.replace(/(StartHTML|EndHTML|StartFragment|EndFragment):0+/g,(_,key)=>key+':'+String(positions[key]).padStart(10,'0'))+prefix+fragment+suffix;
}
const fragment='<p>Conexión: código y <code>args[0]</code>.</p>';
assert.equal(cfHTMLFragment(envelope('<html><body><!-- ñ --><!--StartFragment-->',fragment,'<!--EndFragment--></body></html>')),fragment);
assert.equal(cfHTMLFragment(envelope('<html><body><!-- ñ -->',fragment,'</body></html>')),fragment,'UTF-8 byte offsets, not character positions');
assert.equal(cfHTMLFragment('Version:0.9 StartHTML:999 EndHTML:9999 StartFragment:-1 EndFragment:-1 <p>Rescate.</p>'),'<p>Rescate.</p>');
assert.equal(cfHTMLFragment('<p>Version:0.9 es texto literal.</p>'),null);
assert.equal(cfHTMLFragment('Version:0.9\nUna explicación sin cabecera CF_HTML.'),null);
console.log('PASS CF_HTML: transport headers, fragment markers, UTF-8 offsets and malformed-offset fallback');
