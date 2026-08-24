import os, json, hashlib
from datetime import datetime
from flask import Flask, request, jsonify, send_from_directory
from sqlalchemy import create_engine, text

app=Flask(__name__,static_folder="static")
DATABASE_URL=os.environ["DATABASE_URL"]
TOKEN=os.environ["CLOUD_API_TOKEN"]
engine=create_engine(DATABASE_URL,pool_pre_ping=True,future=True)

def auth():
    return request.headers.get("Authorization","")==f"Bearer {TOKEN}"

def init_db():
    ddl="""
    CREATE TABLE IF NOT EXISTS sync_events(
      event_id TEXT PRIMARY KEY,
      site_id TEXT NOT NULL,
      entity TEXT NOT NULL,
      action TEXT NOT NULL,
      payload JSONB NOT NULL,
      created_at TIMESTAMP NOT NULL,
      received_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    CREATE INDEX IF NOT EXISTS idx_sync_events_site_received ON sync_events(site_id,received_at DESC);

    CREATE TABLE IF NOT EXISTS portal_members(
      member_key TEXT PRIMARY KEY,
      matricula TEXT,
      nome TEXT NOT NULL,
      pin_hash TEXT,
      payload JSONB NOT NULL DEFAULT '{}'::jsonb,
      updated_at TIMESTAMP NOT NULL DEFAULT NOW()
    );
    """
    with engine.begin() as c:
        c.execute(text(ddl))

@app.get("/health")
def health():
    return {"ok":True}

@app.post("/api/sync/push")
def sync_push():
    if not auth():return jsonify({"error":"unauthorized"}),401
    d=request.get_json(force=True)
    site_id=str(d.get("site_id","unknown"))
    accepted=[]
    with engine.begin() as c:
        for ev in d.get("events",[]):
            eid=str(ev["event_id"])
            exists=c.execute(text("SELECT 1 FROM sync_events WHERE event_id=:e"),{"e":eid}).first()
            if not exists:
                c.execute(text("""INSERT INTO sync_events(event_id,site_id,entity,action,payload,created_at)
                                  VALUES(:event_id,:site_id,:entity,:action,CAST(:payload AS JSONB),:created_at)"""),
                          {"event_id":eid,"site_id":site_id,"entity":ev["entity"],"action":ev["action"],
                           "payload":json.dumps(ev["payload"],ensure_ascii=False),
                           "created_at":ev.get("created_at") or datetime.utcnow().isoformat()})
                if ev["entity"]=="period" and ev["action"]=="snapshot":
                    apply_snapshot(c,ev["payload"])
            accepted.append(eid)
    return {"accepted":accepted}

def apply_snapshot(c,payload):
    periods=payload.get("period",{})
    productions=payload.get("productions",[])
    discounts=payload.get("discount_entries",[])
    coops={x["id"]:x for x in payload.get("cooperados",[])}
    contracts={x["id"]:x for x in payload.get("contracts",[])}

    by_member={}
    for cid,cp in coops.items():
        matricula=str(cp.get("matricula") or "")
        digits="".join(ch for ch in matricula if ch.isdigit())
        pin=digits[:4] if len(digits)>=4 else ""
        key=matricula or f"id-{cid}"
        by_member[key]={"nome":cp.get("nome",""),"matricula":matricula,"pin":pin,"periods":[]}

    # One snapshot block for the period; portal payload is read-only.
    for key,m in by_member.items():
        cid=None
        for k,v in coops.items():
            if (str(v.get("matricula") or "") or f"id-{k}")==key:
                cid=k;break
        member_prod=[p for p in productions if p.get("cooperado_id")==cid]
        member_disc=[d for d in discounts if d.get("cooperado_id")==cid]
        block={
            "period":periods,
            "productions":member_prod,
            "discount_entries":member_disc,
            "contracts":contracts
        }
        pin_hash=hashlib.sha256(m["pin"].encode()).hexdigest() if m["pin"] else None
        c.execute(text("""INSERT INTO portal_members(member_key,matricula,nome,pin_hash,payload,updated_at)
                          VALUES(:k,:m,:n,:p,CAST(:payload AS JSONB),NOW())
                          ON CONFLICT(member_key) DO UPDATE SET matricula=EXCLUDED.matricula,
                          nome=EXCLUDED.nome,pin_hash=EXCLUDED.pin_hash,payload=EXCLUDED.payload,updated_at=NOW()"""),
                  {"k":key,"m":m["matricula"],"n":m["nome"],"p":pin_hash,
                   "payload":json.dumps(block,ensure_ascii=False)})

@app.get("/api/sync/snapshot")
def sync_snapshot():
    if not auth():return jsonify({"error":"unauthorized"}),401
    site_id=request.args.get("site_id","")
    with engine.begin() as c:
        rows=c.execute(text("""SELECT event_id,entity,action,payload,created_at,received_at
                               FROM sync_events WHERE site_id=:s ORDER BY received_at DESC LIMIT 100"""),{"s":site_id}).mappings().all()
    return {"events":[dict(r) for r in rows]}

@app.post("/api/portal/login")
def portal_login():
    pin="".join(ch for ch in str((request.get_json(force=True) or {}).get("pin","")) if ch.isdigit())[:4]
    if len(pin)!=4:return jsonify({"error":"Senha inválida"}),400
    h=hashlib.sha256(pin.encode()).hexdigest()
    with engine.begin() as c:
        rows=c.execute(text("SELECT member_key,matricula,nome FROM portal_members WHERE pin_hash=:h"),{"h":h}).mappings().all()
    if len(rows)!=1:
        return jsonify({"error":"Senha não encontrada ou duplicada"}),401
    return {"ok":True,"member_key":rows[0]["member_key"],"nome":rows[0]["nome"],"matricula":rows[0]["matricula"]}

@app.get("/api/portal/member/<member_key>")
def portal_member(member_key):
    with engine.begin() as c:
        r=c.execute(text("SELECT member_key,matricula,nome,payload,updated_at FROM portal_members WHERE member_key=:k"),{"k":member_key}).mappings().first()
    if not r:return jsonify({"error":"not found"}),404
    return dict(r)

@app.get("/")
def index():
    return send_from_directory("static","portal.html")

@app.get("/portal")
def portal():
    return send_from_directory("static","portal.html")

if __name__=="__main__":
    init_db()
    app.run(host="0.0.0.0",port=int(os.getenv("PORT","10000")))
