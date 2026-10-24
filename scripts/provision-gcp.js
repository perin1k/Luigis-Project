import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const DESCRIPTION='Luigis Project approved preview';
export function buildProvisionPlan(objConfig){
  const objApproved=JSON.parse(readFileSync(new URL('../deploy/gcp-provisioning.json',import.meta.url)));
  for(const strKey of Object.keys(objApproved))if(objConfig[strKey]!==objApproved[strKey])throw new Error('Unreviewed provisioning configuration.');
  const {strNetwork,strSubnet,strRegion,strCidr,strVm,strZone,strMachine,strImage,strImageProject,strDataDisk,strStopAt}=objConfig;
  const arrPlan=[
    {strKind:'network',strName:strNetwork,arrDescribe:['compute','networks','describe',strNetwork],
      arrArgs:['compute','networks','create',strNetwork,'--subnet-mode=custom','--bgp-routing-mode=regional']},
    {strKind:'subnet',strName:strSubnet,arrDescribe:['compute','networks','subnets','describe',strSubnet,'--region='+strRegion],
      arrArgs:['compute','networks','subnets','create',strSubnet,'--network='+strNetwork,'--region='+strRegion,'--range='+strCidr]}
  ];
  for(const [strSuffix,strPort,strSource] of [['https','443','0.0.0.0/0'],['acme','80','0.0.0.0/0'],['iap-ssh','22','35.235.240.0/20']]){
    const strName=strVm+'-'+strSuffix;
    arrPlan.push({strKind:'firewall',strName,arrDescribe:['compute','firewall-rules','describe',strName],
      strPort,strSource,arrArgs:['compute','firewall-rules','create',strName,'--network='+strNetwork,
        '--direction=INGRESS','--priority=1000','--allow=tcp:'+strPort,
        '--source-ranges='+strSource,'--target-tags='+strVm]});
  }
  arrPlan.push({strKind:'vm',strName:strVm,arrDescribe:['compute','instances','describe',strVm,'--zone='+strZone],
    arrArgs:['compute','instances','create',strVm,'--zone='+strZone,'--machine-type='+strMachine,
      '--subnet='+strSubnet,'--tags='+strVm,'--provisioning-model=SPOT','--instance-termination-action=STOP',
      '--maintenance-policy=TERMINATE','--no-restart-on-failure','--termination-time='+strStopAt,
      '--image='+strImage,'--image-project='+strImageProject,'--boot-disk-size=20GB','--boot-disk-type=pd-balanced',
      '--no-boot-disk-auto-delete','--create-disk=name='+strDataDisk+',device-name=luigis-data,size=10GB,type=pd-balanced,auto-delete=no,boot=no',
      '--no-service-account','--no-scopes','--metadata=enable-oslogin=TRUE,block-project-ssh-keys=TRUE,serial-port-enable=FALSE',
      '--labels=application=luigis-pizza,environment=preview,managed-by=luigis-project']});
  return arrPlan.map(objStep=>({...objStep,arrArgs:[...objStep.arrArgs,'--description='+DESCRIPTION]}));
}

function gcloud(arrArgs,strProject,bAllowMissing=false){
  const strPython=process.env.GCLOUD_PYTHON_PATH;const strMain=process.env.GCLOUD_MAIN_PATH;
  if(Boolean(strPython)!==Boolean(strMain)||(process.platform==='win32'&&!strPython))throw new Error('Configure explicit SDK Python/main paths on Windows.');
  const objResult=spawnSync(strPython??'gcloud',[...(strMain?[strMain]:[]),...arrArgs,'--project='+strProject,'--format=json','--quiet'],
    {encoding:'utf8',timeout:180000,maxBuffer:4*1024*1024,env:{...process.env,CLOUDSDK_CORE_DISABLE_PROMPTS:'1'}});
  if(objResult.status!==0){
    if(bAllowMissing&&/was not found|not found|does not exist/.test(objResult.stderr??''))return null;
    const strCode=['QUOTA_EXCEEDED','ZONE_RESOURCE_POOL_EXHAUSTED','PERMISSION_DENIED','RESOURCE_IN_USE','INVALID_ARGUMENT'].find(strValue=>objResult.stderr?.includes(strValue));
    throw new Error('Cloud command failed'+(strCode?': '+strCode:'; inspect authorized GCP operation status.'));
  }
  return objResult.stdout.trim()?JSON.parse(objResult.stdout):{};
}

export function verifyExisting(objStep,objResource,objConfig){
  let bValid=objResource.name===objStep.strName&&objResource.description===DESCRIPTION;
  if(objStep.strKind==='network')bValid&&=objResource.autoCreateSubnetworks===false;
  if(objStep.strKind==='subnet')bValid&&=objResource.ipCidrRange===objConfig.strCidr&&objResource.network?.endsWith('/'+objConfig.strNetwork);
  if(objStep.strKind==='firewall')bValid&&=objResource.direction==='INGRESS'&&!objResource.disabled&&objResource.network?.endsWith('/'+objConfig.strNetwork)
    &&JSON.stringify(objResource.sourceRanges)==JSON.stringify([objStep.strSource])&&JSON.stringify(objResource.targetTags)==JSON.stringify([objConfig.strVm])
    &&JSON.stringify(objResource.allowed)==JSON.stringify([{IPProtocol:'tcp',ports:[objStep.strPort]}])&&!objResource.denied?.length;
  if(objStep.strKind==='vm')bValid&&=objResource.machineType?.endsWith('/'+objConfig.strMachine)
    &&objResource.scheduling?.provisioningModel==='SPOT'&&objResource.scheduling?.instanceTerminationAction==='STOP'
    &&!objResource.scheduling?.automaticRestart&&Date.parse(objResource.scheduling?.terminationTime)===Date.parse(objConfig.strStopAt)
    &&!objResource.serviceAccounts?.length&&objResource.disks?.length===2&&objResource.disks.every(objDisk=>objDisk.autoDelete===false)
    &&objResource.disks.some(objDisk=>objDisk.boot&&Number(objDisk.diskSizeGb)===20)
    &&objResource.disks.some(objDisk=>!objDisk.boot&&Number(objDisk.diskSizeGb)===10&&objDisk.deviceName==='luigis-data')
    &&objResource.networkInterfaces?.length===1&&objResource.networkInterfaces[0].subnetwork?.endsWith('/'+objConfig.strSubnet)
    &&objResource.networkInterfaces[0].network?.endsWith('/'+objConfig.strNetwork)
    &&['enable-oslogin','block-project-ssh-keys'].every(strKey=>objResource.metadata?.items?.some(objItem=>objItem.key===strKey&&objItem.value==='TRUE'));
  if(!bValid)throw new Error('Existing resource differs from the approved plan; no overwrite: '+objStep.strName);
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    const objConfig=JSON.parse(readFileSync(new URL('../deploy/gcp-provisioning.json',import.meta.url)));
    const arrPlan=buildProvisionPlan(objConfig);const strMode=process.argv[2]??'plan';
    if(strMode==='plan')console.log(JSON.stringify(arrPlan,null,2));
    else if(strMode==='apply'){
      const objRegion=gcloud(['compute','regions','describe',objConfig.strRegion],objConfig.strProject);
      if((objRegion.quotas.find(objQuota=>objQuota.metric==='PREEMPTIBLE_CPUS')?.limit??0)<2)
        throw new Error('Approved Spot quota is not available; no paid resources created.');
      for(const objStep of arrPlan){
        const objExisting=gcloud(objStep.arrDescribe,objConfig.strProject,true);
        if(objExisting)verifyExisting(objStep,objExisting,objConfig);
        else gcloud(objStep.arrArgs,objConfig.strProject);
        verifyExisting(objStep,gcloud(objStep.arrDescribe,objConfig.strProject),objConfig);
        if(objStep.strKind==='vm')for(const [strDisk,intSize] of [[objConfig.strVm,20],[objConfig.strDataDisk,10]]){
          const objDisk=gcloud(['compute','disks','describe',strDisk,'--zone='+objConfig.strZone],objConfig.strProject);
          if(Number(objDisk.sizeGb)!==intSize||!objDisk.type?.endsWith('/pd-balanced'))throw new Error('Created storage does not match approved type/size.');
        }
        console.log('Verified approved resource: '+objStep.strName);
      }
    }else throw new Error('Expected plan or apply.');
  }catch(objError){console.error(objError.message);process.exitCode=1;}
}
