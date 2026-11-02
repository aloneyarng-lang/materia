import csv
import json

data = json.load(open('文献库/library.json', encoding='utf-8'))
groups = data['settings']['comparisonState']['groups']
print("=== ComparisonState Groups in library.json ===")
for g in groups:
    print(f"  {g['name']} ({g['id']}): {len(g['members'])} materials")

csv_rows = list(csv.DictReader(open('文献库/材料四组归类清单.csv', encoding='utf-8-sig')))
print(f"\n=== CSV Total Rows: {len(csv_rows)} ===")
csv_groups = {}
for r in csv_rows:
    csv_groups.setdefault(r['分组'], []).append(r)

for gname, items in csv_groups.items():
    print(f"  {gname}: {len(items)} 条")
