export const predictionModule = {
  id:'prediction',label:'性能预测',title:'性能预测',icon:'chart',panelId:'prediction-workspace',bodyClass:'prediction-view',
  desktopStorage:true,storageKey:'predictionWorkspace',
  styles:[new URL('../prediction.css',import.meta.url).href],
  async create(context){
    const {createPredictionController}=await import('../prediction.js');
    const controller=createPredictionController({host:context.host,isReady:context.isReady,toast:context.toast,saveText:context.saveText,onCount:context.setCount,
      load:()=>context.services.load(),persist:payload=>context.services.save(payload)});
    return{render:()=>controller.show(),flush:()=>controller.flush(),reset:()=>controller.reset(),dispose:()=>controller.dispose()};
  },
};
