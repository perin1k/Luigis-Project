import {createHash,randomBytes,randomUUID} from 'node:crypto';
import {hashPassword,verifyPassword} from '../auth/password-service.js';
import {validateNewPassword} from '../auth/password-policy.js';
import {runTransaction} from '../data/database.js';
import {orderRetentionDeadline} from '../data/order-retention.js';

const IDLE_MS=30*60000;const ABSOLUTE_MS=8*3600000;
// Match the reviewed staff login's constant dummy work for unknown usernames.
const DUMMY_HASH=`scrypt-v1$131072$8$1$${'0'.repeat(32)}$${'0'.repeat(128)}`;
export class CustomerError extends Error{
  constructor(strMessage,intStatus=400){super(strMessage);this.intStatus=intStatus;}
}
export function digestCustomerToken(strToken){
  return typeof strToken==='string'&&/^[a-f0-9]{64}$/.test(strToken)?createHash('sha256').update(strToken).digest('hex'):null;
}
function username(strValue){
  if(typeof strValue!=='string'||! /^[a-zA-Z0-9_.-]{3,64}$/.test(strValue))throw new CustomerError('Use a username of 3–64 letters, numbers, dots, underscores or hyphens.');
  return strValue.toLowerCase();
}
function profile(objInput){
  if(!objInput||Object.keys(objInput).sort().join(',')!=='strEmail,strName,strPhone')throw new CustomerError('Check your saved contact details.');
  const objClean={};
  for(const strKey of ['strName','strPhone','strEmail']){
    if(typeof objInput[strKey]!=='string'||/[\p{Cc}\p{Cf}]/u.test(objInput[strKey]))throw new CustomerError('Check your saved contact details.');
    objClean[strKey]=objInput[strKey].trim();
  }
  if(objClean.strName.length>100||objClean.strPhone.length>40||objClean.strEmail.length>254
    ||objClean.strPhone&&(!/^[+()0-9 .-]+$/.test(objClean.strPhone)||! /^[0-9]{7,15}$/.test(objClean.strPhone.replace(/\D/g,'')))
    ||objClean.strEmail&&!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(objClean.strEmail))throw new CustomerError('Enter a usable name, phone number and email, or leave optional fields empty.');
  return objClean;
}
/** Private account data; order/contact expiry stays independent of profile lifetime. */
export function createCustomerService(objDatabase,{fnNow=()=>new Date()}={}){
  function now(){const dtNow=fnNow();if(!(dtNow instanceof Date)||!Number.isFinite(dtNow.getTime()))throw new Error('Server clock required.');return dtNow;}
  function recoveryCodes(strId){
    objDatabase.prepare('DELETE FROM customer_recovery_codes WHERE customer_id=?').run(strId);
    return Array.from({length:8},()=>{const strCode=randomBytes(32).toString('hex');objDatabase.prepare('INSERT INTO customer_recovery_codes VALUES (?,?)').run(digestCustomerToken(strCode),strId);return strCode;});
  }
  function issueSession(strId){
    const dtNow=now();const strToken=randomBytes(32).toString('hex');
    objDatabase.prepare('DELETE FROM customer_sessions WHERE expires_at<=? OR last_activity_at<=?').run(dtNow.toISOString(),new Date(dtNow.getTime()-IDLE_MS).toISOString());
    // Bound sessions per account without extending any absolute deadline.
    objDatabase.prepare('DELETE FROM customer_sessions WHERE token_digest IN (SELECT token_digest FROM customer_sessions WHERE customer_id=? ORDER BY authenticated_at DESC,token_digest LIMIT -1 OFFSET 9)').run(strId);
    objDatabase.prepare('INSERT INTO customer_sessions VALUES (?,?,?,?,?)').run(digestCustomerToken(strToken),strId,dtNow.toISOString(),dtNow.toISOString(),new Date(dtNow.getTime()+ABSOLUTE_MS).toISOString());
    return strToken;
  }
  function resolveInsideTransaction(strToken){
    const strDigest=digestCustomerToken(strToken);if(!strDigest)return null;
    const objRow=objDatabase.prepare('SELECT a.*,s.authenticated_at,s.last_activity_at,s.expires_at FROM customer_sessions s JOIN customer_accounts a ON a.id=s.customer_id WHERE s.token_digest=?').get(strDigest);
    if(!objRow)return null;const dtNow=now();
    const numAuthenticated=Date.parse(objRow.authenticated_at);const numLast=Date.parse(objRow.last_activity_at);const numExpires=Date.parse(objRow.expires_at);
    if(![numAuthenticated,numLast,numExpires].every(Number.isFinite)||numLast<numAuthenticated||dtNow.getTime()<numLast||numExpires-numAuthenticated!==ABSOLUTE_MS||dtNow.getTime()>=numExpires||dtNow.getTime()-numLast>=IDLE_MS){objDatabase.prepare('DELETE FROM customer_sessions WHERE token_digest=?').run(strDigest);return null;}
    objDatabase.prepare('UPDATE customer_sessions SET last_activity_at=? WHERE token_digest=?').run(dtNow.toISOString(),strDigest);
    return objRow;
  }
  function withAccount(strToken,fnWork){return runTransaction(objDatabase,()=>{const objRow=resolveInsideTransaction(strToken);if(!objRow)throw new CustomerError('Please sign in again.',401);return fnWork(objRow);});}
  function publicProfile(objRow){return {strUsername:objRow.username,intRevision:objRow.revision,objProfile:{strName:objRow.customer_name,strPhone:objRow.phone,strEmail:objRow.email}};}
  async function register(strUsername,strPassword){
    const strUser=username(strUsername);
    if(!validateNewPassword(strPassword,strUser))throw new CustomerError('Choose a unique passphrase of at least 15 characters.');
    const strHash=await hashPassword(strPassword);
    return runTransaction(objDatabase,()=>{
      if(objDatabase.prepare('SELECT id FROM customer_accounts WHERE username=?').get(strUser))throw new CustomerError('That username is unavailable. Choose another.',409);
      const strId=randomUUID();objDatabase.prepare('INSERT INTO customer_accounts(id,username,password_hash,created_at) VALUES (?,?,?,?)').run(strId,strUser,strHash,now().toISOString());
      return {strToken:issueSession(strId),arrRecoveryCodes:recoveryCodes(strId)};
    });
  }
  // A valid dummy hash keeps unknown-name checks on the same password primitive.
  async function login(strUsername,strPassword){
    let strUser;try{strUser=username(strUsername);}catch{strUser='';}
    const objBefore=objDatabase.prepare('SELECT * FROM customer_accounts WHERE username=?').get(strUser);
    const bValid=await verifyPassword(strPassword,objBefore?.password_hash??DUMMY_HASH);
    if(!objBefore||!bValid)throw new CustomerError('Username or password was not accepted.',403);
    return runTransaction(objDatabase,()=>{const objCurrent=objDatabase.prepare('SELECT revision,password_hash FROM customer_accounts WHERE id=?').get(objBefore.id);
      if(!objCurrent||objCurrent.revision!==objBefore.revision||objCurrent.password_hash!==objBefore.password_hash)throw new CustomerError('Your account changed. Please sign in again.',409);
      return {strToken:issueSession(objBefore.id)};});
  }
  async function recover(strUsername,strCode,strNewPassword){
    const strUser=username(strUsername);const strDigest=digestCustomerToken(strCode);
    const objBefore=objDatabase.prepare('SELECT a.* FROM customer_accounts a JOIN customer_recovery_codes r ON r.customer_id=a.id WHERE a.username=? AND r.code_digest=?').get(strUser,strDigest);
    if(!objBefore)throw new CustomerError('The username or recovery code was not accepted.',403);
    if(!validateNewPassword(strNewPassword,strUser))throw new CustomerError('Choose a unique passphrase of at least 15 characters.');
    const strHash=await hashPassword(strNewPassword);
    return runTransaction(objDatabase,()=>{
      const objCurrent=objDatabase.prepare('SELECT revision FROM customer_accounts WHERE id=?').get(objBefore.id);
      if(objCurrent?.revision!==objBefore.revision||!objDatabase.prepare('SELECT code_digest FROM customer_recovery_codes WHERE customer_id=? AND code_digest=?').get(objBefore.id,strDigest))throw new CustomerError('Your account changed. Begin recovery again.',409);
      objDatabase.prepare('UPDATE customer_accounts SET password_hash=?,revision=revision+1 WHERE id=?').run(strHash,objBefore.id);
      objDatabase.prepare('DELETE FROM customer_sessions WHERE customer_id=?').run(objBefore.id);
      return {arrRecoveryCodes:recoveryCodes(objBefore.id)};
    });
  }
  async function deleteAccount(strToken,strPassword){
    const objBefore=withAccount(strToken,objRow=>({...objRow}));
    if(!await verifyPassword(strPassword,objBefore.password_hash))throw new CustomerError('Password was not accepted.',403);
    return withAccount(strToken,objCurrent=>{if(objCurrent.revision!==objBefore.revision)throw new CustomerError('Your account changed. Review it and try again.',409);
      objDatabase.prepare('DELETE FROM customer_accounts WHERE id=?').run(objCurrent.id);return {strMessage:'Your account was deleted. Existing orders were not cancelled.'};});
  }
  function orders(strToken,strReference){return withAccount(strToken,objAccount=>{
    const arrRows=objDatabase.prepare(`SELECT o.* FROM customer_order_links l JOIN orders o ON o.id=l.order_id JOIN order_contacts c ON c.order_id=o.id
      WHERE l.customer_id=? AND c.redacted_at IS NULL AND EXISTS(SELECT 1 FROM demo_payment_attempts p WHERE p.order_id=o.id AND p.state='succeeded')
      ${strReference?'AND o.public_reference=?':''} ORDER BY o.created_at DESC,o.id LIMIT 100`).all(...[objAccount.id,...(strReference?[strReference]:[])]);
    return arrRows.filter(objRow=>{const dtDeadline=orderRetentionDeadline(objDatabase,objRow);return !dtDeadline||dtDeadline>now().toISOString();}).map(objRow=>({strReference:objRow.public_reference,strStatus:objRow.fulfillment_status,dtCreatedAt:objRow.created_at,
      arrItems:objDatabase.prepare('SELECT display_name_snapshot AS strName,quantity AS intQuantity FROM order_lines WHERE order_id=? ORDER BY line_number').all(objRow.id),
      objTotals:objDatabase.prepare('SELECT total_cents AS centsTotal FROM order_quotes WHERE id=?').get(objRow.accepted_quote_id),
      bRefunded:Boolean(objDatabase.prepare("SELECT id FROM demo_refund_attempts WHERE order_id=? AND state='succeeded'").get(objRow.id))}));
  });}
  return {register,login,recover,deleteAccount,resolveInsideTransaction,
    readProfile:strToken=>withAccount(strToken,publicProfile),
    updateProfile(strToken,objInput,intRevision){const objClean=profile(objInput);return withAccount(strToken,objRow=>{
      if(!Number.isSafeInteger(intRevision)||intRevision!==objRow.revision)throw new CustomerError('Your details changed. Reload before saving.',409);
      objDatabase.prepare('UPDATE customer_accounts SET customer_name=?,phone=?,email=?,revision=revision+1 WHERE id=?').run(objClean.strName,objClean.strPhone,objClean.strEmail,objRow.id);return {strMessage:'Your contact details were saved.'};});},
    orders,logout(strToken){const strDigest=digestCustomerToken(strToken);if(strDigest)objDatabase.prepare('DELETE FROM customer_sessions WHERE token_digest=?').run(strDigest);}
  };
}
