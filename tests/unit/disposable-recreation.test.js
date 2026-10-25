import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {fileURLToPath} from 'node:url';
import {spawnSync,spawn} from 'node:child_process';
import {once} from 'node:events';
import {randomBytes,randomUUID,createHash} from 'node:crypto';
import {openDatabase} from '../../src/data/database.js';
import {createCatalogService} from '../../src/ordering/catalog-service.js';
import {createOrderService} from '../../src/ordering/order-service.js';
import {createSchedulingService} from '../../src/ordering/scheduling-service.js';
import {createDemoPaymentService} from '../../src/payments/demo-payment-service.js';
import {createSyntheticVault} from '../../src/payments/synthetic-vault.js';
import {createTrackingService} from '../../src/tracking/tracking-service.js';
import {createMenuService} from '../../src/staff/menu-service.js';
import {createSessionService} from '../../src/auth/session-service.js';

test('CLI recreation is isolated from retained history; restart, seed and abrupt-write recovery preserve committed records',{timeout:20000},async()=>{
  const strDirectory=mkdtempSync(join(tmpdir(),'luigis-recreation-'));const strSource=join(strDirectory,'retained.sqlite');const strFresh=join(strDirectory,'fresh.sqlite');let objDatabase;let objChild;
  const fnNow=()=>new Date('2026-10-21T15:00:00.000Z');const objKeys={strActiveKeyId:'fixture',mapKeys:{fixture:randomBytes(32).toString('hex')}};
  function initialize(strPath){for(const strScript of ['migrate.js','seed-menu.js']){const objResult=spawnSync(process.execPath,[fileURLToPath(new URL(`../../scripts/${strScript}`,import.meta.url))],{env:{...process.env,DATABASE_PATH:strPath},encoding:'utf8'});assert.equal(objResult.status,0,'Isolated migration/seed CLI must succeed.');}}
  function services(){const objCatalog=createCatalogService(objDatabase);const objScheduling=createSchedulingService(objDatabase,{fnNow:()=>fnNow().toISOString()});const objTracking=createTrackingService(objDatabase,undefined,{fnNow});return {objCatalog,objScheduling,objTracking,objPayments:createDemoPaymentService(objDatabase,{objCatalogService:objCatalog,objSchedulingService:objScheduling,objTrackingService:objTracking,objVault:createSyntheticVault(objKeys)})};}
  const arrHistoryTables=['orders','order_quotes','order_lines','demo_payment_attempts','demo_financial_allocations','tracking_grants','notification_outbox'];
  function history(){return JSON.stringify(arrHistoryTables.map((strTable)=>objDatabase.prepare(`SELECT * FROM ${strTable} ORDER BY id`).all()));}
  try{
    initialize(strSource);objDatabase=openDatabase(strSource);let objServices=services();const strOrderId=randomUUID();const strPaymentId=randomUUID();
    createOrderService(objDatabase,objServices.objCatalog,objServices.objScheduling).submitOrder({strRequestId:strOrderId,strService:'carry-out',objContact:{strName:'Synthetic recreation guest',strPhone:'2025550100',strEmail:''},objPricing:{strCatalogFingerprint:objServices.objCatalog.readCatalog().strFingerprint,arrPizzas:[{strSize:'medium',strCrust:'regular',arrToppings:['pepperoni'],intQuantity:1}],arrDrinks:[],intTipPercent:0},objPickup:objServices.objScheduling.listOptions(1).arrOptions[0]});
    const objReceipt=objServices.objPayments.pay({strOrderId,strRequestId:strPaymentId,strMethod:'card'});assert.equal(objReceipt.strState,'succeeded');
    const strToken=randomBytes(32).toString('hex');objDatabase.prepare("INSERT INTO staff_users (id,identity_subject,role,created_at) VALUES ('fixture-admin','fixture-admin','admin',?)").run(fnNow().toISOString());objDatabase.prepare('INSERT INTO staff_sessions (id,user_id,session_token_digest,authenticated_at,last_activity_at,mfa_verified_at,expires_at) VALUES (?,?,?,?,?,?,?)').run(randomUUID(),'fixture-admin',createHash('sha256').update(strToken).digest('hex'),fnNow().toISOString(),fnNow().toISOString(),fnNow().toISOString(),'2026-10-21T23:00:00.000Z');
    objDatabase.prepare('INSERT INTO staff_ownership VALUES(1,?,?)').run('fixture-admin',fnNow().toISOString());
    const objMenu=createMenuService(objDatabase,createSessionService(objDatabase,{fnNow}));const objBefore=objMenu.read(strToken);objMenu.prices(strToken,{strFingerprint:objBefore.objCatalog.strFingerprint,arrSizes:objBefore.objCatalog.arrSizes.map(({strCode,centsBase,centsTopping})=>({strCode,centsBase:centsBase+100,centsTopping})),arrDrinkSizes:objBefore.objCatalog.arrDrinkSizes.map(({strCode,centsPrice})=>({strCode,centsPrice}))});
    const objOnion=objMenu.read(strToken).arrIngredients.find((objRow)=>objRow.strLabel==='Onion');objMenu.availability(strToken,{strId:objOnion.strId,intRevision:objOnion.intRevision,bAvailable:false});
    const strHistory=history();const arrChecksums=objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all();objDatabase.close();objDatabase=undefined;
    initialize(strSource);objDatabase=openDatabase(strSource);objServices=services();assert.deepEqual(objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all(),arrChecksums);assert.equal(objDatabase.prepare('SELECT count(*) AS n FROM staff_users').get().n,1);assert.equal(history(),strHistory);assert.equal(objServices.objCatalog.readCatalog().arrSizes[0].centsBase,600);assert.equal(objDatabase.prepare("SELECT is_available FROM ingredients WHERE code='onion'").get().is_available,0);
    assert.equal(objServices.objPayments.pay({strOrderId,strRequestId:strPaymentId,strMethod:'card'}).bReplayed,true);assert.equal(history(),strHistory);assert.equal(objServices.objTracking.readTracking(objReceipt.strTrackingPath.split('#')[1]).strStatus,'Received');
    const objSecret=objDatabase.prepare('SELECT * FROM demo_payment_secrets WHERE payment_id=?').get(strPaymentId);const objIdentity={strPaymentId,strOrderId,strQuoteId:objDatabase.prepare('SELECT quote_id FROM demo_payment_attempts WHERE id=?').get(strPaymentId).quote_id};const objEncrypted={strKeyId:objSecret.key_id,strNonceHex:objSecret.nonce_hex,strCiphertextHex:objSecret.ciphertext_hex,strTagHex:objSecret.tag_hex};
    assert.equal(/^0000\d{12}$/.test(createSyntheticVault(objKeys).decrypt(objEncrypted,objIdentity)),true);assert.throws(()=>createSyntheticVault({strActiveKeyId:'fixture',mapKeys:{fixture:randomBytes(32).toString('hex')}}).decrypt(objEncrypted,objIdentity),/Unable to verify/);
    objDatabase.close();objDatabase=undefined;
    objChild=spawn(process.execPath,[fileURLToPath(new URL('../fixtures/recreation-interruption.js',import.meta.url))],{env:{...process.env,DATABASE_PATH:strSource,LUIGIS_DISPOSABLE_RECREATION:'1'},stdio:['ignore','ignore','pipe','ipc']});
    await new Promise((fnResolve,fnReject)=>{const intTimer=setTimeout(()=>fnReject(new Error('Disposable interruption fixture did not become ready.')),5000);objChild.once('message',()=>{clearTimeout(intTimer);fnResolve();});objChild.once('error',(objError)=>{clearTimeout(intTimer);fnReject(objError);});objChild.once('exit',()=>{clearTimeout(intTimer);fnReject(new Error('Interruption fixture exited early.'));});});const pExit=once(objChild,'exit');objChild.kill('SIGKILL');await pExit;
    initialize(strSource);objDatabase=openDatabase(strSource);assert.equal(history(),strHistory);assert.equal(objDatabase.prepare("SELECT id FROM catalog_versions WHERE id='uncommitted-recreation-fixture'").get(),undefined);assert.equal(objDatabase.prepare("SELECT is_available FROM ingredients WHERE code='onion'").get().is_available,0);assert.equal(objDatabase.prepare('PRAGMA integrity_check').get().integrity_check,'ok');assert.deepEqual(objDatabase.prepare('PRAGMA foreign_key_check').all(),[]);objDatabase.close();objDatabase=undefined;
    initialize(strFresh);objDatabase=openDatabase(strFresh);assert.deepEqual(objDatabase.prepare('SELECT version,name,checksum FROM schema_migrations ORDER BY version').all(),arrChecksums);assert.equal(createCatalogService(objDatabase).readCatalog().arrSizes[0].centsBase,500);
    for(const strTable of [...arrHistoryTables,'staff_users','demo_payment_secrets','audit_events'])assert.equal(objDatabase.prepare(`SELECT count(*) AS n FROM ${strTable}`).get().n,0,strTable);objDatabase.close();objDatabase=openDatabase(strSource);assert.equal(history(),strHistory);
  }finally{if(objChild&&objChild.exitCode===null&&objChild.signalCode===null){const pExit=once(objChild,'exit');objChild.kill('SIGKILL');await pExit;}objDatabase?.close();rmSync(strDirectory,{recursive:true,force:true});}
});
