import { writeFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const clamp=value=>Math.max(0,Math.min(1,value));
const mix=(a,b,t)=>a.map((value,index)=>Math.round(value+(b[index]-value)*t));
const over=(under,overColor,alpha)=>mix(under,overColor,clamp(alpha));
const roundedDistance=(x,y,half,radius)=>{
  const qx=Math.abs(x)-half+radius,qy=Math.abs(y)-half+radius;
  return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-radius;
};
const coverage=(distance,width,feather)=>clamp((width+feather-distance)/(2*feather));

// Same round-capped rays as the SVG, in its 512-unit viewBox.
const markCenter=[248,258];
const rays = [
  [228, 232, 226, 123], [250, 225, 314, 150],
  [279, 246, 379, 272], [279, 269, 332, 351],
  [262, 288, 243, 389], [236, 289, 151, 338],
  [217, 270, 114, 243], [216, 248, 156, 166],
];

function markCoverage(x,y) {
  let distance=Math.abs(Math.hypot(x-markCenter[0],y-markCenter[1])-33);
  for(const [startX,startY,endX,endY] of rays){
    const dx=endX-startX,dy=endY-startY;
    const along=clamp(((x-startX)*dx+(y-startY)*dy)/(dx*dx+dy*dy));
    distance=Math.min(distance,Math.hypot(x-startX-along*dx,y-startY-along*dy));
  }
  const satellite=Math.hypot(x-372,y-191);
  return Math.max(coverage(distance,13,1),coverage(satellite,18,1));
}

export async function makeIcon() {
  const sizes=[16,32,48,256],images=[];
  for(const size of sizes){
    const samples=size<=32?6:4,pixels=Buffer.alloc(size*size*4),mask=Buffer.alloc(Math.ceil(size/32)*4*size);
    // Keep the small hollow centered on a pixel rather than split between four.
    const unit=512/size;
    const [offsetX,offsetY]=size<=32
      ? markCenter.map(value=>value-(Math.floor(value/unit)+.5)*unit)
      : [0,0];
    for(let y=0;y<size;y++)for(let x=0;x<size;x++){
      const accumulated=[0,0,0,0];
      for(let sy=0;sy<samples;sy++)for(let sx=0;sx<samples;sx++){
        const u=(x+(sx+.5)/samples)/size-.5,v=(y+(sy+.5)/samples)/size-.5;
        const edge=roundedDistance(u,v,240/512,112/512),inside=coverage(edge,0,.006);
        if(!inside)continue;
        let color=mix([239,154,126],[217,119,87],clamp((v*512+240)/480));
        const border=coverage(Math.abs(edge+1/512),1/512,.001);
        color=over(color,[255,255,255],border*.24);
        color=over(color,[255,255,255],markCoverage((u+.5)*512+offsetX,(v+.5)*512+offsetY));
        accumulated[0]+=color[0]*inside;accumulated[1]+=color[1]*inside;accumulated[2]+=color[2]*inside;accumulated[3]+=255*inside;
      }
      const total=samples*samples,i=((size-y-1)*size+x)*4;
      if(accumulated[3]){
        const weight=accumulated[3]/255;
        pixels[i]=Math.round(accumulated[2]/weight);
        pixels[i+1]=Math.round(accumulated[1]/weight);
        pixels[i+2]=Math.round(accumulated[0]/weight);
        pixels[i+3]=Math.round(accumulated[3]/total);
      }
    }
    const header=Buffer.alloc(40);header.writeUInt32LE(40,0);header.writeInt32LE(size,4);header.writeInt32LE(size*2,8);header.writeUInt16LE(1,12);header.writeUInt16LE(32,14);header.writeUInt32LE(pixels.length,20);
    images.push(Buffer.concat([header,pixels,mask]));
  }
  const directory=Buffer.alloc(6+sizes.length*16);directory.writeUInt16LE(1,2);directory.writeUInt16LE(sizes.length,4);
  let offset=directory.length;
  sizes.forEach((size,index)=>{const base=6+index*16;directory[base]=size===256?0:size;directory[base+1]=size===256?0:size;directory.writeUInt16LE(1,base+4);directory.writeUInt16LE(32,base+6);directory.writeUInt32LE(images[index].length,base+8);directory.writeUInt32LE(offset,base+12);offset+=images[index].length;});
  const target=path.join(path.dirname(fileURLToPath(import.meta.url)),'materia.ico');
  await writeFile(target,Buffer.concat([directory,...images]));return target;
}
