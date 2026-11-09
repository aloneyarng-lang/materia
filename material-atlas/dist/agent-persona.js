import {kurisuPrompt} from './agent-kurisu.js';
import {rezePrompt} from './agent-reze.js';
import {characterIdFor,REZE_ID,GANYU_ID} from './agent-character-memory.js';
import {ganyuPrompt} from './agent-ganyu.js';
export const hasCharacterMemory=character=>Boolean(characterIdFor(character));
export const supportsAutomaticDialogue=character=>['amadeus','reze','ganyu'].includes(character?.actorId||'amadeus');
export function characterPersona(character,options){
  if(characterIdFor(character)===GANYU_ID)return ganyuPrompt(character,options);
  return characterIdFor(character)===REZE_ID?rezePrompt(character,options):kurisuPrompt(character,options);
}
