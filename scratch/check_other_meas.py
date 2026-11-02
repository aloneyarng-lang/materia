import json

data = json.load(open('文献库/library.json', encoding='utf-8'))
for p in data['papers']:
    for m in p.get('materials', []):
        meas_names = [meas['name'] for meas in m.get('measurements', [])]
        for name in meas_names:
            if any(k in name for k in ['Hc', '矫顽', 'Bs', 'Ms', 'Js', 'Is']):
                pass
            elif any(k in name for k in ['饱和', '剩磁', '磁感', '磁化']):
                print(f"{p['id'][:15]} | {m['id'][:25]} | {name}")
