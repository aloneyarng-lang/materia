// Isolated browser profile with synthetic data; never touches the live library.
const fs=require('node:fs/promises'),path=require('node:path'),assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const {chromium}=require(process.env.MATERIA_PLAYWRIGHT||path.join(process.env.USERPROFILE,'.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright'));
const root=path.resolve(__dirname,'..'),output=path.join(root,'.local/i18n-verification');
function syntheticPDF(){
  const stream='BT /F1 16 Tf 72 740 Td (Language test paper) Tj ET';
  const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R] /Count 1 >>','<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>','<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>',`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`];
  let text='%PDF-1.4\n';const offsets=[];objects.forEach((object,index)=>{offsets.push(text.length);text+=`${index+1} 0 obj\n${object}\nendobj\n`;});
  const xref=text.length;text+='xref\n0 6\n0000000000 65535 f \n'+offsets.map(offset=>String(offset).padStart(10,'0')+' 00000 n \n').join('');
  return text+`trailer\n<< /Size 6 /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
}
let server,browser,page;const errors=[],checks=[];
const click=selector=>page.locator(selector).first().evaluate(node=>node.click());
async function chineseText(selector){return page.locator(selector).evaluate(root=>{const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT),result=[];let node;while(node=walker.nextNode())if(/[\u3400-\u9fff]/.test(node.data)&&node.parentElement?.checkVisibility({checkVisibilityCSS:true}))result.push(node.data.trim());return result;});}
async function check(name,run){await run();checks.push(name);console.log('PASS '+name);}
async function settings(){await click('[data-action="settings"]');await page.locator('#interface-language').waitFor();}
async function language(locale){await page.selectOption('#interface-language',locale);await page.waitForFunction(locale=>document.documentElement.lang===locale,locale);await page.waitForFunction(()=>!document.querySelector('#interface-language')?.disabled);}
(async()=>{
  await fs.mkdir(output,{recursive:true});
  const {createPreviewServer}=await import(pathToFileURL(path.join(root,'server.mjs')).href);server=createPreviewServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
  browser=await chromium.launch({headless:true,executablePath:process.env.MATERIA_CHROME||path.join(process.env.ProgramFiles,'Google/Chrome/Application/chrome.exe')});
  page=await browser.newPage({viewport:{width:1440,height:980}});page.on('pageerror',error=>errors.push(error.message));
  const url=`http://127.0.0.1:${server.address().port}`;await page.goto(url);await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);
  await check('Chinese default and keyboard-accessible four-language setting',async()=>{
    assert.equal(await page.getAttribute('html','lang'),'zh-CN');await settings();
    assert.deepEqual(await page.locator('#interface-language option').allTextContents(),['简体中文','English','日本語','Deutsch']);
    await page.locator('#interface-language').focus();assert.equal(await page.locator('#interface-language').evaluate(node=>node===document.activeElement),true);
  });
  await check('English applies immediately to static markup, live text, filters, and settings',async()=>{
    await language('en');assert.equal(await page.locator('#modal h2').textContent(),'Settings');
    assert.equal(await page.locator('[data-view="notes"]').textContent(),'Notes');
    assert.match(await page.locator('#reading-status-filter').textContent(),/Unread/);
    assert.equal(await page.locator('#search').getAttribute('placeholder'),'Titles, #tags, note content…');
    await page.screenshot({path:path.join(output,'settings-en.png')});
  });
  await check('Japanese applies immediately and browser preference survives reload',async()=>{
    await language('ja');assert.equal(await page.locator('#modal h2').textContent(),'設定');
    assert.equal(await page.locator('[data-view="notes"]').textContent(),'ノート');
    await page.reload();await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);
    assert.equal(await page.getAttribute('html','lang'),'ja');await settings();assert.equal(await page.inputValue('#interface-language'),'ja');
    await page.screenshot({path:path.join(output,'settings-ja.png')});
  });
  await check('German applies immediately to controls, filters and settings and survives reload',async()=>{
    await language('de');assert.equal(await page.locator('#modal h2').textContent(),'Einstellungen');
    assert.equal(await page.locator('[data-view="notes"]').textContent(),'Notizen');
    assert.match(await page.locator('#reading-status-filter').textContent(),/Ungelesen/);
    assert.equal(await page.locator('#search').getAttribute('placeholder'),'Titel, #Tags, Notizinhalte…');
    assert.deepEqual(await chineseText('#modal'),[]);await page.screenshot({path:path.join(output,'settings-de.png')});
    await page.reload();await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);
    assert.equal(await page.getAttribute('html','lang'),'de');await settings();assert.equal(await page.inputValue('#interface-language'),'de');
  });
  await check('User titles, groups, material names, and notes matching UI keys remain unchanged',async()=>{
    await click('#modal [data-action="close-modal"]');
    await page.evaluate(async pdf=>{
      const s=await import('./storage.js');
      await s.putPaper({id:'i18n-paper',title:'设置',authors:'保存',tags:['翻译'],year:'2026',addedAt:Date.now(),collection:'i18n-group',filename:'language-test.pdf',file:new File([pdf],'language-test.pdf',{type:'application/pdf'}),materials:[{id:'m',name:'设置',composition:'FeNi',measurements:[{id:'r',name:'Strength',value:100,unit:'MPa',sample:'保存',conditions:'RT'}]}]});
      await s.setSetting('collections',[{id:'i18n-group',name:'保存',color:'#228888'}]);
      await s.setSetting('notes',{'paper:i18n-paper':[{id:'n',body:'翻译 设置 保存',createdAt:Date.now(),updatedAt:Date.now()}]});
    },syntheticPDF());
    await page.reload();await page.waitForFunction(()=>!document.querySelector('.import-main').disabled);
    await settings();await language('en');await click('#modal [data-action="close-modal"]');
    await page.locator('[data-view="list"]').click();assert.match(await page.locator('#paper-list').textContent(),/设置/);
    assert.match(await page.locator('#detail-panel').textContent(),/翻译 设置 保存/);
    await page.locator('[data-view="materials"]').click();assert.match(await page.locator('#material-list').textContent(),/设置/);
    const data=await page.evaluate(async()=>{const s=await import('./storage.js');return{papers:await s.getPapers(),notes:await s.getSetting('notes'),groups:await s.getSetting('collections')};});
    assert.equal(data.papers[0].title,'设置');assert.equal(data.groups[0].name,'保存');assert.equal(data.notes['paper:i18n-paper'][0].body,'翻译 设置 保存');
  });
  await check('Library dialogs, notes, material editor, and canvas use active language',async()=>{
    await click('[data-action="import"]');assert.equal(await page.locator('#modal h2').textContent(),'Batch import papers');await click('#modal [data-action="close-modal"]');
    await click('[data-action="themes"]');assert.equal(await page.locator('#modal h2').textContent(),'Theme and fonts');assert.deepEqual(await chineseText('#modal'),[]);await page.screenshot({path:path.join(output,'themes-en.png')});await click('#modal [data-action="close-modal"]');
    await page.locator('[data-view="notes"]').click();assert.match(await page.locator('#notes-library').textContent(),/翻译 设置 保存/);
    await click('[data-action="research-canvas"]');await page.locator('#rc-name').waitFor();
    assert.equal(await page.locator('#rc-name').getAttribute('placeholder'),'Canvas name');
    assert.equal(await page.locator('[data-rc-action="toggle-library"]').textContent(),'Canvas list');
    assert.equal(await page.locator('[data-rc-action="close"]').textContent(),'Back to library');
    await page.screenshot({path:path.join(output,'canvas-en.png')});await click('[data-rc-action="close"]');
  });
  await check('Persistent AI controls change language without discarding a question draft',async()=>{
    await click('[data-action="ai-agent"]');await page.locator('#agent-question').fill('设置 保存 用户草稿');
    for(const [locale,title]of [['ja','AI研究アシスタント'],['de','KI-Forschungsassistent'],['zh-CN','AI 研究助手'],['en','AI research assistant']]){
      await page.evaluate(async locale=>{await(await import('./i18n.js')).setLocale(locale);},locale);
      assert.equal(await page.locator('.agent-header h2').textContent(),title);
      assert.equal(await page.inputValue('#agent-question'),'设置 保存 用户草稿');
    }
    await click('[data-agent-action="close"]');
  });
  await check('English PDF reader renders, retains annotation drafts, and keeps translation target independent',async()=>{
    await page.locator('[data-view="list"]').click();await click('[data-action="open-pdf"]');
    await page.waitForFunction(()=>document.querySelector('.reader-page[data-rendered="true"]'));
    assert.equal(await page.locator('#reader-flow option[value="vertical"]').textContent(),'Continuous down');
    assert.match(await page.locator('#reader-layout').textContent(),/Single page/);
    assert.equal(await page.locator('#pdf-reader .reader-header h2').textContent(),'设置');
    await click('[data-reader-action="new-note"]');await page.locator('#reader-note-body').fill('设置 保存 翻译 用户批注草稿');
    await page.evaluate(async()=>{await(await import('./i18n.js')).setLocale('ja');});
    assert.equal(await page.inputValue('#reader-note-body'),'设置 保存 翻译 用户批注草稿');
    assert.equal(await page.inputValue('#reader-translation-language'),'zh-CN');
    await page.evaluate(async()=>{await(await import('./i18n.js')).setLocale('en');});
    await page.screenshot({path:path.join(output,'reader-en.png')});
    await click('[data-reader-action="close"]');await page.waitForFunction(()=>!document.querySelector('#pdf-reader').open);
  });
  await check('German research tools and reader preserve user text and independent AI translation language',async()=>{
    await settings();await language('de');await click('#modal [data-action="close-modal"]');
    await click('[data-action="import"]');assert.equal(await page.locator('#modal h2').textContent(),'Publikationen gesammelt importieren');await click('#modal [data-action="close-modal"]');
    await click('[data-action="themes"]');assert.equal(await page.locator('#modal h2').textContent(),'Design und Schriftarten');assert.deepEqual(await chineseText('#modal'),[]);await page.screenshot({path:path.join(output,'themes-de.png')});await click('#modal [data-action="close-modal"]');
    await page.locator('[data-view="notes"]').click();assert.match(await page.locator('#notes-library').textContent(),/翻译 设置 保存/);
    await click('[data-action="research-canvas"]');await page.locator('#rc-name').waitFor();assert.equal(await page.locator('#rc-name').getAttribute('placeholder'),'Canvas-Name');assert.equal(await page.locator('[data-rc-action="toggle-library"]').textContent(),'Canvas-Liste');await page.screenshot({path:path.join(output,'canvas-de.png')});await click('[data-rc-action="close"]');
    await page.locator('[data-view="list"]').click();await click('[data-action="open-pdf"]');await page.waitForFunction(()=>document.querySelector('.reader-page[data-rendered="true"]'));
    assert.equal(await page.locator('#reader-flow option[value="vertical"]').textContent(),'Fortlaufend nach unten');assert.match(await page.locator('#reader-layout').textContent(),/Einzelseite/);
    assert.equal(await page.locator('#pdf-reader .reader-header h2').textContent(),'设置');assert.equal(await page.inputValue('#reader-translation-language'),'zh-CN');
    assert.ok(await page.locator('#reader-flow').evaluate(node=>node.getBoundingClientRect().width)>=185);
    const collisions=await page.locator('.reader-note-tabs button').evaluateAll(nodes=>{const rects=nodes.map(node=>node.getBoundingClientRect());return rects.some((a,i)=>rects.slice(i+1).some(b=>a.left<b.right-1&&a.right>b.left+1&&a.top<b.bottom-1&&a.bottom>b.top+1));});assert.equal(collisions,false);
    await page.screenshot({path:path.join(output,'reader-de.png')});
    await page.setViewportSize({width:1000,height:900});await page.waitForFunction(()=>!document.querySelector('#pdf-reader').dataset.rendering);
    assert.equal(await page.locator('#pdf-reader').evaluate(node=>node.scrollWidth>node.clientWidth),false);
    await page.screenshot({path:path.join(output,'reader-de-1000.png')});
    await click('[data-reader-action="close"]');await page.waitForFunction(()=>!document.querySelector('#pdf-reader').open);await page.setViewportSize({width:1440,height:980});
  });
  await check('Repeated changes preserve user input and do not overflow at desktop widths',async()=>{
    await page.locator('#search').fill('设置');
    for(const locale of ['ja','zh-CN','en','de','ja','de']){await settings();await language(locale);await click('#modal [data-action="close-modal"]');assert.equal(await page.inputValue('#search'),'设置');}
    for(const width of [1000,1440]){await page.setViewportSize({width,height:900});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth),false);}
    const leaked=await page.evaluate(()=>document.body.innerHTML.includes('__materia_i18n_slot_'));assert.equal(leaked,false);
  });
  assert.deepEqual(errors,[]);await fs.writeFile(path.join(output,'report.json'),JSON.stringify({checks,errors},null,2));
})().catch(async error=>{console.error(error);console.error('Browser errors:',errors);if(page)console.error('Storage status:',await page.locator('.storage-error').allTextContents().catch(()=>[]));process.exitCode=1;}).finally(async()=>{await browser?.close();await new Promise(resolve=>server?server.close(resolve):resolve());});
