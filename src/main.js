import worker from './index.js';

function normText(v){
  return String(v??'').normalize('NFD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,' ').trim();
}
function canonicalContract(name){
  const s=normText(name);
  if(s==='adega'||s==='adega farret'||s.startsWith('adega ')) return 'Adega';
  if(s==='china box'||s==='china in box'||s==='china p negra'||s==='china ponta negra'||s==='china tirol') return 'China In Box';
  if(s.startsWith('reis magos')) return 'Reis Magos';
  if(s==='recruta'||s==='recruta sushi') return 'Recruta Sushi';
  return String(name??'').trim();
}
function normalizeSnapshot(payload){
  if(!payload||typeof payload!=='object') return payload;
  const contracts=Array.isArray(payload.contracts)?payload.contracts:[];
  const productions=Array.isArray(payload.productions)?payload.productions:[];
  const canonId=new Map();
  const oldToCanon=new Map();
  const cleanContracts=[];
  for(const c of contracts){
    const name=canonicalContract(c.nome||c.name||'Contrato');
    const key=normText(name);
    if(!canonId.has(key)){
      canonId.set(key,c.id);
      cleanContracts.push({...c,nome:name,name:name});
    }
    oldToCanon.set(String(c.id),canonId.get(key));
  }
  const merged=new Map();
  for(const p of productions){
    const cid=oldToCanon.get(String(p.contract_id))??p.contract_id;
    const key=[p.period_id,p.week,p.cooperado_id,cid].join('|');
    const prev=merged.get(key);
    if(prev) prev.amount=Number(prev.amount||0)+Number(p.amount||0);
    else merged.set(key,{...p,contract_id:cid,amount:Number(p.amount||0)});
  }
  return {...payload,contracts:cleanContracts,productions:[...merged.values()]};
}

export default {
  async fetch(request,env,ctx){
    const url=new URL(request.url);
    if(url.pathname==='/api/sync/push'&&request.method==='POST'){
      try{
        const body=await request.clone().json();
        if(Array.isArray(body.events)){
          body.events=body.events.map(ev=>ev?.entity==='period'&&ev?.action==='snapshot'
            ? {...ev,payload:normalizeSnapshot(ev.payload)}:ev);
          request=new Request(request,{body:JSON.stringify(body),headers:new Headers(request.headers)});
          request.headers.set('content-type','application/json');
        }
      }catch{}
    }
    return worker.fetch(request,env,ctx);
  }
};
