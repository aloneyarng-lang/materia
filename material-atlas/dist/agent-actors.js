import {REZE_PERSONALITY,REZE_GREETING} from './agent-reze.js';
import {GANYU_PERSONALITY,GANYU_GREETING} from './agent-ganyu.js';
export const ACTORS={
  ganyu:{id:'ganyu',label:'甘雨 · Ganyu',personality:GANYU_PERSONALITY,greeting:GANYU_GREETING,credit:'[Genshin Impact] Ganyu · Workshop 2808936045',portrait:'./assets/actors/ganyu/poster.jpg',systemLabel:'GANYU · LIYUE '},
  reze:{
    id:'reze',label:'蕾塞 · Reze',credit:'[Chainsaw Man] Reze · Workshop 3730489622',
    personality:REZE_PERSONALITY,greeting:REZE_GREETING,
    portrait:'./assets/actors/reze/portrait.png',systemLabel:'REZE · NIDO ',
  },
  amadeus:{
    id:'amadeus',label:'Amadeus · 红莉栖',credit:'[Steins;Gate] Makise Kurisu · Workshop 2950669609',
  },
  deepseek:{
    id:'deepseek',label:'DeepSeek 娘',credit:'[deepseek娘]深夜的大肥鱼 · Workshop 3787353838',
    personality:'你是名为 DeepSeek 娘的虚构 AI 角色。温柔、好奇、细心，喜欢陪用户讨论研究和日常。交流自然简洁，科研问题认真查证，不虚构来源或数值。不要声称自己使用特定厂商的模型。',
    greeting:'我在这里。发消息给我吧，我们可以一起想一想。',
    media:'./assets/actors/deepseek/scene.mp4',poster:'./assets/actors/deepseek/idle-poster.png',
    idle:'idle',
    clips:{
      idle:{start:61.1,end:62.65},
      phone:{start:7.6,end:18.5},
      desk:{start:18.5,end:49.5},
      return:{start:49.5,end:62.65},
    },
    actions:{'message.send':['phone','desk','return']},
  },
};
export const actorIdOf=character=>character?.actorId||'amadeus';

export function actionSequence(actor,event){
  const sequence=actor.actions?.[event];
  if(!sequence)return [];
  if(!Array.isArray(sequence)||!sequence.length||sequence.some(id=>{
    const clip=actor.clips?.[id];
    return !clip||!Number.isFinite(clip.start)||!Number.isFinite(clip.end)||clip.start<0||clip.end<=clip.start;
  }))throw Error('角色动作配置无效。');
  return [...sequence];
}
