import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildMonitoringPlan,buildAlertPolicy,configureMonitoring} from '../../scripts/configure-monitoring.js';
const CONFIG=JSON.parse(readFileSync(new URL('../../deploy/monitoring.json',import.meta.url)));
test('approved checks validate TLS, fixed private-data-free paths, regions, cadence and cost bound',()=>{
  const arrChecks=buildMonitoringPlan(CONFIG);assert.equal(arrChecks.length,2);
  assert.deepEqual(arrChecks.map(objCheck=>objCheck.httpCheck.path),['/health/ready','/health/previews']);
  for(const objCheck of arrChecks){assert.equal(objCheck.httpCheck.validateSsl,true);assert.equal(objCheck.httpCheck.useSsl,true);assert.equal(objCheck.period,'60s');assert.equal(objCheck.selectedRegions.length,3);assert.equal(objCheck.logCheckFailures,false);assert.equal(Object.hasOwn(objCheck.httpCheck,'authInfo'),false);}
  assert.equal(2*3*31*1440,CONFIG.intMonthlyExecutionsAt31Days);
  assert.throws(()=>buildMonitoringPlan({...CONFIG,strHost:'other.example'}),/Unreviewed/);
});
test('alerts require multiple failing locations and approved durations, notify open and recovery',()=>{
  for(const objCheck of CONFIG.arrChecks){const objPolicy=buildAlertPolicy('projects/capstone-510915/uptimeCheckConfigs/synthetic','projects/capstone-510915/notificationChannels/123',objCheck);
    const objThreshold=objPolicy.conditions[0].conditionThreshold;assert.equal(objThreshold.thresholdValue,1);assert.equal(objThreshold.duration,objCheck.intFailureSeconds+'s');
    assert.deepEqual(objPolicy.alertStrategy.notificationPrompts,['OPENED','CLOSED']);}
  assert.throws(()=>buildAlertPolicy('projects/other/uptimeCheckConfigs/test','projects/capstone-510915/notificationChannels/123',CONFIG.arrChecks[0]));
});
test('configuration creates only approved resources, reuses them and refuses conflicting channels',async()=>{
  const mapItems={'/uptimeCheckConfigs':[],'/notificationChannels':[],'/alertPolicies':[]};let intWrites=0;
  async function api(strPath,strMethod='GET',objBody){const strKey=strPath.slice(1);if(strMethod==='GET')return {[strKey]:mapItems[strPath]};intWrites++;
    const objItem={...objBody,name:`projects/capstone-510915${strPath}/`+(strPath==='/notificationChannels'?'123':objBody.displayName)};
    mapItems[strPath].push(objItem);return objItem;}
  assert.equal((await configureMonitoring(api,'operator@example.test')).intConfiguredChecks,2);assert.equal(intWrites,5);
  await configureMonitoring(api,'operator@example.test');assert.equal(intWrites,5);
  await assert.rejects(configureMonitoring(api,'someone-else@example.test'),/no overwrite/);
  mapItems['/alertPolicies'][0].conditions[0].conditionThreshold.thresholdValue=99;
  await assert.rejects(configureMonitoring(api,'operator@example.test'),/Existing policy differs/);
  assert.equal(intWrites,5);
});
