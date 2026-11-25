import test from 'node:test';
import assert from 'node:assert/strict';
import {createNetwork,stepNetwork,networkSnapshot} from '../dist/force-layout.js';
import {GRAPH_DEFAULTS,cleanGraphSettings,farNodeVisibility,fitGraphViewport,placeNodeLabels} from '../dist/graph-settings.js';
import {GraphSpace} from '../dist/graph-space.js';
const papers=count=>Array.from({length:count},(_,i)=>({id:String(i),title:'Materials '+i,tags:['T'+i%50]}));

test('galaxy shapes vary by research community and survive order changes and node dragging', () => {
  const nodes = Array.from({length: 240}, (_, i) => ({
    id: 'paper:' + i, type: 'paper', community: Math.floor(i / 20),
    x: Math.floor(i / 20) * 120 + i % 20, y: 300, radius: 6,
  }));
  const space = new GraphSpace(nodes);
  assert.deepEqual(new Set([...space.galaxies.values()].map(galaxy => galaxy.form)),
    new Set(['spiral', 'barred', 'ring', 'elliptical']));
  assert.deepEqual(new GraphSpace(nodes.slice().reverse()).offsets, space.offsets);
  const first = nodes[0];
  assert.notEqual(space.offsets.get(first.id).y, 0);
  const point = space.project(first);
  const destination = {x: point.x + 24, y: point.y - 15};
  Object.assign(first, space.unproject(destination, first));
  const rebuilt = new GraphSpace(nodes, space);
  const dragged = rebuilt.project(first);
  assert.ok(Math.abs(dragged.x - destination.x) < 1e-8);
  assert.ok(Math.abs(dragged.y - destination.y) < 1e-8);
  assert.equal(new GraphSpace(nodes.slice(0, 7)).galaxies.size, 0);
  const plain = new GraphSpace(nodes, space, false);
  assert.equal(plain.galaxies.size, 0);
  assert.equal(plain.offsets.size, 0);
  assert.equal(plain.yaw, space.yaw);
  const projected = plain.project(first);
  const unprojected = plain.unproject(projected,first);
  assert.ok(Math.abs(unprojected.x-first.x)<1e-8 && Math.abs(unprojected.y-first.y)<1e-8);
  assert.deepEqual([...new GraphSpace(nodes,plain).galaxies.keys()],[...space.galaxies.keys()]);
  assert.equal(cleanGraphSettings({}).showGalaxyParticles,true);
  assert.equal(cleanGraphSettings({}).shapeGalaxies,true);
  assert.equal(cleanGraphSettings({showGalaxyParticles:false}).shapeGalaxies,true);
  assert.equal(cleanGraphSettings({shapeGalaxies:false}).showGalaxyParticles,true);
  assert.equal(cleanGraphSettings({showGalaxyParticles:false,shapeGalaxies:false}).showGalaxyParticles,false);
  assert.equal(cleanGraphSettings({showGalaxyParticles:false,shapeGalaxies:false}).shapeGalaxies,false);
});

test('farNodeVisibility hides nodes only in 3D star-particle mode below the fade threshold', () => {
  const defaults = cleanGraphSettings({});
  assert.equal(defaults.hideNodesWhenFar, false);
  assert.equal(defaults.nodeFadeThreshold, 0.85);
  assert.equal(cleanGraphSettings({hideNodesWhenFar: true}).hideNodesWhenFar, true);
  assert.equal(cleanGraphSettings({hideNodesWhenFar: 'yes'}).hideNodesWhenFar, false);
  assert.equal(cleanGraphSettings({nodeFadeThreshold: 0.05}).nodeFadeThreshold, 0.2);
  assert.equal(cleanGraphSettings({nodeFadeThreshold: 4}).nodeFadeThreshold, 2);
  assert.equal(cleanGraphSettings({nodeFadeThreshold: 0.725}).nodeFadeThreshold, 0.73);

  assert.equal(farNodeVisibility(0.3, {dimension: '3d', showGalaxyParticles: true, hideNodesWhenFar: false, nodeFadeThreshold: 0.85}), 1);
  assert.equal(farNodeVisibility(0.3, {dimension: '2d', showGalaxyParticles: true, hideNodesWhenFar: true, nodeFadeThreshold: 0.85}), 1);
  assert.equal(farNodeVisibility(0.3, {dimension: '3d', showGalaxyParticles: false, hideNodesWhenFar: true, nodeFadeThreshold: 0.85}), 1);

  const prefs = {dimension: '3d', showGalaxyParticles: true, hideNodesWhenFar: true, nodeFadeThreshold: 0.85};
  assert.equal(farNodeVisibility(0.5, prefs), 0);
  assert.equal(farNodeVisibility(0.85, prefs), 0);
  const v1 = farNodeVisibility(0.9, prefs);
  const v2 = farNodeVisibility(0.975, prefs);
  const v3 = farNodeVisibility(1.05, prefs);
  assert.ok(v1 > 0 && v1 < v2 && v2 < v3 && v3 < 1);
  assert.equal(farNodeVisibility(1.1, prefs), 1);
  assert.equal(farNodeVisibility(1.5, prefs), 1);
});

test('spatial projection gives nodes stable depth and left dragging can use the original layout coordinates', () => {
  const nodes = [
    {id: 'first', community: 1, x: 100, y: 90, radius: 8},
    {id: 'second', community: 2, x: 250, y: 350, radius: 12},
    {id: 'third', community: 2, x: 320, y: 110, radius: 9},
  ];
  const space = new GraphSpace(nodes);
  const saved = JSON.stringify(nodes);
  const first = space.project(nodes[0]);
  assert.notEqual(first.depth, space.project(nodes[1]).depth);
  assert.deepEqual(new GraphSpace(nodes).project(nodes[0]), first);
  space.rotate(20, -20);
  const point = space.project(nodes[0]);
  const restored = space.unproject(point, nodes[0]);
  assert.ok(Math.abs(restored.x - nodes[0].x) < 1e-8);
  assert.ok(Math.abs(restored.y - nodes[0].y) < 1e-8);
  assert.notEqual(point.x, first.x);
  assert.equal(JSON.stringify(nodes), saved);
  assert.equal(cleanGraphSettings({}).dimension, '2d');
  assert.equal(cleanGraphSettings({dimension: '3d'}).dimension, '3d');
  assert.equal(cleanGraphSettings({dimension: 'invalid'}).dimension, '2d');
});

test('3D galaxies build distinct astronomical morphologies, degree-ordered cores, dust blueprints, and 360-degree perspective unprojection', () => {
  const nodes = Array.from({length: 240}, (_, i) => ({
    id: 'paper:' + i, type: 'paper', community: Math.floor(i / 20),
    x: Math.floor(i / 20) * 320 + (i % 5) * 20, y: 300 + Math.floor((i % 20) / 5) * 20,
    radius: 6, degree: i % 20,
  }));
  const space = new GraphSpace(nodes);
  const byForm = new Map();
  for (const galaxy of space.galaxies.values()) {
    const {u, v, w} = galaxy.meta.basis;
    const dot = (a, b) => a[0]*b[0] + a[1]*b[1] + a[2]*b[2];
    assert.ok(Math.abs(dot(u, u) - 1) < 1e-9 && Math.abs(dot(v, v) - 1) < 1e-9 && Math.abs(dot(w, w) - 1) < 1e-9);
    assert.ok(Math.abs(dot(u, v)) < 1e-9 && Math.abs(dot(v, w)) < 1e-9 && Math.abs(dot(u, w)) < 1e-9);
    assert.ok(galaxy.meta.dustStars.length >= 44);
    if (!byForm.has(galaxy.form)) byForm.set(galaxy.form, galaxy);
  }
  assert.equal(byForm.size, 4);

  const localProj = (galaxy, id) => {
    const n = nodes.find(node => node.id === id);
    const off = space.offsets.get(id);
    const dx = n.x + off.x - galaxy.meta.center.x;
    const dy = n.y + off.y - galaxy.meta.center.y;
    const dz = off.z;
    const {u, v, w} = galaxy.meta.basis;
    return {
      lx: dx*u[0] + dy*u[1] + dz*u[2],
      ly: dx*v[0] + dy*v[1] + dz*v[2],
      lz: dx*w[0] + dy*w[1] + dz*w[2],
    };
  };

  const spiral = byForm.get('spiral');
  const elliptical = byForm.get('elliptical');
  const meanAbsZ = g => g.meta.memberIds.reduce((s, id) => s + Math.abs(localProj(g, id).lz), 0) / (g.meta.memberIds.length * g.meta.radius);
  assert.ok(meanAbsZ(elliptical) > meanAbsZ(spiral) * 2.5, 'elliptical galaxy must have genuine 3D thickness');

  const ring = byForm.get('ring');
  const ringRadii = ring.meta.memberIds.map(id => {
    const p = localProj(ring, id);
    return Math.hypot(p.lx, p.ly / ring.meta.ringOval) / ring.meta.radius;
  });
  assert.ok(ringRadii.some(r => r < 0.25) && ringRadii.some(r => r > 0.72), 'ring galaxy must separate core and outer ring');
  assert.equal(ringRadii.filter(r => r >= 0.3 && r <= 0.68).length, 0, '20-paper ring galaxy must keep clear gap');

  const barred = byForm.get('barred');
  const armStart = barred.meta.armPaths[0][0];
  assert.ok(Math.abs(Math.hypot(armStart[0], armStart[1]) - barred.meta.barHalf) < 1e-6);

  // Hub papers (high degree) occupy the luminous center while low-degree leaves inhabit outer regions.
  for (const g of [spiral, barred, ring]) {
    const hub = localProj(g, g.meta.memberIds[0]);
    const outer = localProj(g, g.meta.memberIds.at(-1));
    assert.ok(Math.hypot(hub.lx, hub.ly) < Math.hypot(outer.lx, outer.ly));
  }

  // Full 360-degree yaw orbit and perspective project/unproject round-trip accuracy.
  const snapshot = JSON.stringify(nodes);
  for (const [dy, dp] of [[Math.PI * 0.75, 0.4], [Math.PI * 1.4, -0.5]]) {
    space.rotate(dy, dp);
    assert.ok(space.yaw >= -Math.PI && space.yaw <= Math.PI);
    for (const target of [nodes[0], nodes[85], nodes[210]]) {
      const p = space.project(target);
      const back = space.unproject(p, target);
      assert.ok(Math.abs(back.x - target.x) < 1e-8);
      assert.ok(Math.abs(back.y - target.y) < 1e-8);
    }
  }
  assert.equal(JSON.stringify(nodes), snapshot);
});

test('coincident nodes separate without moving pinned or dragged nodes, including when cooling has finished',()=>{
  const graph=createNetwork(papers(16),[]);for(const n of graph.nodes){n.x=500;n.y=310;}
  const pinned=graph.nodes[0],dragged=graph.nodes[1];pinned.pinned=true;dragged.dragging=true;dragged.x=560;
  for(let i=0;i<180;i++)stepNetwork(graph,i<120?.6:0);
  assert.equal(pinned.x,500);assert.equal(pinned.y,310);assert.equal(dragged.x,560);assert.equal(dragged.y,310);
  for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>=a.radius+b.radius+8);}
});
test('releasing a node outside the old rectangular bounds moves it gradually rather than teleporting to a wall',()=>{
  const graph=createNetwork(papers(1),[]),n=graph.nodes[0];Object.assign(n,{x:1400,y:850,pinned:true});stepNetwork(graph,.8);assert.equal(n.x,1400);
  n.pinned=false;stepNetwork(graph,.8);assert.ok(n.x>1390&&n.x<1400);assert.ok(n.y>840&&n.y<850);
  const before=Math.hypot(n.x-500,n.y-310);for(let i=0;i<140;i++)stepNetwork(graph,.5);assert.ok(Math.hypot(n.x-500,n.y-310)<before);
});
test('equal elapsed time yields similar layouts at 60 and 120 Hz',()=>{
  const a=createNetwork(papers(24),[]),b=createNetwork(papers(24),[]);
  for(let i=0;i<180;i++)stepNetwork(a,.7*Math.pow(.966,i),GRAPH_DEFAULTS,1);
  for(let i=0;i<360;i++)stepNetwork(b,.7*Math.pow(.966,i/2),GRAPH_DEFAULTS,.5);
  assert.ok(Math.max(...a.nodes.map((n,i)=>Math.hypot(n.x-b.nodes[i].x,n.y-b.nodes[i].y)))<8);
});
test('dense manual networks cool to finite, separated positions while retaining only explicit edges',()=>{
  const graph=createNetwork(papers(350),[],{},Array.from({length:50},(_,i)=>({kind:'tag',value:'T'+i})));let movement;
  for(let i=0;i<230;i++)movement=stepNetwork(graph,.8*Math.pow(.966,i));
  assert.equal(graph.nodes.length,400);assert.equal(graph.edges.length,350);assert.ok(movement/graph.nodes.length<.03);
  for(const n of graph.nodes)assert.ok(Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<4000&&Math.abs(n.y)<4000);
  for(let i=0;i<graph.nodes.length;i++)for(let j=i+1;j<graph.nodes.length;j++){const a=graph.nodes[i],b=graph.nodes[j];assert.ok(Math.hypot(a.x-b.x,a.y-b.y)>a.radius+b.radius);}
});
test('fit includes far pinned nodes and respects tall or wide usable viewports',()=>{
  const nodes=[{x:-1800,y:100,radius:10,pinned:true},{x:1700,y:1800,radius:14,pinned:true}];
  for(const height of [430,620,1100]){const camera=fitGraphViewport(nodes,1000,height);for(const n of nodes){assert.ok((n.x-n.radius)*camera.scale+camera.x>=0);assert.ok((n.x+n.radius)*camera.scale+camera.x<=1000);assert.ok((n.y-n.radius)*camera.scale+camera.y>=0);assert.ok((n.y+n.radius)*camera.scale+camera.y<=height);}}
});
test('selected English titles wrap at word boundaries and keep their placement when clear',()=>{
  const node={id:'paper:a',type:'paper',paper:{title:'Pulse current training induced marked improvement of soft magnetic properties'},x:400,y:280,radius:6};
  const first=placeNodeLabels([node],{activeId:node.id}),label=first.get(node.id);assert.ok(label.lines.length===2);assert.ok(label.lines[0].endsWith('induced'));assert.ok(label.lines[1].startsWith('marked'));
  node.x+=1;const next=placeNodeLabels([node],{activeId:node.id,previous:first});assert.equal(next.get(node.id).slot,label.slot);
});


const unforced={...GRAPH_DEFAULTS,center:0,repulsion:0};
function springFixture(){
 const graph=createNetwork([{id:'spring',title:'Spring',tags:['Elastic']},{id:'island',title:'Island',tags:[]}],[],{},[{kind:'tag',value:'Elastic'}]);
 const node=graph.byId.get('paper:spring'),anchor=graph.nodes.find(n=>n.type==='relation'),island=graph.byId.get('paper:island');
 Object.assign(anchor,{x:500,y:300,pinned:true});Object.assign(node,{x:705,y:300});Object.assign(island,{x:1100,y:700});return{graph,node,anchor,island};
}

test('a real stretched link pulls promptly and settles at its rest length with damping',()=>{
 const {graph,node,anchor,island}=springFixture(),start=node.x;
 for(let i=0;i<12;i++)stepNetwork(graph,.3,unforced);
 assert.ok(node.x<start-35,'linked nodes must follow visibly within 200 ms');
 for(let i=0;i<300;i++)stepNetwork(graph,.3*Math.pow(.9772,i),unforced);
 assert.ok(Math.abs(node.x-anchor.x-GRAPH_DEFAULTS.linkDistance)<.1);assert.ok(Math.abs(node.vx)<.005);
 assert.equal(anchor.x,500);assert.equal(anchor.y,300);assert.equal(island.x,1100);assert.equal(island.y,700);
});

test('without physical forces an isolated node never follows another node or springs toward an old position',()=>{
 const graph=createNetwork(papers(10),[]),source=graph.nodes[0],before=networkSnapshot(graph);
 source.dragging=true;source.x+=170;source.y+=65;
 for(let i=0;i<100;i++)stepNetwork(graph,.3,unforced);
 for(const node of graph.nodes.slice(1)){assert.equal(node.x,before[node.id].x);assert.equal(node.y,before[node.id].y);}
 source.dragging=false;for(let i=0;i<300;i++)stepNetwork(graph,.3*Math.pow(.9772,i),unforced);
 assert.equal(source.x,before[source.id].x+170);assert.equal(source.y,before[source.id].y+65);
 assert.equal(graph.edges.length,0);assert.ok(!('deformation' in graph));assert.ok(Object.values(networkSnapshot(graph)).every(point=>Object.keys(point).sort().join(',')==='pinned,x,y'));
});

test('drag traction travels across real links and settles into a new layout after release',()=>{
 const graph=createNetwork([{id:'bridge',title:'Bridge',tags:['A','B']},{id:'leaf',title:'Leaf',tags:['B']}],[],{},[{kind:'tag',value:'A'},{kind:'tag',value:'B'}]);
 const source=graph.nodes.find(n=>n.rule?.value==='A'),bridge=graph.byId.get('paper:bridge'),other=graph.nodes.find(n=>n.rule?.value==='B'),leaf=graph.byId.get('paper:leaf');
 for(const [i,n]of [source,bridge,other,leaf].entries())Object.assign(n,{x:100+i*145,y:300});
 const before=networkSnapshot(graph);source.dragging=true;source.x-=180;
 for(let i=0;i<150;i++)stepNetwork(graph,.3,unforced);
 assert.equal(source.x,-80);assert.ok(bridge.x<before[bridge.id].x-100);assert.ok(other.x<before[other.id].x-70);assert.ok(leaf.x<before[leaf.id].x-50);
 source.dragging=false;for(let i=0;i<350;i++)stepNetwork(graph,.3*Math.pow(.9772,i),unforced);
 assert.ok(source.x<before[source.id].x-100,'released layout must not return to a drag-start anchor');
 assert.equal(graph.edges.length,3);assert.ok(graph.nodes.every(n=>Math.hypot(n.vx,n.vy)<.01));
});

test('global repulsion lets unconnected nodes react to the held node without inventing links',()=>{
 const graph=createNetwork(papers(8),[]);graph.nodes.forEach((n,i)=>Object.assign(n,{x:500+Math.cos(i*Math.PI/4)*120,y:310+Math.sin(i*Math.PI/4)*120}));
 const source=graph.nodes[0],before=networkSnapshot(graph);source.dragging=true;source.x=500;
 for(let i=0;i<40;i++)stepNetwork(graph,.3,{...GRAPH_DEFAULTS,center:0});
 assert.ok(graph.nodes.slice(1).every(n=>Math.hypot(n.x-before[n.id].x,n.y-before[n.id].y)>5));assert.equal(source.x,500);assert.equal(graph.edges.length,0);
});

test('inertia controls velocity decay and obsolete rebound preferences cannot enable anchor deformation',()=>{
 const velocities=[];for(const inertia of [0,.5,1]){const {graph,node}=springFixture();stepNetwork(graph,.3,{...unforced,inertia});velocities.push(Math.abs(node.vx));}
 assert.ok(velocities[0]<velocities[1]&&velocities[1]<velocities[2]);assert.equal(cleanGraphSettings({inertia:9}).inertia,1);assert.equal(cleanGraphSettings({inertia:-2}).inertia,0);
 const settings=cleanGraphSettings({elasticity:1});assert.equal(settings.inertia,.5);assert.ok(!('elasticity' in settings));
});

test('dense dragging stays finite, preserves pins and cools without any saved spring anchors',()=>{
 const g=createNetwork(papers(350),[],{},Array.from({length:50},(_,i)=>({kind:'tag',value:'T'+i})));for(let i=0;i<80;i++)stepNetwork(g,.6);
 const source=g.nodes[0],pin=g.nodes[1];pin.pinned=true;const fixed={x:pin.x,y:pin.y};source.dragging=true;source.x+=120;source.y+=45;
 for(let i=0;i<45;i++)stepNetwork(g,.3);source.dragging=false;for(let i=0;i<350;i++)stepNetwork(g,.3*Math.pow(.9772,i));
 assert.equal(pin.x,fixed.x);assert.equal(pin.y,fixed.y);assert.ok(g.nodes.every(n=>Number.isFinite(n.x)&&Number.isFinite(n.y)&&Math.abs(n.x)<4000&&Math.abs(n.y)<4000&&Math.hypot(n.vx,n.vy)<.02));assert.equal(g.edges.length,350);
});
