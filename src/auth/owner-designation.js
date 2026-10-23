import {randomUUID} from 'node:crypto';
import {createSessionService} from './session-service.js';

/** Private operator migration only. Never mount this as an HTTP operation. */
export function designateOwner(objDatabase,strSessionToken,{fnNow=()=>new Date()}={}){
  return createSessionService(objDatabase,{fnNow}).executeAuthorized(strSessionToken,'employees.manage',(objIdentity,dtNow)=>{
    if(objIdentity.strRole!=='admin'||objDatabase.prepare('SELECT user_id FROM staff_ownership').get())return null;
    const objSession=objDatabase.prepare('SELECT mfa_verified_at FROM staff_sessions WHERE id=?').get(objIdentity.strSessionId);
    if(!objSession||dtNow.getTime()-Date.parse(objSession.mfa_verified_at)>300000)return null;
    if(objDatabase.prepare('SELECT id FROM staff_sessions WHERE user_id=? AND revoked_at IS NULL AND last_activity_at>?').get(objIdentity.strUserId,dtNow.toISOString()))return null;
    objDatabase.prepare('UPDATE staff_sessions SET revoked_at=? WHERE user_id=? AND revoked_at IS NULL').run(dtNow.toISOString(),objIdentity.strUserId);
    objDatabase.prepare('UPDATE staff_users SET revision=revision+1 WHERE id=?').run(objIdentity.strUserId);
    objDatabase.prepare('INSERT INTO staff_ownership VALUES(1,?,?)').run(objIdentity.strUserId,dtNow.toISOString());
    const strId=randomUUID();objDatabase.prepare(`INSERT INTO audit_events(id,actor_id,action,entity_type,entity_id,occurred_at,correlation_id,reason_code,safe_change_summary)
      VALUES(?,?,'staff_change','staff_user',?,?,?,'security','Staff account changed')`).run(strId,objIdentity.strUserId,objIdentity.strUserId,dtNow.toISOString(),strId);
    return {strState:'owner_designated'};
  });
}
