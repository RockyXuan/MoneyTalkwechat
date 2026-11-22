import {spokenCategory,categorySuggestion} from './category-suggestions.js';
// Suggestions use only the current ledger's categories and explicit aliases.
// They never infer a new permanent personal rule from one confirmation.
export function intakeCategoryOptions(item,categories){
 if(item.category_hint)return item;
 const spoken=spokenCategory(item.raw||'',categories,item.type);
 if(spoken)return categorySuggestion(item,categories,spoken.name);
 const active=categories.filter(c=>c.type===item.type&&!c.archived);
 const matches=active.filter(c=>[c.name,...(c.aliases||[])].some(name=>name.length>1&&item.title.includes(name)));
 const candidate=active.find(c=>c.id===item.category_id&&!['other','other-income'].includes(c.id));
 if(matches.length===1)return {...item,category_id:matches[0].id,category_hint:{name:matches[0].name,recommended_ids:[matches[0].id],resolved:true}};
 if(candidate&&!matches.length)return {...item,category_hint:{name:candidate.name,recommended_ids:[candidate.id],resolved:true}};
 const suggested=matches.slice(0,6);
 return {...item,category_id:null,category_hint:{name:'待选择',recommended_ids:suggested.map(c=>c.id),resolved:false}};
}
