// Render only local, extracted Workshop textures; never execute Workshop scripts.
export function createRezeScene(panel,stage){
  const canvas=document.createElement('canvas');canvas.className='agent-reze-canvas';canvas.hidden=true;
  canvas.setAttribute('aria-hidden','true');stage.querySelector('.agent-portrait').after(canvas);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let gl,program,frame=0,pending=false,ready=false,lost=false;
  const active=()=>stage.dataset.actor==='reze'&&!stage.classList.contains('agent-custom-art');
  const fragment=`precision highp float;
    varying vec2 uv;
    uniform sampler2D background,portrait,foliage,flow;
    uniform vec2 resolution;
    uniform float time,motion;
    void main(){
      vec2 size=vec2(2048.,1152.);
      float scale=max(resolution.x/size.x,resolution.y/size.y);
      vec2 pixel=(uv*resolution-(resolution-size*scale)*.5)/scale;
      vec4 base=texture2D(background,pixel/size);
      vec2 p=(pixel-vec2(481.01001,75.01501))/vec2(1110.,1077.);
      if(p.x<0.||p.x>1.||p.y<0.||p.y>1.){gl_FragColor=base;return;}
      vec2 displaced=p;
      if(motion>.5){
        float mask=texture2D(foliage,p).r;
        vec2 movement=(texture2D(flow,p).rg-vec2(.498))*2.;
        displaced+=movement*sin(time*1.75)*.01;
        float phase=dot(p,vec2(10.,5.));
        displaced+=vec2(sin(time*5.+phase)*.002,cos(time*2.5+phase)*.001)*mask;
      }
      vec4 figure=texture2D(portrait,clamp(displaced,0.,1.));
      gl_FragColor=vec4(mix(base.rgb,figure.rgb,figure.a),1.);
    }`;
  function shader(type,text){
    const s=gl.createShader(type);gl.shaderSource(s,text);gl.compileShader(s);
    if(!gl.getShaderParameter(s,gl.COMPILE_STATUS))throw Error('Scene shader failed');
    return s;
  }
  function draw(now=0){
    frame=0;
    if(!ready||lost||!active()||panel.hidden)return;
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.5);
    const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
    const animate=panel.classList.contains('agent-motion')&&!reduced.matches&&!document.hidden;
    gl.uniform2f(gl.getUniformLocation(program,'resolution'),width,height);
    gl.uniform1f(gl.getUniformLocation(program,'time'),now/1000);
    gl.uniform1f(gl.getUniformLocation(program,'motion'),animate?1:0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    if(animate)frame=requestAnimationFrame(draw);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;
    canvas.hidden=!active()||!ready||lost;
    stage.classList.toggle('agent-reze-scene-ready',!canvas.hidden);
    if(active()&&!panel.hidden&&!ready&&!pending&&!lost)void init();
    draw(performance.now());
  }
  async function init(){
    pending=true;
    try{
      gl=canvas.getContext('webgl',{alpha:false,antialias:false,premultipliedAlpha:false});
      if(!gl)return;
      const root='./assets/actors/reze/';
      const images=await Promise.all(['background.png','portrait.png','foliage-mask.png','flow-mask.png'].map(name=>new Promise((resolve,reject)=>{
        const im=new Image();im.onload=()=>resolve(im);im.onerror=reject;im.src=root+name;
      })));
      program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);gl_Position=vec4(pos,0.,1.);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Scene link failed');
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      images.forEach((im,i)=>{
        gl.activeTexture(gl.TEXTURE0+i);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
        for(const key of [gl.TEXTURE_MIN_FILTER,gl.TEXTURE_MAG_FILTER])gl.texParameteri(gl.TEXTURE_2D,key,gl.LINEAR);
        for(const key of [gl.TEXTURE_WRAP_S,gl.TEXTURE_WRAP_T])gl.texParameteri(gl.TEXTURE_2D,key,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,im);
        gl.uniform1i(gl.getUniformLocation(program,['background','portrait','foliage','flow'][i]),i);
      });
      if(gl.getError()!==gl.NO_ERROR)throw Error('Scene textures failed');
      ready=true;
    }catch{ready=false;}
    finally{pending=false;if(ready)sync();}
  }
  new MutationObserver(sync).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  new MutationObserver(sync).observe(stage,{attributes:true,attributeFilter:['data-actor','class']});
  new ResizeObserver(sync).observe(stage);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  canvas.addEventListener('webglcontextlost',e=>{e.preventDefault();lost=true;ready=false;sync();});
  canvas.addEventListener('webglcontextrestored',()=>{lost=false;sync();});
}
