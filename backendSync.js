import { backendConfig } from './backendConfig.js';
import { backendOperations } from './crmApi.js';
import { getAccessToken, getCurrentUser } from './authState.js';
import { hydrateBackendState, getRelationshipId, getCompany, getActivities } from './crmState.js';

export const isBackendEnabled=()=>Boolean(backendConfig.enabled);

const tokenOrThrow=async()=>{
  const token=await getAccessToken();
  if(!token) throw new Error('Your session expired. Sign in again.');
  return token;
};

export const syncBackendState=async(project)=>{
  if(!backendConfig.enabled) return null;
  const token=await tokenOrThrow();
  const snapshot=await backendOperations.state(token,{productCode:project});
  hydrateBackendState(project,snapshot||{});
  return snapshot;
};

export const backendAddConnection=async(project,payload)=>{
  const token=await tokenOrThrow();
  const rows=await backendOperations.addConnectionsBatch(token,{
    productCode:project,accountId:payload.accountId,sentAt:payload.sentAt,
    items:[{name:payload.name,company:payload.company,companyId:payload.companyId||'',contactId:payload.contactId||'',messageBody:payload.messageBody||''}]
  });
  const row=Array.isArray(rows)?rows[0]:null;
  if(!row) return {ok:false,reason:'backend-error'};
  if(row.status!=='added') return {ok:false,reason:row.status,...row};
  await syncBackendState(project);
  return {ok:true,connectionId:row.connection_id,...row};
};

export const backendAddConnectionsBulk=async(project,{items,accountId,sentAt})=>{
  const token=await tokenOrThrow();
  const rows=await backendOperations.addConnectionsBatch(token,{productCode:project,accountId,sentAt,items});
  const list=Array.isArray(rows)?rows:[];
  await syncBackendState(project);
  return {
    added:list.filter(x=>x.status==='added').length,
    duplicates:list.filter(x=>x.status==='duplicate').length,
    ambiguous:list.filter(x=>x.status==='ambiguous-contact'||x.status==='ambiguous-company').length,
    archived:list.filter(x=>x.status==='archived-company').length,
    future:0,
    results:list
  };
};

export const backendAddCompany=async(project,parsed,{accountId,messageBody,messageSentAt,forceNewContact=false,companyId='',contactId='',matchedConnectionId=''}={})=>{
  const token=await tokenOrThrow();
  const result=await backendOperations.addRelationship(token,{
    productCode:project,accountId,payload:parsed,companyId:companyId||null,contactId:forceNewContact?null:(contactId||null),matchedConnectionId:matchedConnectionId||null,
    forceNewContact,messageText:messageBody,occurredAt:messageSentAt
  });
  if(!result?.ok){
    if(result?.reason==='duplicate-contact') result.reason='duplicate';
    return result||{ok:false,reason:'backend-error'};
  }
  await syncBackendState(project);
  const company=getCompany(project,result.company_id||companyId||parsed.Company||'');
  return {...result,company,matchedConnection:Boolean(result.connection_id),reusedInitialMessage:Boolean(result.reused_message)};
};

const backendEventType=(type='')=>({replied:'reply_received',followup_sent:'follow_up_sent',followup_scheduled:'follow_up_scheduled'}[type]||type);

export const backendRecordCompanyAction=async(project,companyRef,type,{at,scheduledFor,detail='',detailLabel='',secondaryDetail='',secondaryLabel='',contactId='',accountId='',meetingId='',followupId=''}={})=>{
  const relationshipId=getRelationshipId(project,companyRef,contactId);
  if(!relationshipId) throw new Error('This contact is not linked to a backend relationship yet.');
  const token=await tokenOrThrow();
  const eventType=backendEventType(type);
  const messageText=['message_sent','followup_sent'].includes(type)?detail:null;
  const replyText=type==='replied'?detail:null;
  const note=['note_added','connection_accepted','meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done'].includes(type)?detail:null;
  const result=await backendOperations.recordEvent(token,{
    p_relationship_id:relationshipId,
    p_event_type:eventType,
    p_occurred_at:at,
    p_outreach_account_id:accountId||null,
    p_message_text:messageText,
    p_reply_text:replyText,
    p_note:note,
    p_scheduled_for:type==='followup_scheduled'?null:(scheduledFor||null),
    p_scheduled_end_at:null,
    p_follow_up_due_at:type==='followup_scheduled'?(scheduledFor||null):null,
    p_meeting_id:meetingId||null,
    p_followup_id:followupId||null,
    p_metadata:{detail_label:detailLabel||'',secondary_detail:secondaryDetail||'',secondary_label:secondaryLabel||''}
  });
  await syncBackendState(project);
  return result;
};

export const backendUpdateActivity=async(project,activityId,{at,scheduledFor,detail='',secondaryDetail='',secondaryLabel='',detailLabel='',contactId='',accountId='',type=''}={})=>{
  const token=await tokenOrThrow();
  const eventType=type||'';
  const result=await backendOperations.updateEvent(token,{
    p_event_id:activityId,
    p_occurred_at:at||null,
    p_outreach_account_id:accountId||null,
    p_message_text:['message_sent','followup_sent'].includes(eventType)?detail:null,
    p_reply_text:eventType==='replied'?detail:null,
    p_note:['note_added','connection_accepted','meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done'].includes(eventType)?detail:null,
    p_scheduled_for:eventType==='followup_scheduled'?null:(scheduledFor||null),
    p_scheduled_end_at:null,
    p_follow_up_due_at:eventType==='followup_scheduled'?(scheduledFor||null):null,
    p_contact_id:contactId||null,
    p_metadata:{detail_label:detailLabel||'',secondary_detail:secondaryDetail||'',secondary_label:secondaryLabel||''}
  });
  await syncBackendState(project);
  return result;
};

export const backendDeleteActivity=async(project,eventId,reason='Activity deleted')=>{
  const token=await tokenOrThrow();
  const result=await backendOperations.deleteEvent(token,{eventId,reason});
  await syncBackendState(project);
  return result;
};

export const backendUndoLastAction=async(project,companyRef,contactId='')=>{
  const company=getCompany(project,companyRef);
  const userId=getCurrentUser()?.id||'';
  const latest=getActivities(project,companyRef).find(a=>a.type!=='connection_sent'&&a.type!=='company_added'&&(!userId||a.actorId===userId));
  const targetContactId=contactId||latest?.contactId||company?.primaryContactId||'';
  const relationshipId=getRelationshipId(project,companyRef,targetContactId);
  if(!relationshipId) return {ok:false,reason:'nothing-to-undo'};
  const token=await tokenOrThrow();
  const result=await backendOperations.undoLastAction(token,{relationshipId});
  await syncBackendState(project);
  return result;
};

export const backendArchiveCompany=async(project,companyId)=>{
  const token=await tokenOrThrow();
  const result=await backendOperations.archiveCompany(token,{productCode:project,companyId,reason:'Relationship archived from CRM'});
  await syncBackendState(project);
  return result;
};

export const backendTeam=async()=>backendOperations.team(await tokenOrThrow());
export const backendSetProfileAccess=async(payload)=>backendOperations.setProfileAccess(await tokenOrThrow(),payload);

export const backendCheckBatch=async(project,items)=>backendOperations.checkBatch(await tokenOrThrow(),{productCode:project,items});
