import json
import csv

data = json.load(open('文献库/library.json', encoding='utf-8'))
both_items = json.load(open('scratch/both_hc_bs_summary.json', encoding='utf-8'))

# Map (p_id, m_id) -> (p, m)
pm_map = {}
for p in data['papers']:
    for m in p.get('materials', []):
        pm_map[(p['id'], m['id'])] = (p, m)

rows = []
groups_members = {
    'grade-k101': [],
    'grade-k107': [],
    'thesis-self-developed': [],
    'grade-other': []
}

for it in both_items:
    pid = it['p_id']
    mid = it['m_id']
    comp = it['comp']
    name = it['m_name']
    pidx = it['p_idx']
    ptitle = it['p_title']
    member_str = json.dumps([pid, mid], ensure_ascii=False)

    # 1. K101
    if mid == 'bshc-fe78si9b13':
        group = 'K101牌号'
        gid = 'grade-k101'
        reason = '与1K101典型Metglas 2605 (Fe78Si9B13) 体系完全对应'
    elif pidx == 30 and 'x0' in mid:
        group = 'K101牌号'
        gid = 'grade-k101'
        reason = 'Fe79.5Si9.5B11 为经典三元 Fe-Si-B 非晶合金（近 1K101 变种）'
    elif pidx == 30:
        group = 'K101牌号'
        gid = 'grade-k101'
        reason = f'{comp} 为 Fe-Si-B 基耐蚀改性非晶合金（1K101 耐蚀变种）'
    
    # 2. K107
    elif mid in ['bshc-fe73p5si13p5b9nb3cu1', 'finemet-fe73-5']:
        group = 'K107牌号'
        gid = 'grade-k107'
        reason = '与1K107典型FINEMET (Fe73.5Cu1Nb3Si13.5B9) 纳米晶成分完全对应'
    elif mid == 'finemet-fe73-5-si15-5':
        group = 'K107牌号'
        gid = 'grade-k107'
        reason = 'FINEMET 高硅变体 (Fe73.5Cu1Nb3Si15.5B7)，1K107 纳米晶调硅变种'
    elif pidx in [10, 11] and ('nb' in comp.lower() or 'nb' in mid.lower() or 'fe80-3si4b13cu1-7nb1' in mid):
        group = 'K107牌号'
        gid = 'grade-k107'
        reason = f'{comp} 为 Fe-Cu-Nb-Si-B 纳米晶调铌/调铜软磁合金（1K107 系列变种）'

    # 3. Thesis
    elif pidx == 46:
        group = '学长博士论文自研成分'
        gid = 'thesis-self-developed'
        reason = '祝要民博士论文自研高饱和磁感非晶合金薄带核心成分（含淬态与系统退火数据）'
    elif pidx == 43:
        group = '学长博士论文自研成分'
        gid = 'thesis-self-developed'
        reason = f'{comp} 属于同系 Fe-P-C-B-Si 高铁含量非晶软磁体系变种（Shi和Yao 2020）'
    elif mid == 'fe83si2b11c2p2-opt':
        group = '学长博士论文自研成分'
        gid = 'thesis-self-developed'
        reason = f'{comp} 属于 Fe-Si-B-C-P 互补合金化高磁感非晶体系变种'
    elif mid == 'fe83b10si3c3p1-sa':
        group = '学长博士论文自研成分'
        gid = 'thesis-self-developed'
        reason = f'{comp} 属于 Fe-B-Si-C-P 软磁非晶基准合金变种'
    elif mid == 'fe76p5si0-3b0-5c0-2-19-bmg':
        group = '学长博士论文自研成分'
        gid = 'thesis-self-developed'
        reason = f'{comp} 属于同系 Fe-P-C-B-Si 软磁块体非晶合金变种'

    # 4. Other
    else:
        group = '其他牌号'
        gid = 'grade-other'
        if 'nanomet' in name.lower() or 'fe83.3si4b8p4cu0.7' in name.lower() or 'fe84.8b8p6cu1.2' in name.lower() or 'fe85si2b8p4cu1' in comp.lower():
            reason = 'NANOMET 经典纳米晶软磁合金体系（Fe-Si-B-P-Cu）'
        elif 'nanoperm' in name.lower() or 'zr' in comp.lower() and 'fe' in comp.lower() and 'hitperm' not in name.lower():
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

    rows.append({
        '分组': group,
        '材料': name,
        '成分': comp,
        '来源文献': ptitle,
        '文献ID': pid,
        '材料ID': mid,
        '归类依据': reason
    })
    groups_members[gid].append(member_str)

print(f"Total rows: {len(rows)}")
for gid, mlist in groups_members.items():
    print(f"  {gid}: {len(mlist)} members")
