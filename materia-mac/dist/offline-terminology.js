export const OFFLINE_DICTIONARY_LANGUAGES=Object.freeze({'zh-CN':'简体中文',en:'英语',ja:'日语',de:'德语'});

const rows=[
  ['alloy','合金','合金','Legierung'],
  ['material','材料','材料','Material'],
  ['property','性能；性质','特性；性質','Eigenschaft'],
  ['performance','性能','性能','Leistung'],
  ['strength','强度','強度','Festigkeit'],
  ['tensile strength','抗拉强度','引張強さ','Zugfestigkeit'],
  ['yield strength','屈服强度','降伏強さ','Streckgrenze'],
  ['compressive strength','抗压强度','圧縮強さ','Druckfestigkeit'],
  ['hardness','硬度','硬さ','Härte'],
  ['toughness','韧性','靭性','Zähigkeit'],
  ['ductility','延展性；延性','延性','Duktilität'],
  ['brittleness','脆性','脆性','Sprödigkeit'],
  ['elasticity','弹性','弾性','Elastizität'],
  ['plasticity','塑性','塑性','Plastizität'],
  ['fatigue','疲劳','疲労','Ermüdung'],
  ['fracture','断裂；破坏','破壊','Bruch'],
  ['crack','裂纹','亀裂','Riss'],
  ['corrosion','腐蚀','腐食','Korrosion'],
  ['conductivity','电导率；导热率','伝導率','Leitfähigkeit'],
  ['thermal conductivity','热导率','熱伝導率','Wärmeleitfähigkeit'],
  ['electrical conductivity','电导率','電気伝導率','elektrische Leitfähigkeit'],
  ['resistivity','电阻率','抵抗率','spezifischer Widerstand'],
  ['density','密度','密度','Dichte'],
  ['porosity','孔隙率','気孔率','Porosität'],
  ['viscosity','黏度','粘度','Viskosität'],
  ['stress','应力','応力','Spannung'],
  ['strain','应变','ひずみ','Dehnung'],
  ['modulus','模量','弾性率','Modul'],
  ["Young's modulus",'杨氏模量','ヤング率','Elastizitätsmodul'],
  ['shear modulus','剪切模量','せん断弾性率','Schubmodul'],
  ['bulk modulus','体积模量','体積弾性率','Kompressionsmodul'],
  ['grain','晶粒','結晶粒','Korn'],
  ['grain boundary','晶界','粒界','Korngrenze'],
  ['crystal','晶体','結晶','Kristall'],
  ['lattice','晶格','格子','Gitter'],
  ['phase','相','相','Phase'],
  ['microstructure','微观结构','微細組織','Mikrostruktur'],
  ['nanostructure','纳米结构','ナノ構造','Nanostruktur'],
  ['composite','复合材料','複合材料','Verbundwerkstoff'],
  ['polymer','聚合物；高分子','高分子','Polymer'],
  ['ceramic','陶瓷','セラミックス','Keramik'],
  ['metal','金属','金属','Metall'],
  ['semiconductor','半导体','半導体','Halbleiter'],
  ['electrode','电极','電極','Elektrode'],
  ['electrolyte','电解质','電解質','Elektrolyt'],
  ['battery','电池','電池','Batterie'],
  ['catalyst','催化剂','触媒','Katalysator'],
  ['adsorption','吸附','吸着','Adsorption'],
  ['diffusion','扩散','拡散','Diffusion'],
  ['oxidation','氧化','酸化','Oxidation'],
  ['reduction','还原','還元','Reduktion'],
  ['annealing','退火','焼鈍','Glühen'],
  ['sintering','烧结','焼結','Sintern'],
  ['quenching','淬火','焼入れ','Abschrecken'],
  ['coating','涂层','コーティング','Beschichtung'],
  ['substrate','基底；衬底','基板','Substrat'],
  ['interface','界面','界面','Grenzfläche'],
  ['surface','表面','表面','Oberfläche'],
  ['morphology','形貌；形态','形態','Morphologie'],
  ['composition','组成；成分','組成','Zusammensetzung'],
  ['structure','结构','構造','Struktur'],
  ['stability','稳定性','安定性','Stabilität'],
  ['degradation','降解；劣化','劣化','Degradation'],
  ['efficiency','效率','効率','Wirkungsgrad'],
  ['capacity','容量','容量','Kapazität'],
  ['voltage','电压','電圧','Spannung'],
  ['current','电流','電流','Strom'],
  ['resistance','电阻；阻力','抵抗','Widerstand'],
  ['sample','样品','試料','Probe'],
  ['specimen','试样；试件','試験片','Prüfkörper'],
  ['measurement','测量','測定','Messung'],
  ['uncertainty','不确定度','不確かさ','Messunsicherheit'],
  ['error','误差；错误','誤差','Fehler'],
  ['method','方法','方法','Methode'],
  ['result','结果','結果','Ergebnis'],
  ['discussion','讨论','考察','Diskussion'],
  ['conclusion','结论','結論','Schlussfolgerung'],
  ['evidence','证据','証拠','Evidenz'],
  ['hypothesis','假设','仮説','Hypothese'],
  ['mechanism','机制；机理','機構','Mechanismus'],
  ['experiment','实验','実験','Experiment'],
  ['temperature','温度','温度','Temperatur'],
  ['pressure','压力','圧力','Druck'],
  ['concentration','浓度','濃度','Konzentration'],
  ['solution','溶液','溶液','Lösung'],
  ['solvent','溶剂','溶媒','Lösungsmittel'],
  ['solute','溶质','溶質','gelöster Stoff'],
];

const ids=['en','zh-CN','ja','de'];
const entries=Object.freeze(rows.map((values,index)=>Object.freeze({id:'term-'+String(index+1).padStart(3,'0'),terms:Object.freeze(Object.fromEntries(ids.map((id,i)=>[id,Object.freeze(String(values[i]).split('；').map(value=>value.trim()).filter(Boolean))])))})));
const normalize=value=>String(value??'').normalize('NFKC').trim().toLocaleLowerCase().replace(/[‐‑‒–—−-]/g,' ').replace(/^[\s.,;:!?()[\]{}「」『』【】“”"'‘’]+|[\s.,;:!?()[\]{}「」『』【】“”"'‘’]+$/g,'').replace(/\s+/g,' ');
const index=new Map();
for(const entry of entries)for(const [language,terms]of Object.entries(entry.terms))for(const term of terms){const key=normalize(term);if(key&&!index.has(key))index.set(key,{entry,language,matched:term});}
function variants(value){
  const result=[value];
  if(/^[a-z][a-z -]{2,}$/i.test(value)){
    if(value.endsWith('ies'))result.push(value.slice(0,-3)+'y');
    if(value.endsWith('ing'))result.push(value.slice(0,-3),value.slice(0,-3)+'e');
    if(value.endsWith('ed'))result.push(value.slice(0,-2),value.slice(0,-1));
    if(value.endsWith('es'))result.push(value.slice(0,-2),value.slice(0,-1));
    if(value.endsWith('s'))result.push(value.slice(0,-1));
  }
  return [...new Set(result)];
}
export function lookupOfflineDictionary(text,targetLanguage='zh-CN'){
  if(!Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,targetLanguage))return{found:false,unsupported:true,targetLanguage};
  const query=normalize(text);if(!query||query.length>160)return{found:false,targetLanguage};
  let match;for(const value of variants(query)){match=index.get(value);if(match)break;}
  if(!match)return{found:false,targetLanguage,query};
  const translated=match.entry.terms[targetLanguage],translation=translated.join('；');
  return{found:true,id:match.entry.id,query,term:match.matched,sourceLanguage:match.language,targetLanguage,translation,terms:match.entry.terms};
}
export function searchOfflineDictionary(query='',targetLanguage='zh-CN',limit=60){
  if(!Object.hasOwn(OFFLINE_DICTIONARY_LANGUAGES,targetLanguage))return[];
  const needle=normalize(query),bounded=Math.max(1,Math.min(100,Number(limit)||60)),result=[];
  for(const entry of entries){
    const searchable=Object.values(entry.terms).flat().map(normalize);
    if(needle&&!searchable.some(term=>term.includes(needle)))continue;
    const source=needle?Object.entries(entry.terms).flatMap(([language,terms])=>terms.map(term=>({language,term,score:normalize(term)===needle?0:normalize(term).startsWith(needle)?1:2}))).filter(row=>normalize(row.term).includes(needle)).sort((a,b)=>a.score-b.score||a.term.length-b.term.length)[0]:{language:'en',term:entry.terms.en[0]};
    result.push({found:true,id:entry.id,term:source.term,sourceLanguage:source.language,targetLanguage,translation:entry.terms[targetLanguage].join('；'),terms:entry.terms});
    if(result.length>=bounded)break;
  }
  return result;
}
export const offlineDictionarySize=()=>entries.length;
