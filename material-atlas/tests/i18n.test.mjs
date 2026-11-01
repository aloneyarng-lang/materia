import test from 'node:test';
import assert from 'node:assert/strict';
import {MESSAGES} from '../dist/locales.js';
import {GERMAN_MESSAGES} from '../dist/locales-de.js';
import {LANGUAGES,normalizeLocale,getLocale,setLocale,t,msg} from '../dist/i18n.js';
import {axisLabel} from '../dist/parameters.js';

test('four complete language catalogs use stable locale identifiers and safe fallback',async()=>{
  assert.deepEqual(LANGUAGES.map(row=>row.id),['zh-CN','en','ja','de']);
  assert.equal(normalizeLocale('invalid'),'zh-CN');
  for(const [source,translations]of Object.entries(MESSAGES)){
    assert.ok(source.trim());assert.equal(translations.length,2);
    for(const value of translations)assert.ok(typeof value==='string'&&value.trim(),source);
    assert.ok(GERMAN_MESSAGES[source]?.trim(),'Missing German: '+source);
    assert.deepEqual((GERMAN_MESSAGES[source].match(/\{\d+\}/g)||[]).sort(),(translations[0].match(/\{\d+\}/g)||[]).sort(),source);
  }
  assert.deepEqual(Object.keys(GERMAN_MESSAGES).sort(),Object.keys(MESSAGES).sort());
  for(const [locale,settings,save]of [['zh-CN','设置','保存'],['en','Settings','Save'],['ja','設定','保存'],['de','Einstellungen','Speichern']]){
    await setLocale(locale,{persist:false});assert.equal(t('设置'),settings);assert.equal(t('保存'),save);
  }
  await setLocale('invalid',{persist:false});assert.equal(getLocale(),'zh-CN');
});

test('translation only looks up developer fragments and keeps interpolated user data literal',async()=>{
  await setLocale('en',{persist:false});
  assert.equal(axisLabel('year',[]),'Publication year');
  assert.equal(axisLabel('m:custom',[{key:'custom',name:'设置',unit:'MPa'}]),'设置 (MPa)');
  assert.equal(msg`材料 ${'设置 <img src=x> 保存'}`,'Material 设置 <img src=x> 保存');
  assert.equal(t('Unregistered message'),'Unregistered message');
  await setLocale('ja',{persist:false});
  assert.equal(msg`材料 ${'设置'}`,'材料 设置');
  await setLocale('de',{persist:false});
  assert.equal(axisLabel('year',[]),'Erscheinungsjahr');
  assert.equal(msg`第 ${3} 页 · ${'设置'}`,'Seite 3 · 设置');
  assert.equal(msg`材料 ${'Einstellungen <img src=x> 保存'}`,'Material Einstellungen <img src=x> 保存');
  await setLocale('zh-CN',{persist:false});
});

test('language writes precede UI changes and failed writes keep the active preference',async()=>{
  const values=new Map();globalThis.localStorage={getItem:key=>values.get(key),setItem:(key,value)=>values.set(key,value)};
  await setLocale('en');assert.equal(values.get('materia.interface-language'),'en');
  globalThis.materiaDesktop={setLocale:async()=>{throw Error('simulated preference failure');}};
  await assert.rejects(setLocale('de'),/simulated preference failure/);assert.equal(getLocale(),'en');
  delete globalThis.materiaDesktop;delete globalThis.localStorage;await setLocale('zh-CN',{persist:false});
});
