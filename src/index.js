const JSON_HEADERS={"content-type":"application/json; charset=utf-8"};
function json(data,status=200){return new Response(JSON.stringify(data),{status,headers:JSON_HEADERS})}
function html(body,status=200){return new Response(body,{status,headers:{"content-type":"text/html; charset=utf-8"}})}
function digits(v){return String(v??"").replace(/\D/g,"")}
async function sha256(value){const h=await crypto.subtle.digest("SHA-256",new TextEncoder().encode(value));return [...new Uint8Array(h)].map(b=>b.toString(16).padStart(2,"0")).join("")}
function b64e(text){const bytes=new TextEncoder().encode(text);let s="";for(const b of bytes)s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
function b64d(text){text=text.replace(/-/g,"+").replace(/_/g,"/");while(text.length%4)text+="=";const s=atob(text),bytes=Uint8Array.from(s,c=>c.charCodeAt(0));return new TextDecoder().decode(bytes)}
async function hmac(secret,text){const key=await crypto.subtle.importKey("raw",new TextEncoder().encode(secret),{name:"HMAC",hash:"SHA-256"},false,["sign"]);const sig=await crypto.subtle.sign("HMAC",key,new TextEncoder().encode(text));let s="";for(const b of new Uint8Array(sig))s+=String.fromCharCode(b);return btoa(s).replace(/\+/g,"-").replace(/\//g,"_").replace(/=+$/g,"")}
async function makeToken(secret,key){const p=b64e(JSON.stringify({k:key,exp:Date.now()+12*60*60*1000}));return p+"."+await hmac(secret,p)}
async function verifyToken(secret,token){if(!token||!token.includes("."))return null;const [p,s]=token.split(".");if(await hmac(secret,p)!==s)return null;try{const d=JSON.parse(b64d(p));return d.k&&d.exp>Date.now()?d:null}catch{return null}}
function cloudAuth(req,env){return !!env.CLOUD_API_TOKEN&&req.headers.get("authorization")==="Bearer "+env.CLOUD_API_TOKEN}

async function applySnapshot(env,payload){
  const coops=payload.cooperados||[],prods=payload.productions||[],discounts=payload.discount_entries||[],contracts=payload.contracts||[];
  const period=payload.period||{},cm={};for(const c of contracts)cm[String(c.id)]=c.nome;
  for(const cp of coops){
    const matricula=String(cp.matricula||"").trim();
    const pin=digits(matricula).slice(0,4);
    if(!matricula||pin.length!==4)continue;
    const memberProd=prods.filter(p=>Number(p.cooperado_id)===Number(cp.id)).map(p=>({...p,contract_name:cm[String(p.contract_id)]||"Contrato"}));
    const memberDisc=discounts.filter(d=>Number(d.cooperado_id)===Number(cp.id));
    const payloadJson=JSON.stringify({period,productions:memberProd,discount_entries:memberDisc,updated_at:new Date().toISOString()});
    const pinHash=await sha256(pin);
    await env.DB.prepare(`INSERT INTO portal_members(member_key,matricula,nome,pin_hash,payload,updated_at)
      VALUES(?,?,?,?,?,CURRENT_TIMESTAMP)
      ON CONFLICT(member_key) DO UPDATE SET matricula=excluded.matricula,nome=excluded.nome,
      pin_hash=excluded.pin_hash,payload=excluded.payload,updated_at=CURRENT_TIMESTAMP`)
      .bind(matricula,matricula,cp.nome||"",pinHash,payloadJson).run();
  }
}

const PORTAL=`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><title>Meu Borderô</title><style>
:root{--b:#06479f;--bg:#f4f7fb;--l:#d7e1ec;--t:#12243d;--m:#68778b;--g:#08763f}*{box-sizing:border-box}body{margin:0;background:var(--bg);font-family:Segoe UI,Arial,sans-serif;color:var(--t)}.top{position:sticky;top:0;background:linear-gradient(90deg,#063a83,#0b56ba);color:#fff;padding:12px 14px}.wrap{width:min(100%,760px);margin:auto;padding:10px}.card{background:#fff;border:1px solid var(--l);border-radius:12px;padding:13px;margin-bottom:10px}.muted{color:var(--m);font-size:13px}h2{margin:0;color:#0b315f;font-size:18px}input,select{width:100%;height:44px;border:1px solid #bdcbda;border-radius:8px;padding:0 11px;font-size:16px;background:#fff}.field{margin-top:12px}button{border:0;border-radius:8px;background:#0c5fd4;color:#fff;font-weight:700;padding:10px 14px;font-size:14px}.login button{width:100%;margin-top:10px;height:44px}.error{margin-top:9px;color:#b42318;font-weight:600}.member{display:flex;justify-content:space-between;gap:10px}.period{display:inline-block;background:#0b56ba;color:#fff;border-radius:999px;padding:5px 8px;font-size:12px;font-weight:700}.week{font-size:18px;font-weight:900;color:#0a459f;margin:8px 0}.section{font-size:12px;text-transform:uppercase;font-weight:800;color:#284b75;margin:13px 0 6px}.rows{border:1px solid var(--l);border-radius:9px;overflow:hidden}.row{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:10px;padding:9px 10px;border-bottom:1px solid var(--l)}.row:last-child{border-bottom:0}.value{text-align:right;white-space:nowrap}.total{font-weight:800;background:#eef5ff}.filters{display:grid;grid-template-columns:1fr 90px;gap:8px;margin-top:10px}@media(max-width:420px){.wrap{padding:8px}.card{padding:11px}.filters{grid-template-columns:1fr 80px}}</style></head><body><div class="top"><b>CONTROLE FINANCEIRO — MEU BORDERÔ</b></div><div class="wrap"><div id="login" class="card login"><h2>Acessar meu borderô</h2><div class="muted" style="margin-top:6px">Senha: os 4 primeiros números da matrícula.</div><div class="field"><input id="pin" maxlength="4" inputmode="numeric" placeholder="0000"></div><button onclick="entrar()">Entrar</button><div id="erro" class="error"></div></div><div id="area" style="display:none"><div class="card"><div class="member"><div><h2 id="nome"></h2><div id="mat" class="muted"></div></div><button onclick="sair()">Sair</button></div><div class="filters"><select id="periodo"></select><select id="semana" onchange="render()"><option value="">Todas</option><option>1S</option><option>2S</option><option>3S</option><option>4S</option><option>5S</option></select></div></div><div id="conteudo"></div></div></div><script>
let token="",dados=null;const R=v=>Number(v||0).toLocaleString("pt-BR",{style:"currency",currency:"BRL"});const E=s=>String(s??"").replace(/[&<>"']/g,m=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[m]));
async function entrar(){erro.textContent="";const r=await fetch("/api/portal/login",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({pin:pin.value})});const j=await r.json();if(!r.ok){erro.textContent=j.error||"Falha";return}token=j.token;const m=await fetch("/api/portal/me",{headers:{authorization:"Bearer "+token}});dados=await m.json();if(!m.ok){erro.textContent=dados.error||"Falha";return}login.style.display="none";area.style.display="block";nome.textContent=dados.nome;mat.textContent="Matrícula: "+dados.matricula;const p=dados.payload?.period||{};periodo.innerHTML='<option>'+E(p.label||"Período atual")+'</option>';render()}
function render(){const p=dados?.payload||{},prods=p.productions||[];const weeks=[...new Set(prods.map(x=>x.week))].filter(Boolean).sort();const target=semana.value?weeks.filter(w=>w===semana.value):weeks;let h="";for(const w of target){const rows=prods.filter(x=>x.week===w);let bruto=0;h+='<div class="card"><span class="period">'+E(p.period?.label||"")+'</span><div class="week">'+E(w)+'</div><div class="section">Produção</div><div class="rows">';for(const x of rows){bruto+=Number(x.amount||0);h+='<div class="row"><div>'+E(x.contract_name||"Contrato")+'</div><div class="value">'+R(x.amount)+'</div></div>'}h+='<div class="row total"><div>Bruto</div><div class="value">'+R(bruto)+'</div></div></div></div>'}conteudo.innerHTML=h||'<div class="card muted">Nenhum borderô disponível.</div>'}
function sair(){token="";dados=null;area.style.display="none";login.style.display="block";pin.value="";erro.textContent=""}
</script></body></html>`;

export default {async fetch(request,env){
  const url=new URL(request.url);
  if(url.pathname==="/health")return json({ok:true,worker:true,d1:!!env.DB});
  if(url.pathname==="/"||url.pathname==="/portal"){
    if(!env.DB)return html("<h1>Worker publicado com sucesso</h1><p>Agora vincule um banco D1 com o binding <b>DB</b> e aplique a migration 0001.sql.</p>");
    return html(PORTAL);
  }
  if(url.pathname==="/api/sync/push"&&request.method==="POST"){
    if(!cloudAuth(request,env))return json({error:"unauthorized"},401);
    if(!env.DB)return json({error:"D1 DB binding not configured"},503);
    const body=await request.json(),site=String(body.site_id||"unknown"),accepted=[];
    for(const ev of body.events||[]){const id=String(ev.event_id||"");if(!id)continue;const ex=await env.DB.prepare("SELECT event_id FROM sync_events WHERE event_id=?").bind(id).first();if(!ex){await env.DB.prepare("INSERT INTO sync_events(event_id,site_id,entity,action,payload,created_at,received_at) VALUES(?,?,?,?,?,?,CURRENT_TIMESTAMP)").bind(id,site,String(ev.entity||""),String(ev.action||""),JSON.stringify(ev.payload||{}),String(ev.created_at||new Date().toISOString())).run();if(ev.entity==="period"&&ev.action==="snapshot")await applySnapshot(env,ev.payload||{})}accepted.push(id)}
    return json({accepted});
  }
  if(url.pathname==="/api/sync/snapshot"&&request.method==="GET"){
    if(!cloudAuth(request,env))return json({error:"unauthorized"},401);
    if(!env.DB)return json({error:"D1 DB binding not configured"},503);
    const site=url.searchParams.get("site_id")||"";const r=await env.DB.prepare("SELECT event_id,entity,action,payload,created_at,received_at FROM sync_events WHERE site_id=? ORDER BY received_at DESC LIMIT 100").bind(site).all();return json({events:(r.results||[]).map(x=>({...x,payload:JSON.parse(x.payload||"{}")}))});
  }
  if(url.pathname==="/api/portal/login"&&request.method==="POST"){
    if(!env.DB)return json({error:"Portal ainda não configurado"},503);if(!env.CLOUD_API_TOKEN)return json({error:"CLOUD_API_TOKEN não configurado"},503);const body=await request.json(),pin=digits(body.pin).slice(0,4);if(pin.length!==4)return json({error:"Digite os 4 primeiros números da matrícula."},400);const ph=await sha256(pin),r=await env.DB.prepare("SELECT member_key FROM portal_members WHERE pin_hash=?").bind(ph).all();if((r.results||[]).length!==1)return json({error:"Senha não encontrada ou vinculada a mais de um cooperado."},401);return json({ok:true,token:await makeToken(env.CLOUD_API_TOKEN,r.results[0].member_key)});
  }
  if(url.pathname==="/api/portal/me"&&request.method==="GET"){
    if(!env.DB)return json({error:"Portal ainda não configurado"},503);if(!env.CLOUD_API_TOKEN)return json({error:"CLOUD_API_TOKEN não configurado"},503);const a=request.headers.get("authorization")||"",info=await verifyToken(env.CLOUD_API_TOKEN,a.startsWith("Bearer ")?a.slice(7):"");if(!info)return json({error:"Sessão inválida ou expirada."},401);const r=await env.DB.prepare("SELECT member_key,matricula,nome,payload,updated_at FROM portal_members WHERE member_key=?").bind(info.k).first();if(!r)return json({error:"Cooperado não encontrado."},404);return json({...r,payload:JSON.parse(r.payload||"{}")});
  }
  return json({error:"not_found"},404);
}};
