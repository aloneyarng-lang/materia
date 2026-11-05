import {forceSimulation,forceManyBody,forceLink,forceCollide,forceX,forceY} from './vendor/d3-force.mjs';
import {similarityLinks} from './paper-similarity.js';
import { primaryTag } from './tags.js';
import { GRAPH_DEFAULTS } from './graph-settings.js';
import { cleanAssociations, associationMatches } from './associations.js';

const hash = text => [...text].reduce((value, char) => (value * 31 + char.charCodeAt(0)) >>> 0, 7);
const clamp = (value, min, max) => Math.max(min, Math.min(max, value));
export function cleanLayout(value = {}) {
  return Object.fromEntries(Object.entries(value || {}).slice(-10000).filter(([key, point]) => /^(paper|tag|relation):/.test(key) && key.length < 1500 && point && Number.isFinite(point.x) && Number.isFinite(point.y)).map(([key, point]) => [key, { x: clamp(point.x, -3000, 4000), y: clamp(point.y, -3000, 4000), pinned: Boolean(point.pinned) }]));
}

export function createNetwork(papers, groups, saved = {}, suppliedAssociations = [], mode = 'tags', neighbors = 3) {
  const allowed=new Set(groups.map(group=>group.name)),colors=new Map(groups.map(group=>[group.name,group.color]));
  const nodes=papers.map((paper,index)=>{
    const angle=index*2.399963+(hash(paper.id)%100)/900,distance=papers.length===1?0:Math.sqrt((index+.5)/papers.length)*300;
    const previous=saved['paper:'+paper.id];
    return{id:'paper:'+paper.id,type:'paper',paper,color:colors.get(primaryTag(paper,allowed))||'#829487',radius:5.8,x:previous?.x??500+Math.cos(angle)*distance,y:previous?.y??310+Math.sin(angle)*distance,pinned:Boolean(previous?.pinned)};
  });
  const relationColors={tag:'#477e74',year:'#a18452',institution:'#6d7caa',author:'#98788e'};
  const rules=mode==='similarity'?[]:cleanAssociations(suppliedAssociations);
  for(const rule of rules){
    const members=nodes.filter(node=>node.type==='paper'&&associationMatches(node.paper,rule)),seed=hash(rule.id),angle=seed/4294967295*Math.PI*2;
    const x=members.length?members.reduce((sum,node)=>sum+node.x,0)/members.length:500,y=members.length?members.reduce((sum,node)=>sum+node.y,0)/members.length:305;
    const previous=saved[rule.id];
    nodes.push({id:rule.id,type:'relation',kind:rule.kind,rule,tag:rule.label,label:rule.label,members:members.map(node=>node.paper.id),color:relationColors[rule.kind],radius:Math.min(13,7.5+Math.sqrt(members.length)),x:previous?.x??x+Math.cos(angle)*55,y:previous?.y??y+Math.sin(angle)*55,pinned:Boolean(previous?.pinned)});
  }
  const byId=new Map(nodes.map(node=>[node.id,node])),edges=[];
  for(const node of nodes){node.vx=0;node.vy=0;node.degree=0;}
  for(const node of nodes.filter(node=>node.type==='relation'))for(const id of node.members){const source=byId.get('paper:'+id);edges.push({source,target:node,tag:node.id,associationId:node.id});source.degree++;node.degree++;}
  if(mode==='similarity')for(const edge of similarityLinks(papers,{neighbors})){const source=nodes[edge.source],target=nodes[edge.target];edges.push({...edge,source,target});source.degree++;target.degree++;}
  for(const node of nodes)node.radius=node.type==='paper'?4.2+Math.min(3.8,Math.sqrt(node.degree)*.85):5+Math.min(5,Math.sqrt(node.degree)*.75);
  const adjacency=new Map(nodes.map(node=>[node.id,[]]));for(const edge of edges){adjacency.get(edge.source.id).push(edge.target);adjacency.get(edge.target.id).push(edge.source);}
  return{nodes,edges,byId,adjacency,omittedTags:0};
}

// The simulation has no timer of its own: the view supplies elapsed 60 Hz ticks.
// Only actual links create springs; there are no stored-position tethers.
function physicsFor(network,preferences){
  if(!network.physics){
    const links=forceLink(network.edges).id(node=>node.id);
    const charge=forceManyBody().distanceMin(24);
    const collision=forceCollide(node=>node.radius+10).strength(.7).iterations(2);
    const x=forceX(500),y=forceY(310);
    const simulation=forceSimulation(network.nodes).stop().alphaDecay(0)
      .force('x',x).force('y',y).force('links',links).force('charge',charge).force('collision',collision);
    network.physics={simulation,links,charge,x,y,remainder:0,key:''};
  }
  const physics=network.physics;
  const {center,repulsion,linkStrength,linkDistance,inertia=.5}=preferences;
  const key=[center,repulsion,linkStrength,linkDistance,inertia].join('|');
  if(key!==physics.key){
    physics.x.strength(.05*center);physics.y.strength(.05*center);
    physics.charge.strength(-90*repulsion);
    physics.links.distance(edge=>edge.similarity===undefined?linkDistance:linkDistance*(1.65-1.15*edge.similarity)).strength(edge=>linkStrength*(edge.similarity===undefined?1:.4+1.6*edge.similarity)/Math.max(1,Math.min(edge.source.degree,edge.target.degree)));
    physics.simulation.velocityDecay(.55-.3*clamp(inertia,0,1));
    physics.key=key;
  }
  return physics;
}

export function stepNetwork(network,alpha=1,preferences=GRAPH_DEFAULTS,elapsed=1){
  const physics=physicsFor(network,preferences),heat=clamp(alpha,0,1);
  physics.remainder+=clamp(Number.isFinite(elapsed)?elapsed:1,.25,2);
  // Fixed time steps preserve the same force response on 60/120/144 Hz displays.
  while(physics.remainder>=1-1e-8){
    for(const node of network.nodes){
      node.fx=node.pinned||node.dragging?node.x:null;
      node.fy=node.pinned||node.dragging?node.y:null;
    }
    physics.simulation.alpha(heat).tick();
    physics.remainder-=1;
  }
  return network.nodes.reduce((sum,node)=>sum+Math.hypot(node.vx,node.vy),0);
}

export const networkSnapshot = network => Object.fromEntries(network.nodes.map(node => [node.id, { x: node.x, y: node.y, pinned: Boolean(node.pinned) }]));
