import { backendConfig } from './backendConfig.js';

const headers=(token='')=>({
  apikey:backendConfig.publishableKey,
  ...(token?{Authorization:`Bearer ${token}`}:{Authorization:`Bearer ${backendConfig.publishableKey}`}),
  'Content-Type':'application/json'
});

const parseResponse=async(response)=>{
  const text=await response.text();
  if(response.ok) return text?JSON.parse(text):null;
  let message=text||`Request failed (${response.status})`;
  try{
    const parsed=JSON.parse(text);
    message=parsed.message||parsed.msg||parsed.error_description||parsed.error||message;
  }catch{}
  const error=new Error(message);
  error.status=response.status;
  error.payload=text;
  throw error;
};

export const crmRpc=async(name,args={},token='')=>{
  if(!backendConfig.enabled) throw new Error('Backend is disabled.');
  const response=await fetch(`${backendConfig.url}/rest/v1/rpc/${name}`,{
    method:'POST',headers:headers(token),body:JSON.stringify(args)
  });
  return parseResponse(response);
};


export const edgeFunctionRequest=async(name,{body={},token=''}={})=>{
  if(!backendConfig.enabled) throw new Error('Backend is disabled.');
  const response=await fetch(`${backendConfig.url}/functions/v1/${name}`,{
    method:'POST',
    headers:{
      apikey:backendConfig.publishableKey,
      ...(token?{Authorization:`Bearer ${token}`}:{ }),
      'Content-Type':'application/json'
    },
    body:JSON.stringify(body||{})
  });
  return parseResponse(response);
};

export const authRequest=async(path,{method='POST',body=null,token=''}={})=>{
  if(!backendConfig.enabled) throw new Error('Backend is disabled.');
  const response=await fetch(`${backendConfig.url}/auth/v1/${path}`,{
    method,
    headers:headers(token),
    body:body===null?undefined:JSON.stringify(body)
  });
  return parseResponse(response);
};

export const backendOperations={
  myProfile:(token)=>crmRpc('crm_frontend_my_profile_v2',{},token),
  bootstrapAvailable:(token)=>crmRpc('crm_frontend_bootstrap_available',{},token),
  claimFirstAdmin:(token,bootstrapToken)=>crmRpc('crm_frontend_claim_first_admin',{p_token:bootstrapToken},token),
  team:(token)=>crmRpc('crm_frontend_list_team_v3',{},token),
  setProfileAccess:(token,{userId,role,approvalStatus,isActive=true,productCodes=[]})=>crmRpc('crm_frontend_set_profile_access_v2',{p_user_id:userId,p_role:role,p_approval_status:approvalStatus,p_is_active:isActive,p_product_codes:productCodes},token),
  inviteMember:(token,{email,fullName,role,productCodes=[]})=>edgeFunctionRequest('invite-crm-member',{token,body:{email,fullName,role,productCodes}}),
  acceptInvite:({token,password})=>edgeFunctionRequest('accept-crm-invite',{body:{token,password}}),
  state:(token,{productCode})=>crmRpc('crm_frontend_state_fast_v7',{p_product_code:productCode},token),
  companyBundle:(token,{productCode,companyId})=>crmRpc('crm_frontend_company_bundle_v5',{p_product_code:productCode,p_company_id:companyId},token),
  connectionsByIds:(token,{productCode,ids})=>crmRpc('crm_frontend_connections_by_ids_v2',{p_product_code:productCode,p_ids:ids},token),
  eventsByConnectionIds:(token,{productCode,ids})=>crmRpc('crm_frontend_events_by_connection_ids_v2',{p_product_code:productCode,p_ids:ids},token),
  historicalConnectionsPage:(token,{productCode,offset=0,limit=50})=>crmRpc('crm_frontend_historical_connections_page_v2',{p_product_code:productCode,p_offset:offset,p_limit:limit},token),
  addConnectionsBatch:(token,{productCode,accountId,items,sentAt,workdayDate=null})=>crmRpc('crm_frontend_add_connections_batch_v5',{p_product_code:productCode,p_outreach_account_id:accountId,p_items:items,p_sent_at:sentAt||null,p_workday_date:workdayDate||null},token),
  addRelationship:(token,{productCode,accountId,payload,companyId=null,contactId=null,matchedConnectionId=null,forceNewContact=false,messageText,occurredAt,workdayDate=null})=>crmRpc('crm_frontend_upsert_relationship_v6',{p_product_code:productCode,p_outreach_account_id:accountId,p_payload:payload,p_company_id:companyId||null,p_contact_id:contactId||null,p_matched_connection_id:matchedConnectionId||null,p_force_new_contact:Boolean(forceNewContact),p_message_text:messageText,p_occurred_at:occurredAt,p_workday_date:workdayDate||null},token),
  recordEvent:(token,payload)=>crmRpc('crm_frontend_record_event_v3',payload,token),
  updateEvent:(token,payload)=>crmRpc('crm_frontend_update_event_v4',payload,token),
  deleteEvent:(token,{eventId,reason})=>crmRpc('crm_frontend_soft_delete_event_v2',{p_event_id:eventId,p_reason:reason||null},token),
  undoLastAction:(token,{relationshipId})=>crmRpc('crm_frontend_undo_last_action_v2',{p_relationship_id:relationshipId},token),
  archiveCompany:(token,{productCode,companyId,reason})=>crmRpc('crm_frontend_archive_company_v2',{p_product_code:productCode,p_company_id:companyId,p_reason:reason||'Relationship archived'},token),
  dailyMetrics:(token,args)=>crmRpc('crm_get_daily_metrics_v2',args,token),
  needsAttention:(token,args)=>crmRpc('crm_get_needs_attention_v2',args,token),
  masterCompanyText:(token,{productCode})=>crmRpc('crm_get_master_company_text_v2',{p_product_code:productCode},token),
  checkBatch:(token,{productCode,items})=>crmRpc('crm_frontend_check_batch_v2',{p_product_code:productCode,p_items:items},token),
  exportSnapshot:(token,{productCode})=>crmRpc('crm_export_snapshot_v2',{p_product_code:productCode},token),
  reportSummary:(token,{ownerUserId=null,startDate,endDate,productCodes=null})=>crmRpc('crm_frontend_report_summary_v2',{p_owner_user_id:ownerUserId||null,p_start_date:startDate,p_end_date:endDate,p_product_codes:productCodes},token)
};
