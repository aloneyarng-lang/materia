export const pitchNames:string[]
export const presets:Record<string,number[]>
export function remapPitch(p:number,root:number,scale:number[],tweaks:number[]):number
export function guessKey(notes:{pitch:number,beats:number}[]):{root:number,mode:number,score:number}|null
