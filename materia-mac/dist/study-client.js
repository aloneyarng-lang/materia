import {openDatabase,getSetting} from './storage.js';
import {cleanStudy,applyStudyOperation} from './study-model.js';
const native=globalThis.materiaDesktop;
export async function readStudy(){
  if(native){if(!native.studyRead)throw new Error('请关闭并重新打开新版 Materia，以启用翻译和生词本。');return native.studyRead();}
  const [preferences,vocabulary,cache]=await Promise.all(['translationPreferences','vocabulary','translationCache'].map(getSetting));
  return{libraryKey:'browser',...cleanStudy({preferences,vocabulary,cache})};
}
export async function updateStudy(libraryKey,operation){
  let result;
  if(native){if(!native.studyUpdate)throw new Error('请重新启动新版 Materia 后保存。');result=await native.studyUpdate({libraryKey,operation});}
  else{
    if(libraryKey!=='browser')throw new Error('文献库已切换，请重新打开。');
    const db=await openDatabase();
    result=await new Promise((resolve,reject)=>{
      const tx=db.transaction('settings','readwrite'),store=tx.objectStore('settings');
      const key={vocabulary:'vocabulary',cache:'translationCache',preferences:'translationPreferences'}[operation.kind];
      if(!key){tx.abort();reject(new Error('不支持的阅读辅助操作。'));return;}
      const request=store.get(key);let output;
      request.onsuccess=()=>{try{const settings={[key]:request.result?.value};output=applyStudyOperation(settings,operation);store.put({key,value:settings[key]});}catch(error){tx.abort();reject(error);}};
      tx.oncomplete=()=>resolve(output);tx.onerror=()=>reject(tx.error);tx.onabort=()=>reject(tx.error||new Error('保存失败，原记录已保留。'));
    });
  }
  window.dispatchEvent(new CustomEvent('materia-study-changed',{detail:{libraryKey,kind:operation.kind}}));return result;
}
export async function translationKey(paper,page,targetLanguage,sourceText){
  const data=new TextEncoder().encode(JSON.stringify([paper.id,paper.fingerprint||'',page,targetLanguage,sourceText]));
  return 'tx-'+Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
}
