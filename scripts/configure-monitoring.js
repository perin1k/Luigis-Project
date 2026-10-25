/**
 * Builds/applies the explicitly approved GCP monitoring policy. Resource checks and
 * fixed configuration prevent this operator tool from silently expanding hosting scope.
 */
import {readFileSync} from 'node:fs';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {spawnSync} from 'node:child_process';

const PROJECT='capstone-510915';
const LABELS={application:'luigis-preview',managed_by:'reviewed-ops04'};
export function buildMonitoringPlan(objConfig){
  const objApproved=JSON.parse(readFileSync(new URL('../deploy/monitoring.json',import.meta.url)));
  if(JSON.stringify(objConfig)!==JSON.stringify(objApproved))throw new Error('Unreviewed monitoring configuration.');
  return objConfig.arrChecks.map(objCheck=>({
    displayName:`luigis-preview-${objCheck.strId}`,period:'60s',timeout:'10s',
    monitoredResource:{type:'uptime_url',labels:{project_id:PROJECT,host:objConfig.strHost}},
    httpCheck:{requestMethod:'GET',useSsl:true,validateSsl:true,path:objCheck.strPath,port:443,
      acceptedResponseStatusCodes:[{statusValue:200}]},
    contentMatchers:[{content:'"strStatus":"ready"',matcher:'CONTAINS_STRING'}],
    selectedRegions:objConfig.arrRegions,checkerType:'STATIC_IP_CHECKERS',logCheckFailures:false,userLabels:LABELS
  }));
}
export function buildAlertPolicy(strCheckName,strChannelName,objCheck){
  if(!new RegExp(`^projects/${PROJECT}/uptimeCheckConfigs/[A-Za-z0-9_-]+$`).test(strCheckName)
    ||!new RegExp(`^projects/${PROJECT}/notificationChannels/[0-9]+$`).test(strChannelName)
    ||!['readiness','previews'].includes(objCheck.strId)
    ||objCheck.intFailureSeconds!==(objCheck.strId==='readiness'?180:600))throw new Error('Approved monitoring references required.');
  const strId=strCheckName.split('/').at(-1);
  return {displayName:`luigis-preview-${objCheck.strId}`,enabled:true,combiner:'OR',userLabels:LABELS,
    notificationChannels:[strChannelName],severity:'ERROR',
    documentation:{mimeType:'text/markdown',content:'Luigi preview operational alert. Brody: inspect VM/DNS/TLS and minimal health probes through IAP. Follow docs/operations-monitoring.md. Preserve data/keys and payment identifiers; never retry a payment as a new transaction. No automatic VM resize or destructive recovery.'},
    conditions:[{displayName:`${objCheck.strId} sustained failure`,conditionThreshold:{
      filter:`resource.type="uptime_url" AND metric.type="monitoring.googleapis.com/uptime_check/check_passed" AND metric.label.check_id="${strId}"`,
      comparison:'COMPARISON_GT',thresholdValue:1,duration:objCheck.intFailureSeconds+'s',
      aggregations:[{alignmentPeriod:'60s',perSeriesAligner:'ALIGN_NEXT_OLDER',crossSeriesReducer:'REDUCE_COUNT_FALSE'}],
      trigger:{count:1},evaluationMissingData:'EVALUATION_MISSING_DATA_INACTIVE'}}],
    alertStrategy:{autoClose:'1800s',notificationPrompts:['OPENED','CLOSED']}};
}

function gcloud(arrArguments){
  const strExecutable=process.env.GCLOUD_PYTHON_PATH||'gcloud';
  const arrPrefix=process.env.GCLOUD_PYTHON_PATH?[process.env.GCLOUD_MAIN_PATH]:[];
  const objResult=spawnSync(strExecutable,[...arrPrefix,...arrArguments,'--quiet'],{encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000});
  if(objResult.status!==0)throw new Error('Approved operator authentication unavailable.');
  return objResult.stdout.trim();
}
export async function configureMonitoring(fnApi,strEmail){
  if(!/^[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+$/.test(strEmail))throw new Error('Approved operator email required.');
  const objConfig=JSON.parse(readFileSync(new URL('../deploy/monitoring.json',import.meta.url)));
  const arrChecks=buildMonitoringPlan(objConfig);
  const objInventory=await fnApi('/uptimeCheckConfigs');
  const objChannels=await fnApi('/notificationChannels');
  const objPolicies=await fnApi('/alertPolicies');
  if([objInventory,objChannels,objPolicies].some(objResult=>objResult.nextPageToken))throw new Error('Complete inventory review required.');
  const arrExisting=objInventory.uptimeCheckConfigs??[];
  // Count all regional executions conservatively before adding our checks.
  const intExisting=arrExisting.reduce((intSum,objItem)=>intSum+Math.ceil(31*86400/Number(objItem.period.replace('s','')))*Math.max(objItem.selectedRegions?.length??0,6),0);
  if(intExisting+objConfig.intMonthlyExecutionsAt31Days>1000000)throw new Error('Free execution allowance needs review.');
  const arrChannels=(objChannels.notificationChannels??[]).filter(objItem=>objItem.displayName==='luigis-preview-operator');
  if(arrChannels.length>1)throw new Error('Duplicate operator channels require review.');
  let objChannel=arrChannels[0];
  if(objChannel&&(objChannel.type!=='email'||objChannel.labels?.email_address!==strEmail||!objChannel.enabled))throw new Error('Existing operator channel differs; no overwrite.');
  if(!objChannel)objChannel=await fnApi('/notificationChannels','POST',{type:'email',displayName:'luigis-preview-operator',labels:{email_address:strEmail},enabled:true,userLabels:LABELS});
  const arrNames=[];
  for(let intIndex=0;intIndex<arrChecks.length;intIndex++){
    const objExpected=arrChecks[intIndex];const arrMatches=arrExisting.filter(objItem=>objItem.displayName===objExpected.displayName);
    if(arrMatches.length>1)throw new Error('Duplicate checks require review.');
    let objCheck=arrMatches[0];
    if(objCheck){
      if(objCheck.monitoredResource?.labels?.host!==objConfig.strHost||objCheck.httpCheck?.path!==objExpected.httpCheck.path
        ||!objCheck.httpCheck?.useSsl||!objCheck.httpCheck?.validateSsl||objCheck.period!=='60s'
        ||objCheck.disabled||objCheck.httpCheck?.port!==443||objCheck.httpCheck?.requestMethod!=='GET'
        ||JSON.stringify([...(objCheck.selectedRegions??[])].sort())!==JSON.stringify([...objConfig.arrRegions].sort())
        ||objCheck.contentMatchers?.[0]?.content!==objExpected.contentMatchers[0].content
        ||objCheck.contentMatchers?.[0]?.matcher!=='CONTAINS_STRING'
        ||objCheck.httpCheck.acceptedResponseStatusCodes?.length!==1||objCheck.httpCheck.acceptedResponseStatusCodes[0].statusValue!==200
        ||objCheck.userLabels?.managed_by!==LABELS.managed_by)throw new Error('Existing check differs; no overwrite.');
    }else objCheck=await fnApi('/uptimeCheckConfigs','POST',objExpected);
    const objPolicy=buildAlertPolicy(objCheck.name,objChannel.name,objConfig.arrChecks[intIndex]);
    const arrPolicies=(objPolicies.alertPolicies??[]).filter(objItem=>objItem.displayName===objPolicy.displayName);
    if(arrPolicies.length>1)throw new Error('Duplicate policies require review.');
    if(arrPolicies[0]){
      const objExisting=arrPolicies[0];const objThreshold=objExisting.conditions?.[0]?.conditionThreshold;
      if(!objExisting.enabled||objExisting.userLabels?.managed_by!==LABELS.managed_by
        ||objExisting.notificationChannels?.length!==1||objExisting.notificationChannels[0]!==objChannel.name||objExisting.conditions?.length!==1
        ||objThreshold?.filter!==objPolicy.conditions[0].conditionThreshold.filter||objThreshold?.comparison!=='COMPARISON_GT'
        ||objThreshold?.thresholdValue!==1||objThreshold?.aggregations?.[0]?.alignmentPeriod!=='60s'
        ||objThreshold?.aggregations?.[0]?.perSeriesAligner!=='ALIGN_NEXT_OLDER'||objThreshold?.aggregations?.[0]?.crossSeriesReducer!=='REDUCE_COUNT_FALSE'
        ||objThreshold?.duration!==objConfig.arrChecks[intIndex].intFailureSeconds+'s'
        ||!['OPENED','CLOSED'].every(strPrompt=>objExisting.alertStrategy?.notificationPrompts?.includes(strPrompt)))throw new Error('Existing policy differs; no overwrite.');
    }else await fnApi('/alertPolicies','POST',objPolicy);
    arrNames.push(objCheck.name);
  }
  return {intConfiguredChecks:arrNames.length,arrCheckNames:arrNames,strChannelName:objChannel.name,intPlannedMonthlyExecutions:objConfig.intMonthlyExecutionsAt31Days};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href){
  try{
    if(process.argv.length!==3||process.argv[2]!=='--apply')throw new Error('Use --apply only for the approved project/operator.');
    let strToken=gcloud(['auth','print-access-token']);
    try{
      const strEmail=gcloud(['auth','list','--filter=status:ACTIVE','--format=value(account)']);
      const fnApi=async(strPath,strMethod='GET',objBody)=>{
        if(!/^\/(uptimeCheckConfigs|notificationChannels|alertPolicies)$/.test(strPath))throw new Error('Unapproved API path.');
        const objResponse=await fetch(`https://monitoring.googleapis.com/v3/projects/${PROJECT}${strPath}`,{
          method:strMethod,redirect:'error',headers:{Authorization:'Bearer '+strToken,'Content-Type':'application/json'},
          ...(objBody?{body:JSON.stringify(objBody)}:{}),signal:AbortSignal.timeout(30000)});
        if(!objResponse.ok){const objError=new Error('Monitoring API request failed.');objError.intStatus=objResponse.status;throw objError;}
        return objResponse.json();
      };
      console.log(JSON.stringify(await configureMonitoring(fnApi,strEmail)));
    }finally{strToken='';}
  }catch(objError){console.error('Monitoring configuration incomplete; review approved state. HTTP status: '+(objError.intStatus??'not-applicable'));process.exitCode=1;}
}
