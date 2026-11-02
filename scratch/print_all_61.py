import json

items = json.load(open('scratch/both_hc_bs_summary.json', encoding='utf-8'))

print(f"Total materials with both Hc and Bs: {len(items)}\n")

# Let's inspect each:
for it in items:
    hc_str = ", ".join([f"{x[1]} {x[2]}" for x in it['hc']])
    bs_str = ", ".join([f"{x[1]} {x[2]}" for x in it['bs']])
    print(f"P{it['p_idx']:02d} | {it['m_id'][:25]:25s} | {it['comp'][:25]:25s} | Hc: {hc_str[:20]:20s} | Bs: {bs_str[:20]:20s} | {it['m_name']}")
