// A feature owns its runtime. Removing it flushes work before releasing resources.
export class ModuleRegistry {
  constructor(definitions,contextFactory=()=>({}),{onChange=()=>{},persist=async()=>{}}={}){
    this.definitions=new Map();this.records=new Map();this.enabled=new Set();this.contextFactory=contextFactory;this.onChange=onChange;this.persist=persist;this.operation=Promise.resolve();
    for(const definition of definitions){
      if(!definition||!/^[a-z][a-z0-9-]*$/.test(definition.id)||this.definitions.has(definition.id)||typeof definition.create!=='function')throw Error('功能定义无效或标识重复。');
      this.definitions.set(definition.id,definition);this.enabled.add(definition.id);
    }
    for(const definition of definitions)for(const dep of definition.requires||[])if(!this.definitions.has(dep)||dep===definition.id)throw Error('功能依赖不存在或指向自身。');
    const visiting=new Set(),visited=new Set(),visit=id=>{if(visiting.has(id))throw Error('功能存在循环依赖。');if(visited.has(id))return;visiting.add(id);for(const dep of this.definitions.get(id).requires||[])visit(dep);visiting.delete(id);visited.add(id);};
    for(const id of this.definitions.keys())visit(id);
  }
  list(){return[...this.definitions.values()].filter(d=>this.enabled.has(d.id));}
  preferences(){return{version:1,disabled:[...this.definitions.values()].filter(d=>!d.required&&!this.enabled.has(d.id)).map(d=>d.id)};}
  async get(id){
    if(!this.enabled.has(id))throw Error('该功能已停用。');
    if(this.records.has(id))return this.records.get(id).promise;
    const definition=this.definitions.get(id);if(!definition)throw Error('功能不存在。');
    const record={runtime:null,context:null,promise:null};this.records.set(id,record);
    record.promise=(async()=>{try{
      for(const dep of definition.requires||[])await this.get(dep);
      record.context=this.contextFactory(definition);const runtime=await definition.create(record.context);
      if(!runtime||typeof runtime!=='object')throw Error('功能没有返回有效的接口。');
      record.runtime=runtime;return runtime;
    }catch(e){await record.context?.release?.();this.records.delete(id);throw e;}})();return record.promise;
  }
  async flush(){await this.operation;for(const record of this.records.values())await(await record.promise).flush?.();}
  async reset(){await this.flush();for(const record of this.records.values())await(await record.promise).reset?.();}
  serialize(fn){const result=this.operation.then(fn);this.operation=result.catch(()=>{});return result;}
  setEnabled(id,enabled){return this.serialize(async()=>{
    const definition=this.definitions.get(id);if(!definition)throw Error('功能不存在。');if(!enabled&&definition.required)throw Error('基础功能不能停用。');
    if(!enabled)for(const d of this.list())if((d.requires||[]).includes(id))throw Error('请先停用依赖此功能的“'+d.label+'”。');
    const next=new Set(this.enabled),add=id=>{next.add(id);for(const dep of this.definitions.get(id).requires||[])add(dep);};if(enabled)add(id);else next.delete(id);
    if(!enabled&&this.records.has(id))await(await this.records.get(id).promise).flush?.();
    await this.persist({version:1,disabled:[...this.definitions.values()].filter(d=>!d.required&&!next.has(d.id)).map(d=>d.id)});
    this.enabled=next;try{if(!enabled)await this.release(id);}finally{this.onChange();}
  });}
  async loadPreferences(value){
    const disabled=new Set(Array.isArray(value?.disabled)?value.disabled:[]),next=new Set([...this.definitions.values()].filter(d=>d.required||!disabled.has(d.id)).map(d=>d.id));
    const add=id=>{next.add(id);for(const dep of this.definitions.get(id).requires||[])add(dep);};for(const id of [...next])add(id);
    for(const id of this.enabled)if(!next.has(id)){if(this.records.has(id))await(await this.records.get(id).promise).flush?.();await this.release(id);}
    this.enabled=next;this.onChange();
  }
  async release(id){const record=this.records.get(id);if(!record)return;const runtime=await record.promise;try{await runtime.dispose?.();}finally{try{await record.context?.release?.();}finally{this.records.delete(id);}}}
  async dispose(){await this.flush();for(const id of [...this.records.keys()].reverse())await this.release(id);}
}
