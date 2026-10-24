import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {buildProvisionPlan,verifyExisting} from '../../scripts/provision-gcp.js';

const CONFIG=JSON.parse(readFileSync(new URL('../../deploy/gcp-provisioning.json',import.meta.url)));
test('approved GCP plan keeps Spot, retained storage, restricted SSH and no application cloud identity',()=>{
  const arrPlan=buildProvisionPlan(CONFIG);const arrVm=arrPlan.find(objStep=>objStep.strKind==='vm').arrArgs;
  for(const strFlag of ['--machine-type=e2-small','--provisioning-model=SPOT','--instance-termination-action=STOP',
    '--no-boot-disk-auto-delete','--boot-disk-size=20GB','--boot-disk-type=pd-balanced','--no-service-account',
    '--no-scopes','--termination-time=2026-11-02T05:00:00Z'])assert.ok(arrVm.includes(strFlag),strFlag);
  assert.ok(arrVm.some(strFlag=>strFlag.startsWith('--create-disk=')&&strFlag.includes('size=10GB')&&strFlag.includes('auto-delete=no')));
  const arrSsh=arrPlan.find(objStep=>objStep.strName.endsWith('iap-ssh')).arrArgs;
  assert.ok(arrSsh.includes('--source-ranges=35.235.240.0/20'));assert.ok(arrSsh.includes('--allow=tcp:22'));
  assert.equal(arrSsh.some(strFlag=>strFlag.includes('0.0.0.0/0')),false);
  assert.equal(arrPlan.some(objStep=>objStep.arrArgs.includes('delete')),false);
});

test('an existing broad SSH rule is rejected rather than reused or overwritten',()=>{
  const objStep=buildProvisionPlan(CONFIG).find(objRow=>objRow.strName.endsWith('iap-ssh'));
  const objRule={name:objStep.strName,description:'Luigis Project approved preview',direction:'INGRESS',
    network:'projects/example/global/networks/'+CONFIG.strNetwork,targetTags:[CONFIG.strVm],
    allowed:[{IPProtocol:'tcp',ports:['22']}],sourceRanges:['35.235.240.0/20']};
  assert.doesNotThrow(()=>verifyExisting(objStep,objRule,CONFIG));
  assert.throws(()=>verifyExisting(objStep,{...objRule,sourceRanges:['0.0.0.0/0']},CONFIG),/no overwrite/);
  assert.throws(()=>verifyExisting(objStep,{...objRule,description:'owned by another task'},CONFIG),/no overwrite/);
});

test('unreviewed machine, project, image, network range and deadline changes fail before any cloud action',()=>{
  for(const objChange of [{strMachine:'e2-medium'},{strProject:'other-project'},{strImage:'ubuntu-latest'},
    {strCidr:'0.0.0.0/0'},{strStopAt:'2026-12-02T05:00:00Z'},{strVm:'unsafe;command'}])
    assert.throws(()=>buildProvisionPlan({...CONFIG,...objChange}));
});
