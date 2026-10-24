import {execFileSync} from 'node:child_process';
import {readFileSync,writeFileSync,mkdirSync,realpathSync,existsSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';

/** Canonical Git source only; dependencies/data/secrets are never copied from a workstation. */
export function buildSourceRelease(strRoot,strOutput){
  const fnGit=(arrArgs)=>execFileSync('git',['-c','core.fsmonitor=false','-C',strRoot,...arrArgs],{encoding:'utf8',stdio:['ignore','pipe','pipe']});
  if(fnGit(['status','--porcelain','--untracked-files=normal']).trim())throw new Error('A clean reviewed checkout is required.');
  const strCommit=fnGit(['rev-parse','HEAD']).trim();
  if(!/^[a-f0-9]{40}$/.test(strCommit))throw new Error('Reviewed commit required.');
  const strOverrides=fnGit(['rev-parse','--git-path','info/attributes']).trim();
  if(existsSync(resolve(strRoot,strOverrides))&&readFileSync(resolve(strRoot,strOverrides),'utf8').trim())throw new Error('Unreviewed archive attribute overrides.');
  const strAttributes=resolve(strRoot,'deploy/archive-attributes');
  if(!readFileSync(strAttributes,'utf8').includes('src/data/migrations/*.sql text eol=crlf'))throw new Error('Reviewed migration archive format required.');
  mkdirSync(strOutput,{recursive:true});const strArchive=join(resolve(strOutput),strCommit+'.tar');
  // Refuse overwrite before git archive opens its output.
  writeFileSync(strArchive,'',{flag:'wx',mode:0o600});
  fnGit(['-c','core.autocrlf=false','-c','core.attributesFile='+strAttributes,'archive','--format=tar','--output='+strArchive,strCommit,'src','scripts','deploy','package.json','package-lock.json']);
  const objManifest={strCommit,strSha256:createHash('sha256').update(readFileSync(strArchive)).digest('hex'),
    strNodeVersion:process.version,strMigrationArchiveEol:'crlf',strSource:'https://github.com/perin1k/Luigis-Project',arrPaths:['src','scripts','deploy','package.json','package-lock.json']};
  writeFileSync(join(resolve(strOutput),'source-build.json'),JSON.stringify(objManifest,null,2)+'\n',{flag:'wx',mode:0o600});
  return objManifest;
}
if(process.argv[1]&&realpathSync(process.argv[1])===fileURLToPath(import.meta.url)){
  try{if(process.argv.length!==2)throw new Error();console.log(JSON.stringify(buildSourceRelease(fileURLToPath(new URL('../',import.meta.url)),resolve('reports/source-release'))));}
  catch{console.error('Source release build failed; require a clean reviewed checkout and new output files.');process.exitCode=1;}
}
