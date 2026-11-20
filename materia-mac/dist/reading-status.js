export const READING_STATUSES=[
  {id:'unread',name:'未读',symbol:'⚪'},
  {id:'reading',name:'在读',symbol:'🟡'},
  {id:'studied',name:'精读',symbol:'🟢'},
  {id:'archived',name:'归档',symbol:'🟣'},
];
export const cleanReadingStatus=value=>READING_STATUSES.some(s=>s.id===value)?value:'unread';
export const readingStatusOf=paper=>cleanReadingStatus(paper?.readingStatus);
export const readingStatusInfo=paper=>READING_STATUSES.find(s=>s.id===readingStatusOf(paper));
export const readingStatusRank=paper=>READING_STATUSES.findIndex(s=>s.id===readingStatusOf(paper));
export function preserveReadingStatus(incoming,previous){
  if(incoming.readingStatus!==undefined)return {...incoming,readingStatus:cleanReadingStatus(incoming.readingStatus)};
  return previous?.readingStatus!==undefined?{...incoming,readingStatus:cleanReadingStatus(previous.readingStatus)}:incoming;
}
export function planReadingStatus(papers,ids,status){
  if(!READING_STATUSES.some(s=>s.id===status))throw Error('阅读状态无效。');
  if(!Array.isArray(ids)||!ids.length||ids.length>10000||ids.some(id=>typeof id!=='string'))throw Error('请选择要设置阅读状态的文献。');
  const selected=new Set(ids),existing=new Set(papers.map(p=>p.id));if([...selected].some(id=>!existing.has(id)))throw Error('部分文献已不存在，请刷新后重新选择。');
  const updates=papers.filter(p=>selected.has(p.id)&&readingStatusOf(p)!==status).map(p=>({...p,readingStatus:status}));return {updates,count:updates.length};
}
export function readingStatusCounts(papers){const counts=Object.fromEntries(READING_STATUSES.map(s=>[s.id,0]));for(const p of papers)counts[readingStatusOf(p)]++;return counts;}
