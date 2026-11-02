import json
import csv
import shutil
import time

# 1. Back up existing files
timestamp = time.strftime('%Y%m%d-%H%M%S')
shutil.copyfile('文献库/library.json', f'文献库/backups/library.before-61-materials-{timestamp}.json')
shutil.copyfile('文献库/材料四组归类清单.csv', f'文献库/backups/材料四组归类清单.before-61-materials-{timestamp}.csv')
print(f"Backed up to library.before-61-materials-{timestamp}.json")

# 2. Load library data
with open('文献库/library.json', 'r', encoding='utf-8') as f:
    data = json.load(f)

both_items = json.load(open('scratch/both_hc_bs_summary.json', encoding='utf-8'))
print(f"Loaded {len(both_items)} materials with both Hc and Bs")

# 3. Categorize into 4 groups
group_defs = [
    {
        'id': 'grade-k101',
        'name': 'K101牌号及变种',
        'csv_group': 'K101牌号'
    },
    {
        'id': 'grade-k107',
        'name': 'K107牌号及变种',
        'csv_group': 'K107牌号'
    },
    {
        'id': 'grade-other',
        'name': '其他软磁牌号',
        'csv_group': '其他牌号'
    },
    {
        'id': 'thesis-self-developed',
        'name': '学长博士论文自研成分及同系变种',
        'csv_group': '学长博士论文自研成分'
    }
]

group_map = {g['id']: [] for g in group_defs}
csv_rows = []

# Collect all measurement keys
all_keys = []

for it in both_items:
    pid = it['p_id']
    mid = it['m_id']
    comp = it['comp']
    name = it['m_name']
    pidx = it['p_idx']
    ptitle = it['p_title']
    member_str = json.dumps([pid, mid], ensure_ascii=False)

    # Classification logic
    # Group 1: K101
    if mid == 'bshc-fe78si9b13':
        gid = 'grade-k101'
        cgroup = 'K101牌号'
        reason = '与1K101典型Metglas 2605 (Fe78Si9B13) 体系完全对应'
    elif pidx == 30 and 'x0' in mid:
        gid = 'grade-k101'
        cgroup = 'K101牌号'
        reason = 'Fe79.5Si9.5B11 为经典三元 Fe-Si-B 非晶合金（近 1K101 变种）'
    elif pidx == 30:
        gid = 'grade-k101'
        cgroup = 'K101牌号'
        reason = f'{comp} 为 Fe-Si-B 基耐蚀改性非晶合金（1K101 耐蚀变种）'
    
    # Group 2: K107
    elif mid in ['bshc-fe73p5si13p5b9nb3cu1', 'finemet-fe73-5']:
        gid = 'grade-k107'
        cgroup = 'K107牌号'
        reason = '与1K107典型FINEMET (Fe73.5Cu1Nb3Si13.5B9) 纳米晶成分完全对应'
    elif mid == 'finemet-fe73-5-si15-5':
        gid = 'grade-k107'
        cgroup = 'K107牌号'
        reason = 'FINEMET 高硅变体 (Fe73.5Cu1Nb3Si15.5B7)，1K107 纳米晶调硅变种'
    elif pidx in [10, 11] and ('nb' in comp.lower() or 'nb' in mid.lower() or 'fe80-3si4b13cu1-7nb1' in mid):
        gid = 'grade-k107'
        cgroup = 'K107牌号'
        reason = f'{comp} 为 Fe-Cu-Nb-Si-B 纳米晶调铌/调铜软磁合金（1K107 系列变种）'

    # Group 4: Thesis
    elif pidx == 46:
        gid = 'thesis-self-developed'
        cgroup = '学长博士论文自研成分'
        reason = '祝要民博士论文自研高饱和磁感非晶合金薄带核心成分（含淬态与系统退火数据）'
    elif pidx == 43:
        gid = 'thesis-self-developed'
        cgroup = '学长博士论文自研成分'
        reason = f'{comp} 属于同系 Fe-P-C-B-Si 高铁含量非晶软磁体系变种（Shi和Yao 2020）'
    elif mid == 'fe83si2b11c2p2-opt':
        gid = 'thesis-self-developed'
        cgroup = '学长博士论文自研成分'
        reason = f'{comp} 属于 Fe-Si-B-C-P 互补合金化高磁感非晶体系变种'
    elif mid == 'fe83b10si3c3p1-sa':
        gid = 'thesis-self-developed'
        cgroup = '学长博士论文自研成分'
        reason = f'{comp} 属于 Fe-B-Si-C-P 软磁非晶基准合金变种'
    elif mid == 'fe76p5si0-3b0-5c0-2-19-bmg':
        gid = 'thesis-self-developed'
        cgroup = '学长博士论文自研成分'
        reason = f'{comp} 属于同系 Fe-P-C-B-Si 软磁块体非晶合金变种'

    # Group 3: Other
    else:
        gid = 'grade-other'
        cgroup = '其他牌号'
        if 'nanomet' in name.lower() or 'fe83.3si4b8p4cu0.7' in name.lower() or 'fe84.8b8p6cu1.2' in name.lower() or 'fe85si2b8p4cu1' in comp.lower():
            reason = 'NANOMET 经典纳米晶软磁合金体系（Fe-Si-B-P-Cu）'
        elif 'nanoperm' in name.lower() or ('zr' in comp.lower() and 'fe' in comp.lower() and 'hitperm' not in name.lower()):
            reason = 'NANOPERM 经典纳米晶软磁合金体系（Fe-Zr-B-(Cu)）'
        elif 'hitperm' in name.lower():
            reason = 'HITPERM 高温纳米晶软磁合金体系（Fe-Co-Zr-B-Cu-Al）'
        elif 'hbna' in name.lower():
            reason = 'HBNA 贫合金化高磁通纳米晶软磁合金'
        elif 'co' in comp.lower():
            reason = 'Co 元素增强超高饱和磁感软磁合金体系'
        elif 'cu' in comp.lower() and 'si' in comp.lower() and 'b' in comp.lower():
            reason = 'Fe-Si-B-Cu 高铜系纳米晶软磁合金体系'
        elif 'slm' in mid.lower():
            reason = '激光选区熔化(SLM)增材制造非晶软磁材料'
        elif 'ga' in comp.lower():
            reason = 'Fe-Ga-P-C-B-Si 特殊软磁块体金属玻璃'
        else:
            reason = '其他经典或改性软磁合金体系'

    group_map[gid].append(member_str)
    csv_rows.append({
        '分组': cgroup,
        '材料': name,
        '成分': comp,
        '来源文献': ptitle,
        '文献ID': pid,
        '材料ID': mid,
        '归类依据': reason
    })

# Collect all measurement keys for these 61 materials from library.json
member_set = set((it['p_id'], it['m_id']) for it in both_items)
for p in data['papers']:
    for m in p.get('materials', []):
        if (p['id'], m['id']) in member_set:
            for meas in m.get('measurements', []):
                sample = meas.get('sample') or ''
                cond = meas.get('conditions') or ''
                k = json.dumps([p['id'], m['id'], sample, cond], ensure_ascii=False)
                if k not in all_keys:
                    all_keys.append(k)

# 4. Update data['settings']['comparisonState']
new_groups = []
for gdef in group_defs:
    gid = gdef['id']
    gname = gdef['name']
    new_groups.append({
        'id': gid,
        'name': gname,
        'members': group_map[gid]
    })

data['settings']['comparisonState']['groups'] = new_groups
data['settings']['comparisonState']['keys'] = all_keys

# Save library.json
with open('文献库/library.json', 'w', encoding='utf-8') as f:
    json.dump(data, f, ensure_ascii=False, indent=2)
print("Updated 文献库/library.json")

# 5. Save 文献库/材料四组归类清单.csv
with open('文献库/材料四组归类清单.csv', 'w', encoding='utf-8-sig', newline='') as f:
    writer = csv.DictWriter(f, fieldnames=['分组', '材料', '成分', '来源文献', '文献ID', '材料ID', '归类依据'])
    writer.writeheader()
    # Sort csv rows by 分组, then 材料ID
    sort_order = {'K101牌号': 0, 'K107牌号': 1, '学长博士论文自研成分': 2, '其他牌号': 3}
    csv_rows.sort(key=lambda r: (sort_order.get(r['分组'], 99), r['材料ID']))
    for r in csv_rows:
        writer.writerow(r)
print(f"Updated 文献库/材料四组归类清单.csv with {len(csv_rows)} rows")

# 6. Report summary
for g in new_groups:
    print(f"Group '{g['name']}' ({g['id']}): {len(g['members'])} materials")
print(f"Total measurement comparison keys: {len(all_keys)}")
