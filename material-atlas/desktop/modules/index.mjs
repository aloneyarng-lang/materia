// Optional desktop services are loaded only when requested by an enabled feature.
export const DESKTOP_MODULES=[{
  id:'prediction',
  async create(root){const {PredictionFile}=await import('../prediction-store.mjs');return new PredictionFile(root);},
}];
