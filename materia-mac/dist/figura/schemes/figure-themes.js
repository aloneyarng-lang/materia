// Themes keep the figure on white paper. Series and numeric scales have separate colors.
export const FIGURE_THEMES = [
  {
    id:'okabe-ito', label:'色觉友好 · 冈部–伊藤',
    series:['#0072B2','#D55E00','#009E73','#CC79A7','#E69F00','#56B4E9','#000000','#F0E442'],
    ramp:['#F0F8FB','#B1D5E5','#4A95B9','#10577F','#08334F'],
    ink:'#202124', axis:'#333537', highlight:'#9F4000',
  },
  {
    id:'ocean-copper', label:'海蓝铜橙',
    series:['#225883','#B4552B','#2F7A70','#785C9B','#8B6B23','#A94D67','#536878'],
    ramp:['#F2F7FB','#BDD5E6','#6BA0C2','#2C6A98','#173A5A'],
    ink:'#222F3B', axis:'#344657', highlight:'#95391E',
  },
  {
    id:'mineral-violet', label:'矿青烟紫',
    series:['#206C62','#73538C','#AC683C','#436D9B','#A14766','#657833','#596371'],
    ramp:['#F0F8F5','#B9DBD0','#6EA99B','#337B6D','#14473F'],
    ink:'#202D2B', axis:'#3C514E', highlight:'#8F3A5C',
  },
  {
    id:'vermilion-indigo', label:'朱砂靛蓝',
    series:['#A94048','#3E5094','#287775','#8F6A30','#806092','#44697D','#5C594D'],
    ramp:['#FCF5F2','#EBCFC3','#CA9388','#A65357','#642B40'],
    ink:'#30282E', axis:'#514049', highlight:'#7F2432',
  },
  {
    id:'graphite-gold', label:'石墨青金',
    series:['#343F4B','#957123','#317773','#80607C','#9D513E','#55779A','#647446'],
    ramp:['#FAF7EE','#E5D6AD','#BAA169','#8B6C37','#523D20'],
    ink:'#292B2F', axis:'#464951', highlight:'#80591A',
  },
];

const themeKey = Symbol('figure theme');

export const resolveFigureTheme = id => FIGURE_THEMES.find(theme => theme.id === id);
export const plotTheme = params => params[themeKey];

// Symbol properties carry the theme through spreads without changing string parameter keys
// that existing API 1 schemes may enumerate. Workers reattach it after structured cloning.
export function applyFigureTheme(input) {
  return input.theme ? {...input, params:{...input.params, [themeKey]:input.theme}} : input;
}

export const seriesColors = (params, fallback) => plotTheme(params)?.series ?? fallback;
export const figureInk = (params, fallback) => plotTheme(params)?.ink ?? fallback;
export const figureAxis = (params, fallback) => plotTheme(params)?.axis ?? fallback;

export function themeColorParameter(key) {
  const match = /^color([1-9]\d*)?$/i.exec(key);
  return match ? Number(match[1] || 1) - 1 : -1;
}

const rgb = hex => [1,3,5].map(offset => Number.parseInt(hex.slice(offset,offset+2),16));

export function rampColor(ramp, fraction) {
  const position = Math.min(1,Math.max(0,fraction)) * (ramp.length-1), index = Math.floor(position);
  if (index === ramp.length-1) return ramp[index];
  const from = rgb(ramp[index]), to = rgb(ramp[index+1]), weight = position-index;
  return '#' + from.map((channel,i) => Math.round(channel+(to[i]-channel)*weight).toString(16).padStart(2,'0')).join('');
}

export function rampTextColor(color) {
  const linear = rgb(color).map(channel => {
    const value = channel/255;
    return value<=.04045 ? value/12.92 : ((value+.055)/1.055)**2.4;
  });
  return linear[0]*.2126+linear[1]*.7152+linear[2]*.0722>.179 ? '#000000' : '#FFFFFF';
}
