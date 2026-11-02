import json

data = json.load(open('文献库/library.json', encoding='utf-8'))

print("--- Papers 41 to 46 ---")
for idx, p in enumerate(data['papers']):
    fn = p.get('filename', '')
    title = p.get('title', '')
    # Check if paper index is 40-45 (1-based 41 to 46) or matches filename
    if idx >= 40 or any(k in fn for k in ['41', '42', '43', '44', '45', '46']):
        print(f"\n[{idx+1}] {p['id']}: {title}")
        print(f"    Filename: {fn}")
        for m in p.get('materials', []):
            meas_summary = [f"{meas['name']}={meas['value']}{meas['unit']}" for meas in m.get('measurements', [])]
            print(f"    Material: {m['id']} | {m['name']} | {m['composition']}")
            print(f"       Meas: {meas_summary}")
