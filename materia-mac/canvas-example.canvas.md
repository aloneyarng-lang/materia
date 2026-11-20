canvas "成分—工艺—结构—性能"
layout mindmap
direction right

node root "材料设计"
node composition "成分设计"
node process "制备与热处理"
node structure "微观结构"
node performance "力学性能"

root -> composition
root -> process
process -> structure : "调控"
structure -> performance : "影响"

style structure shape=hexagon color=purple
style performance shape=roundrect color=gold
note structure "补充证据、实验条件与待验证的问题。"
group "实验变量" [composition, process]
