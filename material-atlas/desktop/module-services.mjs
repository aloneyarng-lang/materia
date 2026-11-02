export class DesktopModuleServices {
  constructor(definitions,root){this.root=root;this.definitions=new Map();this.instances=new Map();
    for(const d of definitions){if(!d||!/^[a-z][a-z0-9-]*$/.test(d.id)||this.definitions.has(d.id)||typeof d.create!=='function')throw Error('桌面功能定义无效。');this.definitions.set(d.id,d);}
  }
  async store(id){if(!this.definitions.has(id))throw Error('此功能没有注册本地服务。');
    if(!this.instances.has(id)){const root=this.root,promise=Promise.resolve().then(()=>this.definitions.get(id).create(root));this.instances.set(id,promise);promise.catch(()=>{if(this.instances.get(id)===promise)this.instances.delete(id);});}
    return this.instances.get(id);
  }
  async load(id){const store=await this.store(id);return{libraryKey:store.root,state:await store.load()};}
  async save(id,payload){const store=await this.store(id);if(!payload||payload.libraryKey!==this.root||store.root!==this.root)throw Error('文献库已切换，功能数据未写入其他文献库。');return store.save(payload.state);}
  register(handle){handle('modules:load',id=>this.load(id));handle('modules:save',({id,payload}={})=>this.save(id,payload));}
  async flush(){for(const promise of this.instances.values()){const store=await promise;await store.queue;}}
  async changeLibrary(root){await this.flush();this.root=root;this.instances.clear();}
}
