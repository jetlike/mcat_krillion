import {readFileSync} from 'node:fs';
import {subjects,subtopics,selectedPrompts,topicCounts} from './taxonomy.js';
import {registerScientificTerms} from './matching.js';
export const catalog=JSON.parse(readFileSync(new URL('./content/catalog.json',import.meta.url)));
export const prompts=catalog.prompts;
export const byId=new Map(prompts.map(p=>[p.id,p]));
registerScientificTerms(prompts);
export const publicCatalog=()=>({...catalog,subjects,subtopics,counts:topicCounts(prompts)});
export {selectedPrompts};
