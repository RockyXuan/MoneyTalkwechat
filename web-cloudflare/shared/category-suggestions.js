// Personal relationships are ledger data. No personal names or global aliases live here.
export const categoryKey = value => value.normalize('NFKC').trim().toLocaleLowerCase();
export function categorySuggestion(item, categories, spokenName) {
  const active=categories.filter(c=>c.type===item.type&&!c.archived),key=categoryKey(spokenName);
  const exact=active.filter(c=>categoryKey(c.name)===key);
  if(exact.length===1)return {...item,category_id:exact[0].id};
  const aliases=active.filter(c=>(c.aliases||[]).some(a=>categoryKey(a)===key));
  const fallback=active.find(c=>c.id===item.category_id&&!['other','other-income'].includes(c.id));
  return {...item,category_id:null,category_hint:{name:spokenName.trim(),recommended_ids:(exact.length?exact:aliases.length?aliases:fallback?[fallback]:[]).slice(0,6).map(c=>c.id),resolved:false}};
}
export function spokenCategory(raw,categories,type) {
  const explicit=raw.match(/(?:分类(?:是|为|叫|到)?|归到|归入)\s*[:：]?\s*[“"「]?([^\s，,。；;：:”"」\d¥￥]+)(?=[\s，,。；;：:”"」\d¥￥]|$)/);
  if(explicit){if(explicit[1].trim().length>32)throw new Error('分类名称最多 32 字，请缩短后再核对');return {name:explicit[1],token:explicit[0]};}
  const header=raw.match(/^([^：:]{1,32})[：:]/);
  const known=categories.filter(c=>c.type===type&&!c.archived);
  if(header&&known.some(c=>[c.name,...(c.aliases||[])].some(n=>categoryKey(n)===categoryKey(header[1]))))return {name:header[1],token:header[0]};
  for(const c of known)for(const name of [c.name,...(c.aliases||[])]){
    // A recipient phrase is useful evidence; an arbitrary substring is not.
    const at=raw.indexOf(`给${name}`)>=0?raw.indexOf(`给${name}`):raw.indexOf(`为${name}`);
    if(at>=0&&/^(买|购买|的|付|花|[\s，,：:])/.test(raw.slice(at+name.length+1)))return {name,token:''};
  }
  return null;
}
