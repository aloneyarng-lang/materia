import json

data = json.load(open('文献库/library.json', encoding='utf-8'))

def is_hc(name):
    return any(k in name for k in ['矫顽力', 'Hc'])

def is_bs(name):
    return any(k in name for k in ['Bs', 'Ms', 'Js', 'Is', '饱和磁化', '饱和磁感', '饱和磁极化', '饱和磁通'])

materials_with_both = []

for p in data['papers']:
    for m in p.get('materials', []):
        meas = m.get('measurements', [])
        hc_meas = [meas_i for meas_i in meas if is_hc(meas_i.get('name', ''))]
        bs_meas = [meas_i for meas_i in meas if is_bs(meas_i.get('name', ''))]
        
        if hc_meas and bs_meas:
            materials_with_both.append({
                'paper_id': p['id'],
                'paper_title': p['title'],
                'mat_id': m['id'],
                'mat_name': m['name'],
                'composition': m['composition'],
                'hc': [f"{x['name']}={x['value']} {x['unit']} ({x.get('conditions','')})" for x in hc_meas],
                'bs': [f"{x['name']}={x['value']} {x['unit']} ({x.get('conditions','')})" for x in bs_meas]
            })

print(f"Total materials with BOTH Hc and Bs: {len(materials_with_both)}")
for idx, item in enumerate(materials_with_both, 1):
    print(f"\n[{idx}] Paper {item['paper_id']}: {item['mat_id']} | {item['mat_name']} ({item['composition']})")
    print(f"    Hc: {item['hc']}")
    print(f"    Bs: {item['bs']}")
