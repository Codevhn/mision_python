// Conservative conversion of simple LaTeX to Unicode, never inside code.
const symbols = {subseteq:'⊆',subset:'⊂',supseteq:'⊇',times:'×',cdot:'·',dots:'…',ldots:'…',in:'∈',notin:'∉',leq:'≤',geq:'≥',neq:'≠',to:'→',infty:'∞'};
const alphabet = (from,to) => Object.fromEntries(Array.from(from).map((c,i)=>[c,Array.from(to)[i]]));
const sub = alphabet('0123456789+-=()aehijklmnoprstuvx','₀₁₂₃₄₅₆₇₈₉₊₋₌₍₎ₐₑₕᵢⱼₖₗₘₙₒₚᵣₛₜᵤᵥₓ');
const sup = alphabet('0123456789+-=()in','⁰¹²³⁴⁵⁶⁷⁸⁹⁺⁻⁼⁽⁾ⁱⁿ');
export function readableMath(markdown) {
  const convert = raw => {
    if(raw.startsWith('`')) return raw;
    let body=raw.slice(2,-2).trim().replace(/\\([a-zA-Z]+)/g,(m,name)=>symbols[name]||m);
    body=body.replace(/([_^])(?:\{([^{}]+)\}|([a-zA-Z0-9]))/g,(m,kind,group,single)=>{
      const letters=Array.from(group||single), map=kind==='_'?sub:sup;
      return letters.every(c=>map[c])?letters.map(c=>map[c]).join(''):m;
    });
    return /[\\_^{}]/.test(body)?raw:body.replace(/\s+/g,' ');
  };
  const result=[],prose=[];let fence=null;
  const flush=()=>{result.push(prose.join('').replace(/`+[^`\n]*`+|\\\([\s\S]*?\\\)|\\\[[\s\S]*?\\\]|\$\$[\s\S]*?\$\$/g,convert));prose.length=0;};
  for(const line of markdown.match(/[^\n]*\n|[^\n]+$/g)||[]) {
    const marker=line.match(/^ {0,3}(`{3,}|~{3,})/);
    if(marker){flush();if(!fence)fence=marker[1];else if(marker[1][0]===fence[0]&&marker[1].length>=fence.length)fence=null;result.push(line);}
    else if(fence||/^(    |\t)/.test(line)){flush();result.push(line);}
    else prose.push(line);
  }
  flush();return result.join('');
}
