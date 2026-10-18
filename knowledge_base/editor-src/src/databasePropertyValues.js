// The decimal draft stays text until it is valid; JSON must never turn NaN into null.
export function numberDraft(value) {
  if(value===''||value==null)return '';
  const raw=String(value).trim().replace(',','.');
  if(!raw)return '';
  if(!/^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(raw)||!Number.isFinite(Number(raw)))throw new Error('Número no válido. Usa un decimal finito.');
  return Number(raw);
}
export function dateParts(value) {
  const raw=typeof value==='string'?value:'';
  const match=/^(\d{4}-\d{2}-\d{2})(?:T(\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?)(Z|[+-]\d{2}:\d{2})?)?$/.exec(raw);
  return match?{day:match[1],time:match[2]||'',zone:match[3]||''}:{day:'',time:'',zone:'',original:raw};
}
export function dateWithTime(day,time,zone='') {return day?(time?day+'T'+time+zone:day):'';}
export function dateLabel(value,options={}) {
  if(isDateRange(value))return dateLabel(value.start,options)+' → '+dateLabel(value.end,options);
  const p=dateParts(value);if(!p.day)return value||'';
  const label=options.date_format==='iso'?p.day:new Date(p.day+'T12:00:00').toLocaleDateString('es',{year:'numeric',month:options.date_format==='long'?'long':'short',day:'numeric'});
  let time=p.time;
  if(time&&options.time_format==='12'){const hour=Number(time.slice(0,2));time=String(hour%12||12).padStart(2,'0')+time.slice(2)+(hour<12?' a. m.':' p. m.');}
  return label+(time?' '+time+(p.zone?' '+(p.zone==='Z'?'UTC':'UTC'+p.zone):''):'');
}

export function moveOption(options,index,delta) {
  const target=index+delta;if(index<0||index>=options.length||target<0||target>=options.length)return options;
  const next=[...options];const [option]=next.splice(index,1);next.splice(target,0,option);return next;
}

export const isDateRange=value=>!!value&&typeof value==='object'&&!Array.isArray(value)&&typeof value.start==='string'&&typeof value.end==='string';
export const dateStart=value=>isDateRange(value)?value.start:value;
export const dateEnd=value=>isDateRange(value)?value.end:value;
