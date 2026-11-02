import json

data = json.load(open('文献库/library.json', encoding='utf-8'))

def is_hc(name):
    return any(k in name for k in ['矫顽力', 'Hc'])

def is_bs(name):
    return any(k in name for k in ['Bs', 'Ms', 'Js', 'Is', '饱和磁化', '饱和磁感', '饱和磁极化', '饱和磁通'])

items = []
for p_idx, p in enumerate(data['papers']):
    for m in p.get('materials', []):
        meas = m.get('measurements', [])
        hc_meas = [x for x in meas if is_hc(x.get('name', ''))]
        bs_meas = [x for x in meas if is_bs(x.get('name', ''))]
        if hc_meas and bs_meas:
            items.append({
                'p_idx': p_idx + 1,
                'p_id': p['id'],
                'p_file': p.get('filename', ''),
                'p_title': p.get('title', ''),
                'm_id': m['id'],
                'm_name': m['name'],
                'comp': m['composition'],
                'hc': [(x['name'], x['value'], x['unit'], x.get('conditions','')) for x in hc_meas],
                'bs': [(x['name'], x['value'], x['unit'], x.get('conditions','')) for x in bs_meas]
            })

with open('scratch/both_hc_bs_summary.json', 'w', encoding='utf-8') as f:
    json.dump(items, f, ensure_ascii=False, indent=2)

print(f"Dumped {len(items)} materials with both Hc and Bs to scratch/both_hc_bs_summary.json")
