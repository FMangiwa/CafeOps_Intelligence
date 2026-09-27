from __future__ import annotations
import argparse, json, os, sys, time
from pathlib import Path
from typing import Any
import requests
from dotenv import load_dotenv
from openpyxl import load_workbook


def clean(v: Any):
    if hasattr(v, 'isoformat'): return v.isoformat()
    if isinstance(v, str):
        v=v.strip(); return v if v else None
    return v

def load_config(path: Path):
    cfg=json.loads(path.read_text(encoding='utf-8'))
    if not isinstance(cfg.get('sheets'), list): raise ValueError("Mapping must contain a 'sheets' list.")
    return cfg

def records_from_sheet(ws, mapping):
    rows=ws.iter_rows(values_only=True)
    try: headers=[str(x).strip() if x is not None else '' for x in next(rows)]
    except StopIteration: return [], []
    colmap=mapping.get('columns', {})
    required=mapping.get('required_headers', list(colmap))
    missing=[h for h in required if h not in headers]
    if missing: raise ValueError(f"{mapping.get('sheet')}: missing required headers: {missing}")
    out=[]
    for row in rows:
        if mapping.get('skip_empty_rows', True) and all(x is None or str(x).strip()=='' for x in row): continue
        obj={}
        for src,dst in colmap.items():
            obj[dst]=clean(row[headers.index(src)] if headers.index(src)<len(row) else None)
        for k,v in mapping.get('defaults', {}).items():
            if k == 'metric_name_from_key':
                key=obj.get('metric_key')
                if key: obj['metric_name']=str(key).replace('_',' ').title()
            elif k not in obj or obj[k] is None: obj[k]=v
        out.append(obj)
    return out, []

def delete_all(session, base, mapping):
    # Delete known FK dependents that are not part of the workbook mapping first.
    # organizations is referenced by user_profiles, so user_profiles must be cleared
    # before organizations can be reset.
    prerequisite_tables = [
        ('user_profiles', 'user_id'),
    ]
    for table, key in prerequisite_tables:
        url = f'{base}/rest/v1/{table}'
        r = session.delete(url, params={key: 'not.is.null'}, timeout=60)
        if not r.ok and r.status_code != 404:
            raise RuntimeError(
                f'[{table}] reset failed HTTP {r.status_code}: {r.text[:1000]}'
            )
        print(f'[{table}] reset OK')

    # Delete mapped children first, then parents.
    for m in reversed(mapping['sheets']):
        table=m['table']; cols=list(m.get('columns', {}).values())
        if not cols:
            print(f'[{table}] SKIP RESET: no mapped columns')
            continue
        key=cols[0]
        url=f'{base}/rest/v1/{table}'
        r=session.delete(url, params={key:'not.is.null'}, timeout=60)
        if not r.ok:
            raise RuntimeError(
                f'[{table}] reset failed HTTP {r.status_code}: {r.text[:1000]}'
            )
        print(f'[{table}] reset OK')
        time.sleep(.05)

def seed(session, base, wb, cfg, batch):
    total=0
    for m in cfg['sheets']:
        rows,_=records_from_sheet(wb[m['sheet']],m)
        table=m['table']; total += len(rows)
        if not rows: continue
        params={}
        if m.get('mode','upsert')=='upsert':
            params['on_conflict']=','.join(m['conflict_columns'])
        session.headers['Prefer']='resolution=merge-duplicates,return=minimal'
        for i in range(0,len(rows),batch):
            chunk=rows[i:i+batch]
            r=session.post(f'{base}/rest/v1/{table}',params=params,json=chunk,timeout=60)
            if not r.ok:
                raise RuntimeError(f'[{table}] seed failed batch {i//batch+1}: HTTP {r.status_code}: {r.text[:1200]}')
        print(f'[{table}] seeded {len(rows)} rows')
    return total

def main():
    ap=argparse.ArgumentParser()
    ap.add_argument('--workbook',required=True)
    ap.add_argument('--mapping',default='config/seed_mapping.json')
    ap.add_argument('--reset',action='store_true',help='DELETE all mapped rows before seeding')
    args=ap.parse_args(); load_dotenv()
    base=os.getenv('SUPABASE_URL','').rstrip('/'); key=os.getenv('SUPABASE_SERVICE_ROLE_KEY','')
    if not base.startswith('https://') or not key or key.startswith('sb_publishable_'):
        print('ERROR: valid server-side SUPABASE_SERVICE_ROLE_KEY required'); return 2
    wb=load_workbook(args.workbook,read_only=True,data_only=True)
    cfg=load_config(Path(args.mapping))
    s=requests.Session(); s.headers.update({'apikey':key,'Authorization':f'Bearer {key}','Content-Type':'application/json'})
    if args.reset: delete_all(s,base,cfg)
    total=seed(s,base,wb,cfg,int(cfg.get('batch_size',250)))
    wb.close(); print(f'SUCCESS: {total} workbook rows seeded')

if __name__=='__main__': sys.exit(main())
