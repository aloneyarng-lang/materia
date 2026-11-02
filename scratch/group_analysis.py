import json

items = json.load(open('scratch/both_hc_bs_summary.json', encoding='utf-8'))

groups = {
    'K101牌号及变种': [],
    'K107牌号及变种': [],
    '学长博士论文自研成分': [],
    '其他软磁牌号': []
}

for it in items:
    mid = it['m_id']
    mname = it['m_name']
    comp = it['comp']
    pidx = it['p_idx']
    
    # Check K107: FINEMET family (Fe-Cu-Nb-Si-B)
    if 'fe73' in comp.lower() and 'nb' in comp.lower() and 'cu' in comp.lower() or 'finemet' in mname.lower():
        groups['K107牌号及变种'].append(it)
    # Check K101: Metglas 2605 / Fe-Si-B typical amorphous
    elif ('fe78si9b13' in comp.lower() or 'metglas 2605' in mname.lower() or 
          ('fe' in comp and 'si' in comp and 'b' in comp and not any(x in comp.lower() for x in ['p', 'cu', 'nb', 'zr', 'co', 'ga', 'cr', 'al', 'mo']))):
        groups['K101牌号及变种'].append(it)
    # Check 学长论文自研: Paper 46 (or thesis author Zhu Yaomin) Fe-P-C-B-Si
    elif pidx == 46 or 'fe85p9b2c2si2' in comp.lower() or 'fe85b9p2c2si2' in comp.lower() or 'fe83c11b2p2si2' in comp.lower():
        groups['学长博士论文自研成分'].append(it)
    # Check other Fe-Si-B variants with Cr
    elif 'fe79.5si9.5b11' in comp.lower() or ('fe-si-b' in mname.lower() and 'cr' in comp.lower()):
        # Fe-Si-B-(Cr) corrosion resistant variants of K101!
        groups['K101牌号及变种'].append(it)
    else:
        groups['其他软磁牌号'].append(it)

for gname, glist in groups.items():
    print(f"==================================================")
    print(f"【{gname}】(共 {len(glist)} 种材料)")
    print(f"==================================================")
    for it in glist:
        hc_s = "; ".join([f"{x[1]} {x[2]}" for x in it['hc']])
        bs_s = "; ".join([f"{x[1]} {x[2]}" for x in it['bs']])
        print(f"• P{it['p_idx']:02d} [{it['m_id']}] {it['m_name']}")
        print(f"  化学式: {it['comp']}")
        print(f"  Hc: {hc_s}")
        print(f"  Bs: {bs_s}")
        print()
