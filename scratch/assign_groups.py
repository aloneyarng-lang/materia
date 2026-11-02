import json
import csv

data = json.load(open('文献库/library.json', encoding='utf-8'))

# Map of (paper_id, material_id) -> (paper, material)
pm_map = {}
for p in data['papers']:
    for m in p.get('materials', []):
        pm_map[(p['id'], m['id'])] = (p, m)

def is_hc(name):
    return any(k in name for k in ['矫顽力', 'Hc'])

def is_bs(name):
    return any(k in name for k in ['Bs', 'Ms', 'Js', 'Is', '饱和磁化', '饱和磁感', '饱和磁极化', '饱和磁通'])

# Read all 61 items
both_items = json.load(open('scratch/both_hc_bs_summary.json', encoding='utf-8'))
print(f"Total items with both Hc and Bs: {len(both_items)}")

# We will assign each to one of the 4 groups:
# 1: grade-k101 -> 'K101牌号及变种'
# 2: grade-k107 -> 'K107牌号及变种'
# 3: thesis-self-developed -> '学长博士论文自研成分及同系变种'
# 4: grade-other -> '其他软磁牌号'

k101_assigned = []
k107_assigned = []
thesis_assigned = []
other_assigned = []

for it in both_items:
    pid = it['p_id']
    mid = it['m_id']
    comp = it['comp']
    name = it['m_name']
    pidx = it['p_idx']
    key = (pid, mid)

    # 1. K101
    # P08 Fe78Si9B13
    # P30 Fe79.5Si9.5B11 and Fe-Si-B-Cr variants
    if mid == 'bshc-fe78si9b13' or pidx == 30:
        k101_assigned.append(it)
    # 2. K107
    # P08 FINEMET
    # P36 FINEMET typical and high-Si variant
    # P10 / P11 Fe-Si-B-Cu-Nb variants
    elif mid in ['bshc-fe73p5si13p5b9nb3cu1', 'finemet-fe73-5', 'finemet-fe73-5-si15-5']:
        k107_assigned.append(it)
    elif pidx in [10, 11] and ('nb' in comp.lower() or 'nb' in mid.lower() or 'fe80-3si4b13cu1-7nb1' in mid):
        k107_assigned.append(it)
    # 3. Thesis and its Fe-P-C-B-Si system variants
    # P46 (Zhu Yaomin thesis ribbons)
    # P43 (Shi & Yao high-Fe Fe-B-C-Si-P amorphous alloys)
    # P22 (Fe83Si2B11C2P2 complementary alloying)
    # P02 (Fe83B10Si3C3P1 Co0-SA base)
    # P09 (Fe76P5(Si0.3B0.5C0.2)19 BMG)
    elif pidx == 46:
        thesis_assigned.append(it)
    elif pidx == 43:
        thesis_assigned.append(it)
    elif mid == 'fe83si2b11c2p2-opt':
        thesis_assigned.append(it)
    elif mid == 'fe83b10si3c3p1-sa':
        thesis_assigned.append(it)
    elif mid == 'fe76p5si0-3b0-5c0-2-19-bmg':
        thesis_assigned.append(it)
    # 4. Other soft magnetic grades
    else:
        other_assigned.append(it)

print(f"K101 assigned: {len(k101_assigned)}")
print(f"K107 assigned: {len(k107_assigned)}")
print(f"Thesis & variants assigned: {len(thesis_assigned)}")
print(f"Other assigned: {len(other_assigned)}")
total_assigned = len(k101_assigned) + len(k107_assigned) + len(thesis_assigned) + len(other_assigned)
print(f"Total assigned: {total_assigned}")
