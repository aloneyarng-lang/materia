export function rollDialogueChoices(random = Math.random) {
  return random() < .4;
}

const fallbackChoices = {
  'zh-CN': ['这个话题可以再多聊一点吗？', '能举个具体例子吗？', '我们换个话题吧。'],
  en: ['Can we talk a little more about this?', 'Could you give me a concrete example?', 'Let’s change the subject.'],
  ja: ['この話をもう少し聞かせてくれる？', '具体的な例を挙げてくれる？', '別の話題にしよう。'],
  de: ['Können wir noch etwas darüber reden?', 'Kannst du ein konkretes Beispiel geben?', 'Reden wir über etwas anderes.'],
};

export function dialogueChoices(value, locale) {
  try { return cleanChoices(value); }
  catch { return [...fallbackChoices[Object.hasOwn(fallbackChoices,locale) ? locale : 'zh-CN']]; }
}

export function choiceInstructions(offerChoice, pairedVoice) {
  if (!offerChoice) return '本轮只回答，不附加可点击的回复选项。用户明确要列出方案时，仍可在正文列出。';
  const format = pairedVoice ? '在最终 JSON 对象中加入 choices 数组。'
    : '把数组放在末尾独立一行 <materia_choices>["选项一","选项二","选项三"]</materia_choices> 中。';
  return '正常完成回答，再用相同语言提供三条简短、具体、方向不同的后续用户回复，每项不超过 120 字，不在正文中重复。' + format;
}

export function cleanChoices(value){
  if(!Array.isArray(value)||value.length!==3||value.some(item=>typeof item!=='string'||!item.trim()||item.length>120))throw Error('对话选项格式无效。');
  const choices=value.map(item=>item.trim());
  if(new Set(choices).size!==3)throw Error('对话选项须互不重复。');
  return choices;
}
export function readChoiceReply(text){
  const match=/\n<materia_choices>([\s\S]{0,2000})<\/materia_choices>\s*$/.exec(text);
  if(!match)return {answer:text};
  const answer=text.slice(0,match.index).trimEnd();
  if(!answer.trim())return {answer:text};
  try{return {answer,choices:cleanChoices(JSON.parse(match[1]))};}
  catch{return {answer};}
}
export const entryText=entry=>entry.content+(entry.choices?'\n\n可选回复\n'+entry.choices.map((text,i)=>(i+1)+'. '+text).join('\n'):'');

export function dialogueHistory(entries){
  const turns=[];
  let automatic=false;
  for(const entry of entries){
    if(entry.role==='error'){automatic=false;continue;}
    const line=entryText(entry);
    const continues=entry.role==='assistant'&&entry.automatic===true;
    if(automatic&&continues)turns.at(-1).content+='\n'+line;
    else turns.push({role:entry.role,content:line,...(continues?{automatic:true}:{})});
    automatic=continues;
  }
  return turns;
}
