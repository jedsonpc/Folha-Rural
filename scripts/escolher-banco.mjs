import fs from "node:fs";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";

const [currentRoot,backupBase]=process.argv.slice(2),roots=[];
if(currentRoot&&fs.existsSync(currentRoot))roots.push({root:currentRoot,current:1});
if(backupBase&&fs.existsSync(backupBase))for(const name of fs.readdirSync(backupBase)){const root=path.join(backupBase,name,".wrangler");if(fs.existsSync(root))roots.push({root,current:0})}
function files(root){const found=[];for(const entry of fs.readdirSync(root,{withFileTypes:true})){const full=path.join(root,entry.name);if(entry.isDirectory())found.push(...files(full));else if(/\.(sqlite|db)$/i.test(entry.name))found.push(full)}return found}
const tables=["companies","people","employment_contracts","daily_entries","services"];
const candidates=roots.map(item=>{let users=0,data=0,latest=0;for(const file of files(item.root)){latest=Math.max(latest,fs.statSync(file).mtimeMs);try{const db=new DatabaseSync(file,{readOnly:true});const exists=name=>Boolean(db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(name));if(exists("local_users"))users+=Number(db.prepare("SELECT COUNT(*) total FROM local_users WHERE active=1").get().total||0);for(const table of tables)if(exists(table))data+=Number(db.prepare(`SELECT COUNT(*) total FROM ${table}`).get().total||0);db.close()}catch{}}return{...item,users,data,latest}}).filter(c=>c.latest>0);
const selected=[...candidates].sort((a,b)=>b.current-a.current||b.data-a.data||b.latest-a.latest)[0]||null;
const authSource=[...candidates].filter(c=>c.users>0).sort((a,b)=>b.current-a.current||b.latest-a.latest||b.data-a.data)[0]||null;
process.stdout.write(JSON.stringify({selected,authSource,candidates}));
