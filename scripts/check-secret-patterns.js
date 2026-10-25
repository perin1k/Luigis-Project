/**
 * Scans reviewed text for forbidden secret patterns without treating a clean result as
 * exhaustive security proof. Never print discovered credential values while extending
 * this check.
 */
import {execFileSync} from 'node:child_process';
import {readFileSync} from 'node:fs';

// Deliberately bounded pattern review, not a claim that arbitrary secrets are absent.
const MAX_TEXT_BYTES=2*1024*1024;
const arrPatterns=[
  ['private-key',/-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/],
  ['github-token',/\b(?:gh[pousr]_[A-Za-z0-9]{36,}|github_pat_[A-Za-z0-9_]{60,})\b/],
  ['aws-access-key',/\b(?:AKIA|ASIA)[A-Z0-9]{16}\b/],
  ['stripe-secret',/\b(?:sk|rk)_(?:live|test)_[A-Za-z0-9]{20,}\b/],
];
const TEXT_PATH=/\.(?:js|json|sql|md|txt|ejs|css|html|ya?ml|sh|pem|key|env|example)$|(?:^|\/)\.env(?:\.|$)|(?:^|\/)(?:Dockerfile|AGENTS\.md)$/i;
function git(arrArgs,objOptions={}){return execFileSync('git',arrArgs,{maxBuffer:64*1024*1024,...objOptions});}
let intScanned=0;let intFindings=0;let intSkipped=0;
function inspect(objBytes,strLocation){
  if(objBytes.length>MAX_TEXT_BYTES||objBytes.includes(0)){intSkipped++;return;}
  intScanned++;const strText=objBytes.toString('utf8');
  for(const [strRule,objPattern] of arrPatterns)if(objPattern.test(strText)){
    // Never print the matched value or surrounding source.
    console.log(JSON.stringify({strRule,strLocation}));intFindings++;
  }
}
for(const strPath of git(['ls-files','-z']).toString().split('\0').filter(Boolean)){
  if(!TEXT_PATH.test(strPath))continue;
  inspect(readFileSync(strPath),`working-tree:${strPath}`);
}
const mapObjects=new Map();
for(const strLine of git(['rev-list','--objects','--all']).toString().split('\n')){
  const intSpace=strLine.indexOf(' ');if(intSpace<0)continue;
  const strHash=strLine.slice(0,intSpace);const strPath=strLine.slice(intSpace+1);
  if(TEXT_PATH.test(strPath))mapObjects.set(strHash,strPath);
}
const arrObjects=[...mapObjects.keys()];
if(arrObjects.length){
  const strMetadata=git(['cat-file','--batch-check=%(objectname) %(objecttype) %(objectsize)'],{input:arrObjects.join('\n')+'\n'}).toString();
  for(const strLine of strMetadata.trim().split('\n')){
    const [strHash,strType,strSize]=strLine.split(' ');if(strType!=='blob')continue;
    if(Number(strSize)>MAX_TEXT_BYTES){intSkipped++;continue;}
    inspect(git(['cat-file','blob',strHash]),`blob:${strHash}:${mapObjects.get(strHash)}`);
  }
}
console.log(JSON.stringify({intScanned,intSkipped,intFindings,strScope:'tracked text working tree and reachable historical text blobs; selected extensions; four credential patterns'}));
process.exitCode=intFindings?1:0;
