export function normalize(value){return String(value).normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[₀-₉]/g,c=>'₀₁₂₃₄₅₆₇₈₉'.indexOf(c)).replace(/[αβγδ]/g,c=>({α:'alpha',β:'beta',γ:'gamma',δ:'delta'}[c])).replace(/[–—−]/g,'-').replace(/\bh[ -]*bonds?\b/g,'hydrogen bond').replace(/\bhydrogen bonding\b/g,'hydrogen bond').replace(/\b(bonds|forces|interactions|esters|amides|halides|anhydrides|thioesters)\b/g,w=>w.slice(0,-1)).replace(/(?<=[a-z0-9])[-_](?=[a-z0-9])/g,'').replace(/[.,;:()[\]{}'"\s]/g,'');}
export function timeBonus(rarity){if(!Number.isFinite(rarity)||rarity<0||rarity>100)throw Error('Invalid rarity');return 2+18*(rarity/100)**1.6;}
export const extraLife=rarity=>rarity>90?1:0;
function distance(a,b){const d=Array.from({length:a.length+1},()=>Array(b.length+1).fill(0));for(let i=0;i<=a.length;i++)d[i][0]=i;for(let j=0;j<=b.length;j++)d[0][j]=j;for(let i=1;i<=a.length;i++)for(let j=1;j<=b.length;j++){d[i][j]=Math.min(d[i-1][j]+1,d[i][j-1]+1,d[i-1][j-1]+(a[i-1]===b[j-1]?0:1));if(i>1&&j>1&&a[i-1]===b[j-2]&&a[i-2]===b[j-1])d[i][j]=Math.min(d[i][j],d[i-2][j-2]+1);}return d[a.length][b.length];}
const cache=new WeakMap();const protectedTerms=new Set(['insulin','inulin','glutamine','glutamate','asparagine','aspartate','thymine','thiamine','cytosine','cysteine','cystine','glucagon','glucokinase','glycogen','glycine','repression','suppression','aldose','aldolase','mitosis','meiosis','phosphofructokinase2','pfk2'].map(normalize));
export function registerScientificTerms(prompts){for(const p of prompts)for(const a of p.answers)for(const name of [a.label,...a.aliases])protectedTerms.add(normalize(name));}
export function matchAnswer(prompt,input,used=new Set()){
 const key=normalize(input);if(!key||key.length>180)return {status:'invalid',message:'Enter a short scientific answer.'};
 let aliases=cache.get(prompt);if(!aliases){aliases=new Map();prompt.answers.forEach((a,index)=>{for(const value of [a.label,...a.aliases]){const k=normalize(value);if(aliases.has(k)&&aliases.get(k).answer.id!==a.id)throw Error('Ambiguous bank alias: '+value);aliases.set(k,{answer:a,index});}});cache.set(prompt,aliases);}
 let result=aliases.get(key),method='exact';
 if(!result){
  if(key==='vanderwaals'||key==='vanderwaalsinteraction'||key==='vanderwaalsforce')return {status:'ambiguous',message:'Van der Waals can refer to several interactions. Specify London dispersion or dipole–dipole.'};
  if(!protectedTerms.has(key)&&key.length>=6){const candidates=new Map();for(const [alias,r] of aliases){const max=Math.max(alias.length,key.length),limit=max>=13?2:1;if(Math.abs(alias.length-key.length)>limit||JSON.stringify(alias.match(/\d+/g)||[])!==JSON.stringify(key.match(/\d+/g)||[])||JSON.stringify(alias.match(/[+\-]/g)||[])!==JSON.stringify(key.match(/[+\-]/g)||[]))continue;const dist=distance(key,alias);if(dist<=limit&&dist/max<=.14)candidates.set(r.answer.id,r);}if(candidates.size===1){result=[...candidates.values()][0];method='typo';}else if(candidates.size>1)return {status:'ambiguous',message:'That spelling could mean multiple answers. Please be more specific.'};}
 }
 if(!result)return {status:'invalid',message:'Not in this reviewed bank. Try another answer or submit a bank suggestion.'};
 const {answer,index}=result;if(used.has(answer.id))return {status:'duplicate',answer,index,message:answer.label+' was already used for this prompt in this match.'};
 return {status:'correct',answer,index,label:answer.label,method:method==='typo'?'typo':String(input).trim()===answer.label?'exact':'alias'};
}
