import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {createRequire} from "node:module";
import {fileURLToPath} from "node:url";
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),"..");
const targetRoot=process.env.WIN_DEV_SKILLS_ROOT?path.resolve(process.env.WIN_DEV_SKILLS_ROOT):path.resolve(root,"..","..");
const require=createRequire(path.join(targetRoot,"scripts","vally","package.json"));
const {parseDocument}=require("yaml");
const inventory=JSON.parse(fs.readFileSync(path.join(root,"skills.json"),"utf8"));
assert.equal(inventory.diagnosticSkillCount,10);
assert.equal(inventory.auxiliarySkillCount,1);
assert.deepEqual(inventory.auxiliarySkills,["validate-diagnosis-output"]);
const allowed=[...inventory.diagnosticSkills,...inventory.auxiliarySkills].sort();
const dirs=fs.readdirSync(path.join(root,"skills"),{withFileTypes:true}).filter(e=>e.isDirectory()).map(e=>e.name).sort();
assert.deepEqual(dirs,allowed);
const allowedUrlHosts=new Set(["agent-plugins.org","devblogs.microsoft.com","github.com","learn.microsoft.com"]);
function assertPublicText(text,label){
 for(const match of text.matchAll(/https?:\/\/[^\s<>"'`]+/g)){
  const value=match[0].replace(/[),.;:]+$/,"");
  const host=new URL(value).hostname.toLowerCase();
  assert.ok(allowedUrlHosts.has(host),label+" references unapproved URL host "+host);
 }
 assert.doesNotMatch(text,/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i,label+" contains an email address");
}
for(const id of dirs){
 const text=fs.readFileSync(path.join(root,"skills",id,"SKILL.md"),"utf8");
 const m=/^---\r?\n([\s\S]*?)\r?\n---/.exec(text);assert.ok(m,id);
 const doc=parseDocument(m[1],{uniqueKeys:true});assert.equal(doc.errors.length,0,id);
 const h=doc.toJS();assert.equal(h.name,id);assert.ok(!("owner" in h));assert.ok(!("metadata" in h));
 assertPublicText(text,id);
}
assert.ok(!fs.existsSync(path.join(root,".mcp.json")));
assert.ok(!fs.existsSync(path.join(root,"mcp")));
for(const rel of ["README.md","FEEDBACK.md","com.github.copilot/agents/diagnostician.agent.md","com.github.copilot/agents/fleet/contrarian.agent.md","com.github.copilot/instructions/diagnostic-reasoning.instructions.md","com.github.copilot/instructions/root-cause-analysis.instructions.md"]){
 const text=fs.readFileSync(path.join(root,rel),"utf8");
 assertPublicText(text,rel);
}
for(const rel of ["README.md","com.github.copilot/agents/diagnostician.agent.md","com.github.copilot/agents/fleet/contrarian.agent.md","com.github.copilot/instructions/diagnostic-reasoning.instructions.md","skills/validate-diagnosis-output/SKILL.md"]){
 const text=fs.readFileSync(path.join(root,rel),"utf8");
 assert.match(text,/fix_confidence/,rel+" omits fix_confidence");
 assert.match(text,/fix_code_path_coverage/,rel+" omits fix_code_path_coverage");
}
console.log("Validated ten debugging skills, one auxiliary validator, complete agent workflow, and public-only links.");
