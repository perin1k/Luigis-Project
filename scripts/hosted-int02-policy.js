/**
 * Fixed bounds and labels for the approved hosted integration rehearsal. Synthetic
 * accounts/order activity must remain distinguishable and cleanup must be explicit.
 */
export const HOSTED_INT02_ORIGIN='https://luigispizzeria.duckdns.org';

export function verificationOrigin(strOrigin){
  const objOrigin=new URL(strOrigin);
  if(objOrigin.protocol!=='https:'||objOrigin.origin!==strOrigin||objOrigin.username||objOrigin.password
    ||(strOrigin!==HOSTED_INT02_ORIGIN&&!['localhost','127.0.0.1'].includes(objOrigin.hostname)))throw new Error('Approved HTTPS verification target required.');
  return {bFixture:strOrigin!==HOSTED_INT02_ORIGIN};
}
export function temporaryUsername(strRole,strRunId){
  if(!['employee','admin'].includes(strRole)||!/^[a-f0-9]{12}$/.test(strRunId))throw new Error('Invalid temporary account scope.');
  return `int02.${strRole}.${strRunId}`;
}
/** Only this run's exact generated usernames are eligible for cleanup. */
export async function cleanupTemporaryStaff(arrManaged,strRunId,{fnListStaff,fnListInvitations,fnDisable,fnRevoke}){
  let bComplete=true;
  for(const objManaged of arrManaged){
    if(objManaged.strUsername!==temporaryUsername(objManaged.strRole,strRunId))throw new Error('Cleanup scope rejected.');
    try{
      const objStaff=(await fnListStaff()).find(objRow=>objRow.strUsername===objManaged.strUsername);
      if(objStaff){
        if(objStaff.strRole!==objManaged.strRole||!Number.isSafeInteger(objStaff.intRevision))throw new Error();
        if(objStaff.strState!=='disabled')await fnDisable(objStaff);
        const objAfter=(await fnListStaff()).find(objRow=>objRow.strUsername===objManaged.strUsername);
        if(objAfter?.strState!=='disabled')throw new Error();
      }
      for(const objInvite of (await fnListInvitations()).filter(objRow=>objRow.strUsername===objManaged.strUsername&&objRow.strState==='pending'))await fnRevoke(objInvite);
    }catch{bComplete=false;}
  }
  return bComplete;
}
export function sanitizedHostedResult({strRunId,strOrigin,strFailureStage,arrPassed,bAccountsCleaned,bOrderResolved}){
  verificationOrigin(strOrigin);
  if(!/^[a-f0-9]{12}$/.test(strRunId)||arrPassed.some(strStage=>!HOSTED_STAGES.includes(strStage))
    ||(strFailureStage!==null&&!HOSTED_STAGES.includes(strFailureStage)))throw new Error('Invalid acceptance summary.');
  return {strTask:'INT-02',strRunId,strOrigin,dtFinishedAt:new Date().toISOString(),arrPassed:[...arrPassed],
    strFailureStage,bAccountsCleaned,bOrderResolved,bPassed:strFailureStage===null&&bAccountsCleaned===true&&bOrderResolved===true&&HOSTED_STAGES.every(strStage=>arrPassed.includes(strStage))};
}
export const HOSTED_STAGES=['owner-sign-in','temporary-enrollment','role-navigation','customer-order','employee-tracking','admin-review','owner-reporting','cleanup'];
