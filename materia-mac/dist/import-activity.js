import {t as tr,html,msg} from './i18n.js';
import {getLocale} from './i18n.js';
export function dayKey(value=Date.now()){
  const date=new Date(value);if(!Number.isFinite(date.getTime()))return '';
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,'0')}-${String(date.getDate()).padStart(2,'0')}`;
}
const validDay=key=>/^\d{4}-\d{2}-\d{2}$/.test(key)&&Number.isFinite(Date.parse(key+'T12:00:00Z'))&&new Date(key+'T12:00:00Z').toISOString().slice(0,10)===key;
export function cleanImportActivity(value){
  const days={};for(const [key,count]of Object.entries(value?.days||{})){if(validDay(key)&&Number.isSafeInteger(count)&&count>0)days[key]=Math.min(count,1000000);}
  const list=rows=>[...new Set((Array.isArray(rows)?rows:[]).filter(row=>typeof row==='string'&&row.length<=200))];
  return {version:1,days,seen:list(value?.seen),fingerprints:list(value?.fingerprints),...(value?.backfilled?{backfilled:true}:{})};
}
export function seedImportActivity(papers){
  const result=cleanImportActivity();result.backfilled=Boolean(papers.length);
  const fingerprints=new Set();for(const paper of papers){result.seen.push(paper.id);if(paper.fingerprint&&fingerprints.has(paper.fingerprint))continue;if(paper.fingerprint)fingerprints.add(paper.fingerprint);const date=dayKey(paper.addedAt);if(date&&Number(paper.addedAt)>0)result.days[date]=(result.days[date]||0)+1;}
  result.fingerprints=[...fingerprints];return result;
}
export function recordImports(value,papers,now=Date.now()){
  const result=cleanImportActivity(value),seen=new Set(result.seen),fingerprints=new Set(result.fingerprints),date=dayKey(now);
  for(const paper of papers){if(seen.has(paper.id))continue;seen.add(paper.id);if(paper.fingerprint&&fingerprints.has(paper.fingerprint))continue;if(paper.fingerprint)fingerprints.add(paper.fingerprint);result.days[date]=(result.days[date]||0)+1;}
  result.seen=[...seen];result.fingerprints=[...fingerprints];return result;
}
// Counts are historical events. Restoring a backup merges history, never counts a restore as today's imports.
export function mergeImportActivity(current,incoming,papers=[]){
  const a=cleanImportActivity(current),b=cleanImportActivity(incoming);
  for(const [date,count]of Object.entries(b.days))a.days[date]=Math.max(a.days[date]||0,count);
  a.seen=[...new Set([...a.seen,...b.seen,...papers.map(p=>p.id)])];a.fingerprints=[...new Set([...a.fingerprints,...b.fingerprints,...papers.map(p=>p.fingerprint).filter(Boolean)])];
  if(b.backfilled)a.backfilled=true;return a;
}
export function activityCalendar(activity,year=new Date().getFullYear(),now=Date.now()){
  const days=cleanImportActivity(activity).days,today=dayKey(now),first=new Date(Date.UTC(year,0,1)),last=new Date(Date.UTC(year,11,31)),cells=[];
  for(let i=0;i<first.getUTCDay();i++)cells.push(null);
  for(let date=first;date<=last;date=new Date(date.getTime()+86400000)){
    const key=date.toISOString().slice(0,10),count=days[key]||0,future=key>today;
    cells.push({date:key,count,month:date.getUTCMonth(),day:date.getUTCDate(),future,level:future?0:count>=10?4:count>=6?3:count>=3?2:count?1:0});
  }
  return {year,cells,total:cells.reduce((sum,c)=>sum+(c&&!c.future?c.count:0),0),activeDays:cells.filter(c=>c&&!c.future&&c.count).length};
}
export function activityHTML(activity,year=new Date().getFullYear()){
  const data=activityCalendar(activity,year),years=[...new Set([new Date().getFullYear(),...Object.keys(activity?.days||{}).map(k=>Number(k.slice(0,4)))])].sort((a,b)=>b-a);
  return html`<div class="activity-heading"><div><strong>导入记录</strong><p>${data.total} 篇 · ${data.activeDays} 个活跃日</p></div><select data-activity-year aria-label="导入记录年份">${years.map(y=>`<option ${y===year?'selected':''}>${y}</option>`).join('')}</select></div><div class="activity-scroll"><div class="activity-months" aria-hidden="true">${Array.from({length:12},(_,i)=>`<span>${new Intl.DateTimeFormat(getLocale(),{month:'short'}).format(new Date(2020,i,1))}</span>`).join('')}</div><div class="activity-calendar" aria-label="${year} 年每日导入记录">${data.cells.map(c=>!c?'<i class="activity-blank"></i>':html`<button type="button" class="activity-day" data-activity-date="${c.date}" data-level="${c.level}" ${c.future?'disabled':''} title="${c.date} · 导入 ${c.count} 篇" aria-label="${c.date}，导入 ${c.count} 篇"></button>`).join('')}</div></div><div class="activity-footer"><span data-activity-detail aria-live="polite">点击方块查看当天数量</span><span class="activity-legend">少 ${[0,1,2,3,4].map(i=>`<i data-level="${i}"></i>`).join('')} 多</span></div>${activity?.backfilled?tr('<small class="activity-note">早期记录根据原有录入时间补齐。</small>'):''}`;
}
