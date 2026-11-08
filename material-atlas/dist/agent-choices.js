export const CHOICE_INSTRUCTIONS='默认只回答，不附选项。问候、闲聊、事实问答、解释、翻译和已明确要做什么的请求，直接答完即可。只有用户明确要选项，或对话到了需要用户决定才能继续的分岔点，才给三个选项。后者须在正文最后明确问用户想选哪个方向。选项是三条简短、具体且不同的用户回复。格式为末尾独立一行 <materia_choices>["选项一","选项二","选项三"]</materia_choices>，每项不超过120字，不在正文重复。';

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
export function choiceReplyForQuestion(text,question){
  const result=readChoiceReply(text);
  if(!result.choices)return result;
  // Require either a request for alternatives or an actual decision question.
  const requested=/(?:给|列|提供|生成|设置|想要|需要|请给|请列).{0,18}(?:选项|选法|备选|方案供我选)|三选[一项]|下一步.{0,10}(?:怎么|做什么|选什么)|\b(?:give|offer|show|list)\b.{0,36}\b(?:options|choices|alternatives)\b/i.test(question);
  const lastLine=result.answer.trim().split(/\n+/).at(-1).slice(-240);
  const decision=/(?:你(?:想|希望|愿意|打算|更倾向)|请选择|要选).{0,40}(?:哪[个一条种项]|选.{0,10}方向|从.{0,18}开始)[^。！？?!]*[？?]$|\bwhich\b.{0,90}\b(?:option|direction|path|approach|one)\b[^?]*\?$/i.test(lastLine);
  return requested||decision?result:{answer:result.answer};
}
export const entryText=entry=>entry.content+(entry.choices?'\n\n可选回复\n'+entry.choices.map((text,i)=>(i+1)+'. '+text).join('\n'):'');
