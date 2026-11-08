// Browser rendering of the supplied Workshop scene's original textures and motion masks.
import {blinkAt} from './agent-motion.js';
export function createAgentWallpaper(panel,stage) {
  const canvas=document.createElement('canvas');canvas.className='agent-effect-canvas';canvas.hidden=true;
  canvas.setAttribute('aria-hidden','true');stage.querySelector('.agent-portrait').after(canvas);
  const reduced=matchMedia('(prefers-reduced-motion: reduce)');
  let gl,program,frame=0,loaded=false,lost=false,started=false;
  const root='./assets/amadeus/workshop-2950669609/';
  const textures=['portrait.png','waterwaves_mask_a5cf2269.png','waterwaves_mask_2fdc0a5c.png',
    'shake_mask_cc4f2efb.png','shake_mask_91b2f293.png','closed-eyes.png'];
  const fragment=`precision highp float;
    varying vec2 uv;
    uniform sampler2D image,hair,coat,breath,head,closedEyes;
    uniform float time,motion,blink;
    vec4 eyelidLayer(vec4 base,vec2 p,vec2 center,vec2 radius,float line,vec2 alignment,float closing){
      vec2 local=(p-center)/radius;
      float distance=dot(local,local);
      if(distance>=1.||closing<=0.)return base;
      float edge=mix(center.y-radius.y-.003,line,closing);
      float coverage=(1.-smoothstep(.75,1.,distance))*(1.-smoothstep(edge-.0015,edge+.0015,p.y));
      vec2 sampleUV=p+alignment+vec2(0.,line-edge);
      vec3 lid=texture2D(closedEyes,sampleUV).rgb;
      return vec4(mix(base.rgb,lid,coverage),base.a);
    }
    void main(){
      if(motion<.5){gl_FragColor=texture2D(image,uv);return;}
      vec2 p=uv;
      float h=texture2D(hair,uv).r,c=texture2D(coat,uv).r;
      vec2 flow=(texture2D(breath,uv).rg-vec2(.498))*2.;
      vec2 headFlow=(texture2D(head,uv).rg-vec2(.498))*2.;
      p+=flow*sin(time*1.55)*.004761;
      p+=headFlow*sin(time*1.1)*.003;
      p+=vec2(-.00037,.00488)*sin(time*1.6+dot(uv,vec2(-.997,-.074))*4.96)*h;
      p+=vec2(-.00037,.00156)*sin(time*4.2+dot(uv,vec2(-.972,-.236))*4.96)*c;
      float closing=clamp((blink+1.)*.5,0.,1.);
      vec4 color=texture2D(image,p);
      color=eyelidLayer(color,p,vec2(.457,.198),vec2(.043,.024),.210,vec2(-.001,0.),closing);
      color=eyelidLayer(color,p,vec2(.573,.210),vec2(.041,.024),.221,vec2(.004,-.0015),closing);
      gl_FragColor=color;
    }`;
  function shader(type,source){
    const value=gl.createShader(type);gl.shaderSource(value,source);gl.compileShader(value);
    if(!gl.getShaderParameter(value,gl.COMPILE_STATUS))throw Error('Wallpaper shader compilation failed');
    return value;
  }
  function draw(now=0){
    frame=0;
    if(!loaded||lost||panel.hidden||stage.dataset.actor==='deepseek'||stage.classList.contains('agent-custom-art'))return;
    const animate=panel.classList.contains('agent-motion')&&!reduced.matches&&!document.hidden;
    const rect=canvas.getBoundingClientRect(),ratio=Math.min(devicePixelRatio||1,1.25);
    const width=Math.max(1,Math.round(rect.width*ratio)),height=Math.max(1,Math.round(rect.height*ratio));
    if(canvas.width!==width||canvas.height!==height){canvas.width=width;canvas.height=height;gl.viewport(0,0,width,height);}
    gl.uniform1f(gl.getUniformLocation(program,'time'),animate?now/1000:0);
    gl.uniform1f(gl.getUniformLocation(program,'motion'),animate?1:0);
    gl.uniform1f(gl.getUniformLocation(program,'blink'),animate?blinkAt(now/1000):0);
    gl.drawArrays(gl.TRIANGLE_STRIP,0,4);
    if(animate)frame=requestAnimationFrame(draw);
  }
  function sync(){
    cancelAnimationFrame(frame);frame=0;
    canvas.hidden=!loaded||lost||stage.dataset.actor==='deepseek'||stage.classList.contains('agent-custom-art');
    stage.classList.toggle('agent-wallpaper-ready',!canvas.hidden);
    draw(performance.now());
  }
  async function init(){
    try{
      gl=canvas.getContext('webgl',{alpha:true,premultipliedAlpha:false,antialias:false});
      if(!gl)return;
      const images=await Promise.all(textures.map(name=>new Promise((resolve,reject)=>{
        const image=new Image();image.onload=()=>resolve(image);image.onerror=reject;image.src=root+name;
      })));
      program=gl.createProgram();
      gl.attachShader(program,shader(gl.VERTEX_SHADER,'attribute vec2 pos;varying vec2 uv;void main(){uv=vec2((pos.x+1.)*.5,(1.-pos.y)*.5);gl_Position=vec4(pos,0.,1.);}'));
      gl.attachShader(program,shader(gl.FRAGMENT_SHADER,fragment));gl.linkProgram(program);
      if(!gl.getProgramParameter(program,gl.LINK_STATUS))throw Error('Wallpaper shader linking failed');
      gl.useProgram(program);
      const buffer=gl.createBuffer();gl.bindBuffer(gl.ARRAY_BUFFER,buffer);
      gl.bufferData(gl.ARRAY_BUFFER,new Float32Array([-1,-1,1,-1,-1,1,1,1]),gl.STATIC_DRAW);
      const position=gl.getAttribLocation(program,'pos');gl.enableVertexAttribArray(position);gl.vertexAttribPointer(position,2,gl.FLOAT,false,0,0);
      const names=['image','hair','coat','breath','head','closedEyes'];
      images.forEach((image,index)=>{
        let source=image;
        if(index===0&&image.height>2048){
          const scaled=document.createElement('canvas');scaled.height=2048;scaled.width=Math.round(image.width*2048/image.height);
          const context=scaled.getContext('2d');context.imageSmoothingQuality='high';context.drawImage(image,0,0,scaled.width,scaled.height);source=scaled;
        }
        gl.activeTexture(gl.TEXTURE0+index);gl.bindTexture(gl.TEXTURE_2D,gl.createTexture());
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MIN_FILTER,gl.LINEAR);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_MAG_FILTER,gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_S,gl.CLAMP_TO_EDGE);gl.texParameteri(gl.TEXTURE_2D,gl.TEXTURE_WRAP_T,gl.CLAMP_TO_EDGE);
        gl.texImage2D(gl.TEXTURE_2D,0,gl.RGBA,gl.RGBA,gl.UNSIGNED_BYTE,source);
        gl.uniform1i(gl.getUniformLocation(program,names[index]),index);
      });
      if(gl.getError()!==gl.NO_ERROR)throw Error('Wallpaper textures unavailable');
      loaded=true;lost=false;sync();
    }catch{loaded=false;sync();}
  }
  new MutationObserver(()=>{
    if(!started&&!panel.hidden&&stage.dataset.actor!=='deepseek'){started=true;init();}
    sync();
  }).observe(panel,{attributes:true,attributeFilter:['hidden','class']});
  new MutationObserver(records=>{
    if(records.some(r=>r.attributeName==='data-actor'||r.oldValue?.includes('agent-custom-art')!==stage.classList.contains('agent-custom-art'))){
      if(!started&&!panel.hidden&&stage.dataset.actor!=='deepseek'){started=true;init();}sync();
    }
  }).observe(stage,{attributes:true,attributeFilter:['class','data-actor'],attributeOldValue:true});
  new ResizeObserver(sync).observe(stage);
  document.addEventListener('visibilitychange',sync);reduced.addEventListener('change',sync);
  canvas.addEventListener('webglcontextlost',event=>{event.preventDefault();lost=true;sync();});
  canvas.addEventListener('webglcontextrestored',()=>{loaded=false;init();});
  if(!panel.hidden){started=true;init();}
}
