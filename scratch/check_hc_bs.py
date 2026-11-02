import csv
import json

data = json.load(open('文献库/library.json', encoding='utf-8'))
mat_map = {}
for p in data['papers']:
    for m in p.get('materials', []):
        mat_map[m['id']] = (p, m)

def is_hc(name):
    return any(k in name for k in ['矫顽力', 'Hc'])

def is_bs(name):
    return any(k in name for k in ['Bs', 'Ms', 'Js', 'Is', '饱和磁化', '饱和磁感', '饱和磁极化', '饱和磁通'])

with open('文献库/材料四组归类清单.csv', encoding='utf-8-sig') as f:
    reader = csv.DictReader(f)
    rows = list(reader)

print(f"Total rows in 归类清单: {len(rows)}")

groups_stat = {}
for r in rows:
    gid = r['分组']
    mid = r['材料ID']
    mname = r['材料']
    comp = r['成分']
    
    if mid not in mat_map:
        print(f"Warning: {mid} not in library.json!")
        continue
    
    p, m = mat_map[mid]
    meas_names = [meas.get('name', '') for meas in m.get('measurements', [])]
    has_hc = any(is_hc(n) for n in meas_names)
    has_bs = any(is_bs(n) for n in meas_names)
    
    hc_val = [f"{meas['name']}={meas['value']}{meas['unit']}" for meas in m.get('measurements', []) if is_hc(meas['name'])]
    bs_val = [f"{meas['name']}={meas['value']}{meas['unit']}" for meas in m.get('measurements', []) if is_bs(meas['name'])]
    
    groups_stat.setdefault(gid, []).append({
        'mid': mid,
        'mname': mname,
        'comp': comp,
        'has_hc': has_hc,
        'has_bs': has_bs,
        'hc_val': hc_val,
        'bs_val': bs_val,
        'paper_id': p['id']
    })

for gid, items in groups_stat.items():
    print(f"\n=== 组别: {gid} (共 {len(items)} 条) ===")
    for it in items:
        status = '✓ BOTH' if (it['has_hc'] and it['has_bs']) else ('✗ NO Hc' if not it['has_hc'] else '✗ NO Bs')
        print(f"[{status}] {it['mid']}: {it['mname']} ({it['comp']})")
        print(f"    Hc: {it['hc_val']}")
        print(f"    Bs: {it['bs_val']}")
