export const subjects = [
 ['behavioral','Behavioral Sciences',[
 ['behavior-biology','Biological Basis of Behavior'],['perception','Sensation, Perception, and Consciousness'],['learning','Learning, Memory, and Cognition'],['motivation','Motivation, Emotion, Attitudes, Personality, and Stress'],['disorders','Psychological Disorders and Treatment'],['sociology','Theories and Research in Sociology'],['identity','Identity and Social Interaction'],['demographics','Demographics and Social Structure']]],
 ['biochemistry','Biochemistry',[
 ['amino-acids','Amino Acids and Proteins'],['enzymes','Enzymes'],['biomolecules','Carbohydrates, Nucleotides, and Lipids'],['metabolism','Metabolic Reactions'],['biochem-lab','Biochemistry Lab Techniques']]],
 ['biology','Biology',[
 ['molecular','Molecular Biology'],['bio-research','Biological Research Techniques'],['cellular','Cellular Biology'],['genetics','Genetics and Evolution'],['reproduction','Reproduction'],['endocrine','Endocrine and Nervous Systems'],['circulation','Circulation and Respiration'],['digestion','Digestion and Excretion'],['musculoskeletal','Musculoskeletal System'],['immunity','Skin and Immune Systems']]],
 ['general-chemistry','General Chemistry',[
 ['atomic','Atomic Theory and Chemical Composition'],['interactions','Interactions of Chemical Substances'],['thermo-kinetics','Thermodynamics, Kinetics, and Gas Laws'],['solutions','Solutions and Electrochemistry']]],
 ['organic-chemistry','Organic Chemistry',[
 ['organic-intro','Introduction to Organic Chemistry'],['organic-reactions','Functional Groups and Their Reactions'],['organic-lab','Separation Techniques, Spectroscopy, and Analytical Methods']]],
 ['physics','Physics',[
 ['mechanics','Mechanics and Energy'],['fluids','Fluids'],['electricity','Electrostatics and Circuits'],['light-sound','Light and Sound'],['physics-thermo','Thermodynamics']]],
].map(([id,name,children])=>({id,name,children:children.map(([id,name])=>({id,name}))}));
export const subtopics=subjects.flatMap(s=>s.children.map(c=>({...c,subject:s.id,subjectName:s.name})));
export function selectedPrompts(prompts,ids){const chosen=new Set(ids.flatMap(id=>subjects.find(s=>s.id===id)?.children.map(c=>c.id)||[id]));return prompts.filter(p=>p.topics.some(t=>chosen.has(t)));}
export function topicCounts(prompts){return Object.fromEntries([...subjects,...subtopics].map(t=>[t.id,new Set(selectedPrompts(prompts,[t.id]).map(p=>p.id)).size]));}
