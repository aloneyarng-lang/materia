import {solveNaturalLayout} from './natural-layout.js';
self.onmessage=async event=>{
  self.postMessage({ready:true});
  try{const result=await solveNaturalLayout(event.data.input,event.data.options,{progress:progress=>self.postMessage({progress})});self.postMessage({result});}
  catch(error){self.postMessage({error:error.message});}
};
