/**
 * Release manifest, source integrity and schema compatibility helpers. A prepared
 * archive is distinct from an activated, healthy release; migration history remains
 * checksum-protected.
 */
import {createHash} from 'node:crypto';
import {readFileSync,writeFileSync,readdirSync,lstatSync,realpathSync} from 'node:fs';
import {join,resolve,isAbsolute,relative,sep} from 'node:path';
import {pathToFileURL} from 'node:url';
import {DatabaseSync} from 'node:sqlite';

function hashFiles(strRoot){
  const mapFiles={};
  function visit(strRelative){
    const strPath=join(strRoot,strRelative);const objStat=lstatSync(strPath);
    if(objStat.isSymbolicLink())throw new Error('Release integrity: symbolic source files are forbidden.');
    if(objStat.isDirectory()){
      for(const strName of readdirSync(strPath).sort())visit(strRelative?`${strRelative}/${strName}`:strName);
    }else if(objStat.isFile())mapFiles[strRelative]=createHash('sha256').update(readFileSync(strPath)).digest('hex');
    else throw new Error('Release integrity: regular source files required.');
  }
  for(const strName of ['package.json','package-lock.json','src','scripts','deploy'])visit(strName);
  return mapFiles;
}

/** Create only in an operator-controlled release, before making it immutable. */
export function createManifest(strRoot,strCommit,arrMigrations){
  if(!/^[a-f0-9]{40}$/.test(strCommit))throw new Error('Full reviewed commit required.');
  const objManifest={intFormat:1,strCommit,strNodeVersion:process.version,
    arrMigrations,mapFiles:hashFiles(strRoot)};
  writeFileSync(join(strRoot,'release-manifest.json'),JSON.stringify(objManifest,null,2)+'\n',{flag:'wx'});
  return objManifest;
}

/** Never migrate, seed, replace, or open a missing database for writing. */
export function verifyRelease(strRoot,strDatabase,strMode='ready'){
  if(!['ready','forward','rollback'].includes(strMode))throw new Error('Unknown release mode.');
  const objManifest=JSON.parse(readFileSync(join(strRoot,'release-manifest.json'),'utf8'));
  if(objManifest.intFormat!==1||!/^[a-f0-9]{40}$/.test(objManifest.strCommit)
    ||objManifest.strNodeVersion!==process.version)throw new Error('Release runtime/manifest mismatch.');
  const mapActual=hashFiles(strRoot);
  if(JSON.stringify(mapActual)!==JSON.stringify(objManifest.mapFiles))throw new Error('Release integrity mismatch.');
  const strResolvedDatabase=realpathSync(strDatabase);const strRelative=relative(realpathSync(strRoot),strResolvedDatabase);
  if(strRelative===''||(!strRelative.startsWith(`..${sep}`)&&strRelative!=='..'&&!isAbsolute(strRelative)))
    throw new Error('Retained database must be outside the release.');
  if(!lstatSync(strDatabase).isFile())throw new Error('Existing regular database required.');
  const arrExpected=objManifest.arrMigrations;
  if(!Array.isArray(arrExpected)||!arrExpected.length||arrExpected.some((objRow,intIndex)=>
    objRow.version!==intIndex+1||typeof objRow.name!=='string'||!/^[a-f0-9]{64}$/.test(objRow.checksum)))
    throw new Error('Invalid release schema manifest.');
  const objDatabase=new DatabaseSync(strResolvedDatabase,{readOnly:true});
  try{
    if(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check!=='ok'
      ||objDatabase.prepare('PRAGMA foreign_key_check').all().length)throw new Error('Retained database integrity failed.');
    const arrApplied=objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all();
    if(arrApplied.some((objRow,intIndex)=>objRow.version!==intIndex+1||
      ['version','name','checksum'].some(strKey=>objRow[strKey]!==arrExpected[intIndex]?.[strKey])))
      throw new Error('Release schema is incompatible with retained history.');
    const intPending=arrExpected.length-arrApplied.length;
    if(strMode!=='forward'&&intPending!==0)throw new Error('Release schema requires an explicit migration; rollback refused.');
    return {strCommit:objManifest.strCommit,intPending,strNodeVersion:objManifest.strNodeVersion};
  }finally{objDatabase.close();}
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const [strCommand,strDirectory,strArgument]=process.argv.slice(2);const strRoot=resolve(strDirectory??'.');
    if(strCommand==='manifest'){
      const {applyMigrations}=await import(pathToFileURL(join(strRoot,'src/data/migrations.js')));
      const objDatabase=new DatabaseSync(':memory:');
      try{applyMigrations(objDatabase);createManifest(strRoot,strArgument,
        objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all());}
      finally{objDatabase.close();}
      console.log('Release manifest created; operator must protect the release before activation.');
    }else if(strCommand==='check'){
      const objResult=verifyRelease(strRoot,process.env.DATABASE_PATH,strArgument);
      console.log(JSON.stringify(objResult));
    }else throw new Error('Expected manifest or check.');
  }catch{console.error('Release check failed: verify source integrity, runtime, retained database and schema compatibility.');process.exitCode=1;}
}
