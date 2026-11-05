const path=require('node:path'),fs=require('node:fs/promises'),assert=require('node:assert/strict');
const {chromium}=require(path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
(async()=>{
 const {createPreviewServer}=await import('../server.mjs'),server=createPreviewServer();await new Promise(r=>server.listen(0,'127.0.0.1',r));let browser;
 try{
  browser=await chromium.launch({headless:true,channel:'msedge'});const page=await browser.newPage({viewport:{width:1440,height:940}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('http://127.0.0.1:'+server.address().port);await page.waitForFunction(()=>document.querySelector('.import-main')?.disabled===false);
  const results=[];
  for(const count of [353,1000])results.push(await page.evaluate(async count=>{
   const {StarMap}=await import('./graph-view.js'),{stepNetwork}=await import('./force-layout.js');
   document.querySelector('#perf-svg')?.remove();const svg=document.createElementNS('http://www.w3.org/2000/svg','svg');svg.id='perf-svg';svg.style='position:fixed;inset:0;width:1200px;height:800px;background:#eee;z-index:99999';svg.setAttribute('viewBox','0 0 1000 620');document.body.append(svg);
   const map=new StarMap(svg,{onHover(){},onSelect(){},onZoom(){}});map.configure({mode:'similarity',appearance:'cosmos'});map.options={showEdges:true,showLabels:true};
   const papers=Array.from({length:count},(_,i)=>({id:'p'+i,title:`Magnetic alloy ${i} interface strength and microstructure group ${i%24}`,tags:['Materials','Group '+i%24,'Method '+i%7],authorDetails:[{name:'Author '+i%40,affiliations:['Institute '+i%12]}]}));
   let t=performance.now();map.setData(papers,'',[]);const startup=performance.now()-t;cancelAnimationFrame(map.frame);map.frame=null;map.scale=1.4;
   const samples=[];for(let i=0;i<24;i++){t=performance.now();stepNetwork(map.network,.3,map.preferences);map.paint();samples.push(performance.now()-t);}
   t=performance.now();map.setData(papers,'p1',[]);const repeat=performance.now()-t;cancelAnimationFrame(map.frame);map.frame=null;
   const frameTimes=[];let previous;await new Promise(resolve=>{const tick=time=>{if(previous)frameTimes.push(time-previous);previous=time;stepNetwork(map.network,.3,map.preferences);map.paint();if(frameTimes.length<60)requestAnimationFrame(tick);else resolve();};requestAnimationFrame(tick);});
   const percentile=(xs,p)=>xs.slice().sort((a,b)=>a-b)[Math.min(xs.length-1,Math.floor(xs.length*p))];
   const result={count,edges:map.network.edges.length,startupMs:startup,repeatMs:repeat,workMedianMs:percentile(samples,.5),workP95Ms:percentile(samples,.95),frameMedianMs:percentile(frameTimes,.5),frameP95Ms:percentile(frameTimes,.95)};
   map.paused=true;cancelAnimationFrame(map.frame);map.resizeObserver.disconnect();svg.remove();return result;
  },count));
  assert.deepEqual(errors,[]);const name=process.argv[2]||'current';await fs.mkdir(path.join(__dirname,'../.local/graph-performance'),{recursive:true});await fs.writeFile(path.join(__dirname,'../.local/graph-performance',name+'.json'),JSON.stringify(results,null,2));console.log(JSON.stringify(results,null,2));
 }finally{await browser?.close();await new Promise(r=>server.close(r));}
})().catch(e=>{console.error(e);process.exitCode=1;});
