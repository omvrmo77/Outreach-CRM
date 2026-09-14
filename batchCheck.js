const cleanPrefix=(line='')=>line.replace(/^\s*(?:[-*•]+|\d+[.)-]?|batch\s*\d+[:.)-]?)\s*/i,'').trim();
const labelValue=(line,label)=>{
  const m=line.match(new RegExp(`^${label}\\s*:\\s*(.+)$`,'i'));
  return m?m[1].trim():'';
};

export const parseBatchCandidates=(text='')=>{
  const lines=String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean);
  const out=[];
  let current=null;
  const push=(company,contact='')=>{
    const c=cleanPrefix(company||'').trim();
    if(!c) return;
    out.push({company:c,contact:String(contact||'').trim()});
  };

  for(const raw of lines){
    const company=labelValue(raw,'(?:Company Name|Company)');
    if(company){ current={company,contact:''}; out.push(current); continue; }
    const contact=labelValue(raw,'(?:Contact Person|Contact Name|Contact)');
    if(contact && current){ current.contact=contact; continue; }
    if(/^(?:contact role|role|why now|lfg angle|status|website|notes?)\s*:/i.test(raw)) continue;
    const line=cleanPrefix(raw);
    if(!line) continue;
    const parts=line.split(/\s*[|]\s*/);
    if(parts.length>=2){ push(parts[0],parts[1]); current=out[out.length-1]||null; continue; }
    if(/^[A-Za-z][^:]{0,120}$/.test(line) || /[^\x00-\x7F]/.test(line)){
      push(line); current=out[out.length-1]||null;
    }
  }
  return out.slice(0,100);
};

export const batchCheckSummary=(rows=[])=>({
  total:rows.length,
  clear:rows.filter(x=>x.status==='clear').length,
  duplicate:rows.filter(x=>x.status==='duplicate').length,
  review:rows.filter(x=>x.status==='review').length,
  batchDuplicate:rows.filter(x=>x.status==='batch-duplicate').length,
  invalid:rows.filter(x=>x.status==='invalid').length
});
