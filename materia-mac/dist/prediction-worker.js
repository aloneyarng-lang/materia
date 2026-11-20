import {trainProperty} from './prediction-model.js';
self.onmessage=event=>{try{self.postMessage({model:trainProperty(event.data.workspace,event.data.options)});}catch(e){self.postMessage({error:e.message});}};
