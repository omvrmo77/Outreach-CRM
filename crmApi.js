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
  myProfile:(token)=>crmRpc('crm_frontend_my_profile',{},token),
  bootstrapAvailable:(token)=>crmRpc('crm_frontend_bootstrap_available',{},token),
  claimFirstAdmin:(token,bootstrapToken)=>crmRpc('crm_frontend_claim_first_admin',{p_token:bootstrapToken},token),
  team:(token)=>crmRpc('crm_frontend_list_team',{},token),
  setProfileAccess:(token,{userId,role,approvalStatus,isActive=true})=>crmRpc('crm_frontend_set_profile_access',{p_user_id:userId,p_role:role,p_approval_status:approvalStatus,p_is_active:isActive},token),
  state:(token,{productCode})=>crmRpc('crm_frontend_state',{p_product_code:productCode},token),
  addConnectionsBatch:(token,{productCode,accountId,items,sentAt})=>crmRpc('crm_frontend_add_connections_batch_v2',{p_product_code:productCode,p_outreach_account_id:accountId,p_items:items,p_sent_at:sentAt||null},token),
  addRelationship:(token,{productCode,accountId,payload,companyId=null,contactId=null,matchedConnectionId=null,forceNewContact=false,messageText,occurredAt})=>crmRpc('crm_frontend_upsert_relationship_v2',{p_product_code:productCode,p_outreach_account_id:accountId,p_payload:payload,p_company_id:companyId||null,p_contact_id:contactId||null,p_matched_connection_id:matchedConnectionId||null,p_force_new_contact:Boolean(forceNewContact),p_message_text:messageText,p_occurred_at:occurredAt},token),
  recordEvent:(token,payload)=>crmRpc('crm_frontend_record_event',payload,token),
  updateEvent:(token,payload)=>crmRpc('crm_frontend_update_event_v2',payload,token),
  deleteEvent:(token,{eventId,reason})=>crmRpc('crm_frontend_soft_delete_event',{p_event_id:eventId,p_reason:reason||null},token),
  undoLastAction:(token,{relationshipId})=>crmRpc('crm_frontend_undo_last_action',{p_relationship_id:relationshipId},token),
  archiveCompany:(token,{productCode,companyId,reason})=>crmRpc('crm_frontend_archive_company',{p_product_code:productCode,p_company_id:companyId,p_reason:reason||'Relationship archived'},token),
  dailyMetrics:(token,args)=>crmRpc('crm_get_daily_metrics',args,token),
  needsAttention:(token,args)=>crmRpc('crm_get_needs_attention',args,token),
  masterCompanyText:(token,{productCode})=>crmRpc('crm_get_master_company_text',{p_product_code:productCode},token),
  checkBatch:(token,{productCode,items})=>crmRpc('crm_frontend_check_batch',{p_product_code:productCode,p_items:items},token),
  exportSnapshot:(token,{productCode})=>crmRpc('crm_export_snapshot',{p_product_code:productCode},token)
};
