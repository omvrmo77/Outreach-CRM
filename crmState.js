import {
  withinRange,
  getWorkspaceDateKey,
  getWorkspaceDayRange,
  addWorkspaceDays,
  formatDateTime,
  workspaceDayDifference
} from './date.js?v=20260918-gmt4-1';

const STORAGE_KEY = 'lfg-crm-v16-empty-state';
const ACCOUNT_KEY = 'lfg-crm-v16-selected-account';
const ATTENTION_PENDING_DAYS = 7;
const PROJECTS = ['LFG','O1'];

let nowProvider = () => new Date();
const currentInstant = () => {
  const value = nowProvider();
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? new Date() : date;
};
const validInstant = (value) => {
  const date = value instanceof Date ? new Date(value.getTime()) : new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
};
const hasOccurred = (value, nowValue = currentInstant()) => {
  const at = validInstant(value);
  const now = validInstant(nowValue);
  return !!at && !!now && at <= now;
};

export const accounts = [
  { id: '57fcb679-65ca-4c4d-a206-fa3428802e45', platform: 'LinkedIn', owner: 'Saif', label: 'Saif · LinkedIn' },
  { id: '7496ea09-06fd-43ba-8ffb-2b8c6ce8137e', platform: 'LinkedIn', owner: 'Austin', label: 'Austin · LinkedIn' },
  { id: '077de9dc-13fc-4c72-b661-203f924d7aed', platform: 'X', owner: 'Action', label: 'Action · X' }
];

const backendMasterCompanies={LFG:null,O1:null};
let backendProfiles=[];
let backendServerNow='';
const backendHistoricalConnectionPaging={LFG:{total:0,loaded:0},O1:{total:0,loaded:0}};

const frontendEventType=(type='')=>({
  reply_received:'replied',
  follow_up_sent:'followup_sent',
  follow_up_scheduled:'followup_scheduled'
}[type]||type);

const backendOwnerName=(id,snapshotName='',profiles=new Map())=>profiles.get(id)?.full_name||profiles.get(id)?.username||snapshotName||'Unknown';
const parseMasterCompanyText=(text='')=>[...new Set(String(text||'').split(/\r?\n|\\n/g).map(x=>x.trim()).filter(Boolean))];

const seed = () => ({
  connections: { LFG: [], O1: [] },
  companies: { LFG: [], O1: [] },
  companyOverrides: { LFG: {}, O1: {} },
  auditTrail: { LFG: [], O1: [] },
  activities: { LFG: [], O1: [] },
  dailyReports: { LFG: [], O1: [] }
});

const createId = (prefix='record') => {
  try {
    if (globalThis.crypto?.randomUUID) return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch {}
  const random = Math.random().toString(36).slice(2,12);
  return `${prefix}-${Date.now().toString(36)}-${random}`;
};

// Search/equality helper only. Stable IDs, not names, are the canonical foreign keys.
// Punctuation is intentionally preserved so A&B and AB (or C++ and C) do not collide.
export const canonicalizeIdentity = (value='') => String(value ?? '')
  .normalize('NFKC')
  .trim()
  .toLocaleLowerCase()
  .replace(/\s+/g, ' ');

// Broader normalization is only for optional duplicate-warning hints/migration fallback.
const duplicateFingerprint = (value='') => {
  const normalized=canonicalizeIdentity(value);
  const lettersAndNumbers=normalized.replace(/[^\p{L}\p{N}]+/gu,'');
  return lettersAndNumbers || `symbol:${normalized}`;
};
const sameDisplay = (a,b) => canonicalizeIdentity(a) === canonicalizeIdentity(b);

const eventSequenceRank = (type='') => ({
  connection_sent:10, connection_accepted:20, company_added:30, contact_added:35,
  message_sent:40, followup_scheduled:50, followup_sent:60, replied:70,
  meeting_booked:80, meeting_scheduled:90, meeting_rescheduled:100,
  meeting_done:110, note_added:120
}[type] || 999);

const compareActivitiesDesc = (a,b) => {
  const timeDiff = new Date(b.at||0) - new Date(a.at||0);
  if (timeDiff) return timeDiff;
  const rankDiff = eventSequenceRank(b.type) - eventSequenceRank(a.type);
  if (rankDiff) return rankDiff;
  return new Date(b.recordedAt||0) - new Date(a.recordedAt||0);
};

const compareActivitiesAsc = (a,b) => -compareActivitiesDesc(a,b);

const contactObject = ({ name, role='', accountId='', createdAt='', id:contactId='', ...extra }={}) => ({
  ...extra,
  id: contactId || createId('contact'),
  name: String(name || '').trim(),
  role: String(role || '').trim(),
  accountId: accountId || '',
  createdAt: createdAt || new Date().toISOString()
});

const ensureCompanyContacts = (row) => {
  if (!Array.isArray(row.contacts)) row.contacts=[];
  if (!row.contacts.length && row.contact && row.contact !== '—') {
    row.contacts.push(contactObject({ name:row.contact, role:row.role === '—' ? '' : row.role, accountId:row.accountId||'', createdAt:row.addedAt||'' }));
  }
  row.contacts=row.contacts.map(c=>contactObject(c));
  row.primaryContactId = row.primaryContactId && row.contacts.some(c=>c.id===row.primaryContactId)
    ? row.primaryContactId
    : (row.contacts[0]?.id || '');
  return row.contacts;
};

const exactCompanyMatch = (rows, ref) => rows.find(x=>!x.deletedAt && (x.id===ref || sameDisplay(x.company,ref))) || null;
const archivedCompanyMatch = (rows, ref) => rows.find(x=>x.deletedAt && (x.id===ref || sameDisplay(x.company,ref))) || null;
const companyById = (rows, id) => rows.find(x=>!x.deletedAt && x.id===id) || null;

const assignOperationalIds = (activities) => {
  const byContact=new Map();
  const sorted=[...activities].filter(x=>!x.deletedAt).sort(compareActivitiesAsc);
  for(const event of sorted){
    const contactKey=event.contactId || `${event.companyId||duplicateFingerprint(event.company)}::${canonicalizeIdentity(event.contact||'')}`;
    if(!byContact.has(contactKey)) byContact.set(contactKey,{meetingId:'',followupId:''});
    const cursor=byContact.get(contactKey);
    if(['meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done'].includes(event.type)){
      if(!event.meetingId){
        if(event.type==='meeting_booked' || !cursor.meetingId) cursor.meetingId=createId('meeting');
        event.meetingId=cursor.meetingId;
      }
      cursor.meetingId=event.meetingId;
      if(event.type==='meeting_done') cursor.meetingId='';
    }
    if(['followup_scheduled','followup_sent'].includes(event.type)){
      if(!event.followupId){
        if(event.type==='followup_scheduled' || !cursor.followupId) cursor.followupId=createId('followup');
        event.followupId=cursor.followupId;
      }
      cursor.followupId=event.followupId;
      if(event.type==='followup_sent') cursor.followupId='';
    }
  }
};

const repairOperationalContactConsistency = (activities) => {
  for (const idField of ['meetingId','followupId']) {
    const groups = new Map();
    for (const event of activities.filter(x=>!x.deletedAt&&x[idField])) {
      if(!groups.has(event[idField])) groups.set(event[idField],[]);
      groups.get(event[idField]).push(event);
    }
    for (const events of groups.values()) {
      if(events.length<2) continue;
      const canonical=[...events].sort((a,b)=>{
        const aStamp=new Date(a.updatedAt||a.recordedAt||a.at||0).getTime();
        const bStamp=new Date(b.updatedAt||b.recordedAt||b.at||0).getTime();
        return bStamp-aStamp;
      })[0];
      const identity={
        companyId:canonical.companyId||'', company:canonical.company||'',
        contactId:canonical.contactId||'', contact:canonical.contact||'', contactRole:canonical.contactRole||''
      };
      for(const event of events) Object.assign(event,identity);
    }
  }
};

const migrateProjectState = (parsed, project) => {
  parsed.auditTrail[project]=parsed.auditTrail[project]||[];
  parsed.activities[project]=parsed.activities[project]||[];
  parsed.connections[project]=parsed.connections[project]||[];
  parsed.companies[project]=parsed.companies[project]||[];
  parsed.companyOverrides[project]=parsed.companyOverrides[project]||{};

  const companies=parsed.companies[project];
  companies.forEach(raw=>{
    raw.id=raw.id||createId('company');
    ensureCompanyContacts(raw);
  });

  const findCompanyForLegacy=(name)=>{
    const exact=companies.filter(c=>!c.deletedAt&&sameDisplay(c.company,name));
    if(exact.length===1) return exact[0];
    const fuzzy=companies.filter(c=>!c.deletedAt&&duplicateFingerprint(c.company)===duplicateFingerprint(name));
    return fuzzy.length===1?fuzzy[0]:null;
  };

  parsed.connections[project].forEach(conn=>{
    conn.id=conn.id||createId('conn');
    const company=companyById(companies,conn.companyId)||findCompanyForLegacy(conn.company);
    if(company){
      conn.companyId=company.id;
      conn.company=company.company;
      const contacts=ensureCompanyContacts(company).filter(c=>sameDisplay(c.name,conn.name));
      if(!conn.contactId && contacts.length===1) conn.contactId=contacts[0].id;
      const linked=company.contacts.find(c=>c.id===conn.contactId);
      if(linked){conn.name=linked.name;conn.contactRole=linked.role||'';}
    } else conn.companyId=conn.companyId||'';
    conn.contactId=conn.contactId||'';
    conn.contactRole=conn.contactRole||'';
  });

  parsed.activities[project].forEach(event=>{
    event.id=event.id||createId('act');
    event.recordedAt=event.recordedAt||event.at||new Date().toISOString();
    const company=companyById(companies,event.companyId)||findCompanyForLegacy(event.company);
    if(company){
      event.companyId=company.id;
      event.company=company.company;
      const contacts=ensureCompanyContacts(company);
      if(!event.contactId){
        const matching=contacts.filter(c=>sameDisplay(c.name,event.contact));
        if(matching.length===1) event.contactId=matching[0].id;
      }
    }
    event.companyId=event.companyId||'';
    event.contactId=event.contactId||'';
  });
  assignOperationalIds(parsed.activities[project]);
  repairOperationalContactConsistency(parsed.activities[project]);

  // Migrate old name-keyed projection overrides to stable company IDs.
  const oldOverrides=parsed.companyOverrides[project];
  const migratedOverrides={};
  companies.filter(c=>!c.deletedAt).forEach(company=>{
    const candidate=oldOverrides[company.id]
      || oldOverrides[canonicalizeIdentity(company.company)]
      || oldOverrides[duplicateFingerprint(company.company)];
    if(candidate) migratedOverrides[company.id]=candidate;
  });
  parsed.companyOverrides[project]=migratedOverrides;
};

const normalizeLoadedState = (parsed) => {
  parsed.auditTrail=parsed.auditTrail||{LFG:[],O1:[]};
  parsed.activities=parsed.activities||{LFG:[],O1:[]};
  parsed.connections=parsed.connections||{LFG:[],O1:[]};
  parsed.companies=parsed.companies||{LFG:[],O1:[]};
  parsed.companyOverrides=parsed.companyOverrides||{LFG:{},O1:{}};
  parsed.dailyReports=parsed.dailyReports||{LFG:[],O1:[]};
  PROJECTS.forEach(p=>{
    parsed.dailyReports[p]=Array.isArray(parsed.dailyReports[p])?parsed.dailyReports[p]:[];
    migrateProjectState(parsed,p);
  });
  return parsed;
};

const load = () => {
  try {
    const raw=localStorage.getItem(STORAGE_KEY);
    if(raw){
      const parsed=normalizeLoadedState(JSON.parse(raw));
      localStorage.setItem(STORAGE_KEY,JSON.stringify(parsed));
      return parsed;
    }
  } catch {}
  const initial=seed();
  localStorage.setItem(STORAGE_KEY,JSON.stringify(initial));
  return initial;
};

let state=load();
const save=()=>localStorage.setItem(STORAGE_KEY,JSON.stringify(state));

const getRawCompany = (project, companyRef) => exactCompanyMatch(state.companies[project]||[],companyRef);
const resolveCompanyId = (project, companyRef) => getRawCompany(project,companyRef)?.id || '';
const activityMatchesCompany = (activity, raw) => activity.companyId ? activity.companyId===raw.id : sameDisplay(activity.company,raw.company);
const connectionMatchesCompany = (connection, raw) => connection.companyId ? connection.companyId===raw.id : sameDisplay(connection.company,raw.company);
const activityMatchesContact = (activity, contact) => activity.contactId ? activity.contactId===contact.id : sameDisplay(activity.contact,contact.name);

const activeActivitiesFor = (project, companyRef='', {occurredOnly=false,nowValue=currentInstant()}={}) => {
  let rows=(state.activities[project]||[]).filter(x=>!x.deletedAt);
  if(occurredOnly) rows=rows.filter(x=>hasOccurred(x.at,nowValue));
  if(companyRef){
    const raw=getRawCompany(project,companyRef);
    if(raw) rows=rows.filter(x=>activityMatchesCompany(x,raw));
    else rows=rows.filter(x=>sameDisplay(x.company,companyRef));
  }
  return rows.sort(compareActivitiesDesc);
};

const materializeCompany = (project, raw) => {
  ensureCompanyContacts(raw);
  const occurred=activeActivitiesFor(project,raw.id,{occurredOnly:true});
  const latestStatus=occurred.find(x=>actionMap?.[x.type]?.status);
  const override=latestStatus?{status:actionMap[latestStatus.type].status,nextStep:deriveNextStep(latestStatus)}:{};
  const merged={...raw,...override,contacts:raw.contacts.map(c=>({...c}))};
  const primary=merged.contacts.find(c=>c.id===merged.primaryContactId)||merged.contacts[0]||null;
  merged.primaryContactId=primary?.id||'';
  merged.contact=primary?.name||'—';
  merged.role=primary?.role||'—';
  merged.accountId=primary?.accountId||merged.accountId||'';
  return merged;
};

export const getCompanyContacts = (companyOrProject, maybeRef='') => {
  const company=typeof companyOrProject==='string'?getCompany(companyOrProject,maybeRef):companyOrProject;
  return Array.isArray(company?.contacts)?company.contacts.map(c=>({...c})):[];
};


export const hydrateBackendState = (project,snapshot={}) => {
  if(!PROJECTS.includes(project)) return false;
  const rawAccounts=Array.isArray(snapshot.accounts)?snapshot.accounts:[];
  if(rawAccounts.length){
    accounts.splice(0,accounts.length,...rawAccounts.map(a=>({
      id:a.id, platform:a.platform||'LinkedIn', owner:a.owner||'', label:a.label||`${a.owner||''} · ${a.platform||''}`.trim(), handle:a.handle||''
    })));
  }
  backendProfiles=Array.isArray(snapshot.profiles)?snapshot.profiles.map(p=>({...p})):[];
  backendServerNow=snapshot.server_now||'';
  backendMasterCompanies[project]=parseMasterCompanyText(snapshot.master_company_text||'');
  backendHistoricalConnectionPaging[project]={
    total:Number(snapshot.historical_connection_count||0),
    loaded:0
  };

  const companyRows=Array.isArray(snapshot.companies)?snapshot.companies:[];
  const contactRows=Array.isArray(snapshot.contacts)?snapshot.contacts:[];
  const relationshipRows=Array.isArray(snapshot.relationships)?snapshot.relationships:[];
  const connectionRows=Array.isArray(snapshot.connections)?snapshot.connections:[];
  const eventRows=Array.isArray(snapshot.events)?snapshot.events:[];
  const dailyReportRows=Array.isArray(snapshot.daily_reports)?snapshot.daily_reports:[];
  const profileMap=new Map(backendProfiles.map(p=>[p.id,p]));
  const companiesById=new Map(companyRows.map(c=>[c.id,c]));
  const contactsById=new Map(contactRows.map(c=>[c.id,c]));
  const relByContact=new Map();
  relationshipRows.forEach(r=>{
    if(!relByContact.has(r.contact_id)) relByContact.set(r.contact_id,[]);
    relByContact.get(r.contact_id).push(r);
  });

  const companyMap=new Map();
  for(const rel of relationshipRows){
    const c=companiesById.get(rel.company_id)||{};
    const ct=contactsById.get(rel.contact_id)||{};
    let company=companyMap.get(rel.company_id);
    const owner=backendOwnerName(rel.owner_user_id,rel.historical_owner_name,profileMap);
    if(!company){
      company={
        id:rel.company_id,company:c.name||rel.company_name_snapshot||'Unknown company',contacts:[],primaryContactId:'',owner,
        agenda:rel.agenda||rel.lead_type||'—',projectSummary:rel.project_summary||'',whyInteresting:rel.why_interesting||'',
        angle:rel.potential_lfg_angle||rel.product_angle||'',personality:ct.personality||'',fundingStatus:rel.funding_status||'',website:c.website||'',
        targetCategory:rel.target_category||'',priority:rel.priority||'',recommendedTiming:rel.recommended_timing||'',bestPlatform:rel.best_platform||'',
        primaryRoute:rel.primary_route||'',fallbackRoute:rel.fallback_route||'',whyThisContact:rel.why_this_contact||'',desiredOutcome:rel.desired_outcome||'',
        telegramUsername:ct.telegram_username||'',groupChat:rel.group_chat||'',notes:rel.notes||'',addedAt:c.registry_added_at||rel.created_at||c.created_at||'',registryAddedAt:c.registry_added_at||'',nextStep:rel.next_step||'Review relationship',
        status:rel.status||'Company Added',local:false,provisional:Boolean(rel.provisional ?? rel.raw_source?.provisional),deletedAt:null,relationshipIds:[]
      };
      companyMap.set(rel.company_id,company);
    }
    company.relationshipIds.push(rel.id);
    if(!company.contacts.some(x=>x.id===rel.contact_id)){
      company.contacts.push({
        id:rel.contact_id,name:ct.full_name||rel.contact_name_snapshot||'—',role:ct.title||'',accountId:rel.outreach_account_id||'',createdAt:ct.created_at||rel.created_at||'',
        relationshipId:rel.id,relationshipIds:(relByContact.get(rel.contact_id)||[]).map(x=>x.id),owner,ownerId:rel.owner_user_id||''
      });
    }
    if(!company.primaryContactId) company.primaryContactId=rel.contact_id||'';
  }

  // Permanent registry: companies remain visible even when they do not currently
  // have an outreach relationship (for example, connection-only companies).
  const connectionRowsByCompany=new Map();
  connectionRows.forEach(row=>{
    if(!row?.company_id) return;
    if(!connectionRowsByCompany.has(row.company_id)) connectionRowsByCompany.set(row.company_id,[]);
    connectionRowsByCompany.get(row.company_id).push(row);
  });
  const contactRowsByCompany=new Map();
  contactRows.forEach(row=>{
    if(!row?.company_id) return;
    if(!contactRowsByCompany.has(row.company_id)) contactRowsByCompany.set(row.company_id,[]);
    contactRowsByCompany.get(row.company_id).push(row);
  });

  for(const c of companyRows){
    if(companyMap.has(c.id)) continue;
    const companyConnections=[...(connectionRowsByCompany.get(c.id)||[])].sort((a,b)=>new Date(b.created_at||b.sent_at||0)-new Date(a.created_at||a.sent_at||0));
    const latestConnection=companyConnections[0]||{};
    const companyContacts=(contactRowsByCompany.get(c.id)||[]).map(ct=>{
      const related=companyConnections.find(x=>x.contact_id===ct.id)||{};
      return {
        id:ct.id,name:ct.full_name||'—',role:ct.title||'',accountId:related.outreach_account_id||'',
        createdAt:ct.created_at||related.created_at||c.registry_added_at||'',
        relationshipId:'',relationshipIds:[],
        owner:backendOwnerName(related.owner_user_id,related.historical_owner_name,profileMap),
        ownerId:related.owner_user_id||''
      };
    });
    const owner=backendOwnerName(latestConnection.owner_user_id,latestConnection.historical_owner_name,profileMap);
    companyMap.set(c.id,{
      id:c.id,company:c.name||'Unknown company',contacts:companyContacts,primaryContactId:companyContacts[0]?.id||'',owner,
      agenda:'—',projectSummary:'',whyInteresting:'',angle:'',personality:'',fundingStatus:'',website:c.website||'',
      targetCategory:'',priority:'',recommendedTiming:'',bestPlatform:'',primaryRoute:'',fallbackRoute:'',whyThisContact:'',desiredOutcome:'',
      telegramUsername:'',groupChat:'',notes:c.notes||'',addedAt:c.registry_added_at||c.created_at||'',registryAddedAt:c.registry_added_at||'',
      nextStep:'Complete outreach details',status:latestConnection.status||'Connection Added',local:false,provisional:true,deletedAt:null,relationshipIds:[]
    });
  }

  state.companies[project]=[...companyMap.values()];

  state.connections[project]=connectionRows.map(row=>{
    const c=companiesById.get(row.company_id)||{}; const ct=contactsById.get(row.contact_id)||{};
    const historicalOnly=Boolean(row.historical_only ?? row.raw_source?.historical_connection_only);
    return {
      id:row.id,name:ct.full_name||row.contact_name_snapshot||'—',contactRole:ct.title||'',company:c.name||row.company_name_snapshot||'—',companyId:row.company_id||'',contactId:row.contact_id||'',
      provisionalContact:!row.contact_id,owner:historicalOnly?'':backendOwnerName(row.owner_user_id,row.historical_owner_name,profileMap),ownerId:row.owner_user_id||'',accountId:historicalOnly?'':(row.outreach_account_id||''),
      status:historicalOnly?'Historical':(row.status||'Pending'),sentAt:historicalOnly?(row.sent_at||null):(row.sent_at||row.created_at),acceptedAt:row.accepted_at||null,messageSentAt:row.message_sent_at||null,
      acceptanceMethod:row.acceptance_method||'',createdAt:row.created_at||row.sent_at||'',historicalOnly,local:false,deletedAt:null
    };
  });

  const eventLabel={connection_sent:'Connection sent',connection_accepted:'Connection accepted',company_added:'Company added',contact_added:'Contact added',message_sent:'Message sent',
    followup_scheduled:'Follow-up scheduled',followup_sent:'Follow-up sent',replied:'They replied',meeting_booked:'Meeting booked',meeting_scheduled:'Meeting scheduled',meeting_rescheduled:'Meeting rescheduled',meeting_done:'Meeting done',note_added:'Note added'};
  state.dailyReports[project]=dailyReportRows.map(row=>({
    id:row.id||'',
    date:String(row.report_date||''),
    owner:backendOwnerName(row.owner_user_id,row.historical_owner_name,profileMap),
    ownerId:row.owner_user_id||'',
    connectionsSent:Number(row.connections_sent||0),
    connectionsAccepted:Number(row.connections_accepted||0),
    messagesSent:Number(row.messages_sent||0),
    companiesResearched:Number(row.companies_researched||0),
    meetingsBooked:Number(row.meetings_booked||0),
    meetingsQualified:Number(row.meetings_qualified||0),
    historical:Boolean(row.historical ?? row.raw_source?.reported_totals),
    sourceKind:row.source_kind||row.raw_source?.source_kind||'',
    notes:row.notes||''
  }));

  state.activities[project]=eventRows.map(row=>{
    const type=frontendEventType(row.event_type); const ct=contactsById.get(row.contact_id)||{}; const c=companiesById.get(row.company_id)||{}; const metadata=row.metadata||{};
    let detail=row.note||'';
    if(['message_sent','followup_sent'].includes(type)) detail=row.message_text||row.note||'';
    else if(type==='replied') detail=row.reply_text||row.note||'';
    return {
      id:row.id,recordedAt:row.recorded_at||row.occurred_at,deletedAt:null,actionGroupId:row.action_group_id||'',companyId:row.company_id||'',company:c.name||row.company_name_snapshot||'',
      contactId:row.contact_id||'',contact:ct.full_name||row.contact_name_snapshot||'',contactRole:ct.title||row.contact_title_snapshot||'',
      owner:backendOwnerName(row.relationship_owner_user_id,row.relationship_owner_snapshot,profileMap),ownerId:row.relationship_owner_user_id||'',actor:row.actor_name_snapshot||backendOwnerName(row.actor_user_id,'',profileMap),
      actorId:row.actor_user_id||'',accountId:row.outreach_account_id||'',type,label:eventLabel[type]||type,at:row.occurred_at,workdayDate:row.workday_date||metadata.workday_date||'',
      scheduledFor:row.scheduled_for||row.follow_up_due_at||null,previousScheduledFor:row.previous_scheduled_for||null,
      detail,detailLabel:metadata.detail_label||'',secondaryDetail:metadata.secondary_detail||'',secondaryLabel:metadata.secondary_label||'',note:row.note||'',
      meetingId:row.meeting_id||'',followupId:row.followup_id||'',sourceConnectionId:row.connection_id||'',sourceConfidence:row.source_confidence||'',
      inferredFromActivityId:metadata.inferred_from_event_id||'',reportOnly:Boolean(metadata.report_only_historical),metadata
    };
  });
  state.companyOverrides[project]={};
  state.auditTrail[project]=(Array.isArray(snapshot.change_history)?snapshot.change_history:[]).map(row=>{
    const before=row.before_values||{}; const after=row.after_values||{};
    const companyId=after.company_id||before.company_id||(row.table_name==='companies'?row.record_id:'');
    const company=after.company_name_snapshot||before.company_name_snapshot||after.name||before.name||companiesById.get(companyId)?.name||'';
    return {
      id:String(row.id||createId('audit')),companyId:companyId||'',company,activityId:row.table_name==='crm_events'?String(row.record_id||''):'',
      operation:String(row.operation||'').toLowerCase(),actor:row.changed_by_snapshot||backendOwnerName(row.changed_by_user_id,'',profileMap),actorId:row.changed_by_user_id||'',
      at:row.changed_at||new Date().toISOString(),before,after,reason:row.reason||'',table:row.table_name||''
    };
  });
  assignOperationalIds(state.activities[project]);
  repairOperationalContactConsistency(state.activities[project]);
  // Backend snapshots stay in memory. Persisting megabytes of live Supabase state to localStorage
  // synchronously caused UI freezes and is unnecessary because Supabase is the source of truth.
  return true;
};



export const getHistoricalConnectionPaging = (project) => ({...(backendHistoricalConnectionPaging[project]||{total:0,loaded:0})});

const mapBackendConnectionRow = (project,row) => {
  const profileMap=new Map(backendProfiles.map(p=>[p.id,p]));
  const company=getRawCompany(project,row.company_id||'');
  const contact=company?.contacts?.find(c=>c.id===row.contact_id)||null;
  const historicalOnly=Boolean(row.historical_only ?? row.raw_source?.historical_connection_only);
  return {
    id:row.id,
    name:contact?.name||row.contact_name_snapshot||'—',
    contactRole:contact?.role||row.contact_title||'',
    company:company?.company||row.company_name_snapshot||'—',
    companyId:row.company_id||'',
    contactId:row.contact_id||'',
    provisionalContact:!row.contact_id,
    owner:historicalOnly?'':backendOwnerName(row.owner_user_id,row.historical_owner_name,profileMap),
    ownerId:row.owner_user_id||'',
    accountId:historicalOnly?'':(row.outreach_account_id||''),
    status:historicalOnly?'Historical':(row.status||'Pending'),
    sentAt:historicalOnly?(row.sent_at||null):(row.sent_at||row.created_at),
    acceptedAt:row.accepted_at||null,
    messageSentAt:row.message_sent_at||null,
    acceptanceMethod:row.acceptance_method||'',
    createdAt:row.created_at||row.sent_at||'',
    historicalOnly,
    local:false,
    deletedAt:null
  };
};

export const mergeBackendConnections = (project,rows=[]) => {
  if(!PROJECTS.includes(project)||!Array.isArray(rows)) return 0;
  const current=state.connections[project]||[];
  const byId=new Map(current.map(x=>[x.id,x]));
  rows.forEach(row=>{
    if(!row?.id) return;
    const mapped=mapBackendConnectionRow(project,row);
    byId.set(row.id,mapped);
    if(mapped.company&&mapped.company!=='—'){
      backendMasterCompanies[project]=[...new Set([...(backendMasterCompanies[project]||[]),mapped.company])];
    }
  });
  state.connections[project]=[...byId.values()];
  return rows.length;
};

const mapBackendEventRow = (project,row) => {
  const profileMap=new Map(backendProfiles.map(p=>[p.id,p]));
  const company=getRawCompany(project,row.company_id||'');
  const contact=company?.contacts?.find(c=>c.id===row.contact_id)||null;
  const metadata=row.metadata||{};
  const type=frontendEventType(row.event_type);
  const eventLabel={connection_sent:'Connection sent',connection_accepted:'Connection accepted',company_added:'Company added',contact_added:'Contact added',message_sent:'Message sent',followup_scheduled:'Follow-up scheduled',followup_sent:'Follow-up sent',replied:'They replied',meeting_booked:'Meeting booked',meeting_scheduled:'Meeting scheduled',meeting_rescheduled:'Meeting rescheduled',meeting_done:'Meeting done',note_added:'Note added'};
  let detail=row.note||'';
  if(['message_sent','followup_sent'].includes(type)) detail=row.message_text||row.note||'';
  else if(type==='replied') detail=row.reply_text||row.note||'';
  return {
    id:row.id,recordedAt:row.recorded_at||row.occurred_at,deletedAt:null,actionGroupId:row.action_group_id||'',
    companyId:row.company_id||'',company:company?.company||row.company_name_snapshot||'',
    contactId:row.contact_id||'',contact:contact?.name||row.contact_name_snapshot||'',contactRole:contact?.role||row.contact_title_snapshot||'',
    owner:backendOwnerName(row.relationship_owner_user_id,row.relationship_owner_snapshot,profileMap),ownerId:row.relationship_owner_user_id||'',
    actor:row.actor_name_snapshot||backendOwnerName(row.actor_user_id,'',profileMap),actorId:row.actor_user_id||'',accountId:row.outreach_account_id||'',
    type,label:eventLabel[type]||type,at:row.occurred_at,workdayDate:row.workday_date||metadata.workday_date||'',
    scheduledFor:row.scheduled_for||row.follow_up_due_at||null,previousScheduledFor:row.previous_scheduled_for||null,
    detail,detailLabel:metadata.detail_label||'',secondaryDetail:metadata.secondary_detail||'',secondaryLabel:metadata.secondary_label||'',note:row.note||'',
    meetingId:row.meeting_id||'',followupId:row.followup_id||'',sourceConnectionId:row.connection_id||'',sourceConfidence:row.source_confidence||'',
    inferredFromActivityId:metadata.inferred_from_event_id||'',reportOnly:Boolean(metadata.report_only_historical),metadata
  };
};

export const mergeBackendEvents = (project,rows=[]) => {
  if(!PROJECTS.includes(project)||!Array.isArray(rows)) return 0;
  const current=state.activities[project]||[];
  const byId=new Map(current.map(x=>[x.id,x]));
  rows.forEach(row=>{
    if(!row?.id) return;
    byId.set(row.id,mapBackendEventRow(project,row));
  });
  state.activities[project]=[...byId.values()];
  assignOperationalIds(state.activities[project]);
  repairOperationalContactConsistency(state.activities[project]);
  return rows.length;
};

export const mergeBackendHistoricalConnections = (project,payload={}) => {
  const rows=Array.isArray(payload.rows)?payload.rows:[];
  mergeBackendConnections(project,rows);
  const current=backendHistoricalConnectionPaging[project]||{total:0,loaded:0};
  const total=Number(payload.total ?? current.total ?? 0);
  const loadedIds=new Set((state.connections[project]||[]).filter(x=>x.historicalOnly).map(x=>x.id));
  backendHistoricalConnectionPaging[project]={total,loaded:loadedIds.size};
  return getHistoricalConnectionPaging(project);
};

export const mergeBackendCompanyBundle = (project,companyId,bundle={}) => {
  if(!PROJECTS.includes(project)||!companyId) return false;
  const profileMap=new Map(backendProfiles.map(p=>[p.id,p]));
  const c=bundle.company||{};
  const contactRows=Array.isArray(bundle.contacts)?bundle.contacts:[];
  const relationshipRows=Array.isArray(bundle.relationships)?bundle.relationships:[];
  const connectionRows=Array.isArray(bundle.connections)?bundle.connections:[];
  const eventRows=Array.isArray(bundle.events)?bundle.events:[];
  const contactsById=new Map(contactRows.map(x=>[x.id,x]));
  const relByContact=new Map();
  relationshipRows.forEach(r=>{
    if(!relByContact.has(r.contact_id)) relByContact.set(r.contact_id,[]);
    relByContact.get(r.contact_id).push(r);
  });

  let company=null;
  for(const rel of relationshipRows){
    const ct=contactsById.get(rel.contact_id)||{};
    const owner=backendOwnerName(rel.owner_user_id,rel.historical_owner_name,profileMap);
    if(!company){
      company={
        id:companyId,company:c.name||rel.company_name_snapshot||getRawCompany(project,companyId)?.company||'Unknown company',contacts:[],primaryContactId:'',owner,
        agenda:rel.agenda||rel.lead_type||'—',projectSummary:rel.project_summary||'',whyInteresting:rel.why_interesting||'',
        angle:rel.potential_lfg_angle||rel.product_angle||'',personality:ct.personality||'',fundingStatus:rel.funding_status||'',website:c.website||'',
        targetCategory:rel.target_category||'',priority:rel.priority||'',recommendedTiming:rel.recommended_timing||'',bestPlatform:rel.best_platform||'',
        primaryRoute:rel.primary_route||'',fallbackRoute:rel.fallback_route||'',whyThisContact:rel.why_this_contact||'',desiredOutcome:rel.desired_outcome||'',
        telegramUsername:ct.telegram_username||'',groupChat:rel.group_chat||'',notes:rel.notes||'',addedAt:rel.created_at||'',nextStep:rel.next_step||'Review relationship',
        status:rel.status||'Company Added',local:false,provisional:Boolean(rel.provisional ?? rel.raw_source?.provisional),deletedAt:null,relationshipIds:[]
      };
    }
    company.relationshipIds.push(rel.id);
    if(!company.contacts.some(x=>x.id===rel.contact_id)){
      company.contacts.push({
        id:rel.contact_id,name:ct.full_name||rel.contact_name_snapshot||'—',role:ct.title||'',accountId:rel.outreach_account_id||'',createdAt:ct.created_at||rel.created_at||'',
        relationshipId:rel.id,relationshipIds:(relByContact.get(rel.contact_id)||[]).map(x=>x.id),owner,ownerId:rel.owner_user_id||''
      });
    }
    if(!company.primaryContactId) company.primaryContactId=rel.contact_id||'';
  }

  if(!company && c?.id){
    const companyConnections=[...connectionRows].sort((a,b)=>new Date(b.created_at||b.sent_at||0)-new Date(a.created_at||a.sent_at||0));
    const latestConnection=companyConnections[0]||{};
    const contactList=contactRows.map(ct=>{
      const related=companyConnections.find(x=>x.contact_id===ct.id)||{};
      return {
        id:ct.id,name:ct.full_name||'—',role:ct.title||'',accountId:related.outreach_account_id||'',
        createdAt:ct.created_at||related.created_at||c.registry_added_at||'',
        relationshipId:'',relationshipIds:[],
        owner:backendOwnerName(related.owner_user_id,related.historical_owner_name,profileMap),
        ownerId:related.owner_user_id||''
      };
    });
    company={
      id:companyId,company:c.name||'Unknown company',contacts:contactList,primaryContactId:contactList[0]?.id||'',
      owner:backendOwnerName(latestConnection.owner_user_id,latestConnection.historical_owner_name,profileMap),
      agenda:'—',projectSummary:'',whyInteresting:'',angle:'',personality:'',fundingStatus:'',website:c.website||'',
      targetCategory:'',priority:'',recommendedTiming:'',bestPlatform:'',primaryRoute:'',fallbackRoute:'',whyThisContact:'',desiredOutcome:'',
      telegramUsername:'',groupChat:'',notes:c.notes||'',addedAt:c.registry_added_at||c.created_at||'',registryAddedAt:c.registry_added_at||'',
      nextStep:'Complete outreach details',status:latestConnection.status||'Connection Added',local:false,provisional:true,deletedAt:null,relationshipIds:[]
    };
  }

  state.companies[project]=(state.companies[project]||[]).filter(x=>x.id!==companyId);
  if(company){
    state.companies[project].push(company);
    backendMasterCompanies[project]=[...new Set([...(backendMasterCompanies[project]||[]),company.company])];
  }

  state.connections[project]=(state.connections[project]||[]).filter(x=>x.companyId!==companyId);
  connectionRows.forEach(row=>state.connections[project].push(mapBackendConnectionRow(project,row)));

  const eventLabel={connection_sent:'Connection sent',connection_accepted:'Connection accepted',company_added:'Company added',contact_added:'Contact added',message_sent:'Message sent',
    followup_scheduled:'Follow-up scheduled',followup_sent:'Follow-up sent',replied:'They replied',meeting_booked:'Meeting booked',meeting_scheduled:'Meeting scheduled',meeting_rescheduled:'Meeting rescheduled',meeting_done:'Meeting done',note_added:'Note added'};
  const companyName=company?.company||c.name||'';
  const mappedEvents=eventRows.map(row=>{
    const type=frontendEventType(row.event_type); const ct=contactsById.get(row.contact_id)||{}; const metadata=row.metadata||{};
    let detail=row.note||'';
    if(['message_sent','followup_sent'].includes(type)) detail=row.message_text||row.note||'';
    else if(type==='replied') detail=row.reply_text||row.note||'';
    return {
      id:row.id,recordedAt:row.recorded_at||row.occurred_at,deletedAt:null,actionGroupId:row.action_group_id||'',companyId:row.company_id||companyId,company:companyName||row.company_name_snapshot||'',
      contactId:row.contact_id||'',contact:ct.full_name||row.contact_name_snapshot||'',contactRole:ct.title||row.contact_title_snapshot||'',
      owner:backendOwnerName(row.relationship_owner_user_id,row.relationship_owner_snapshot,profileMap),ownerId:row.relationship_owner_user_id||'',actor:row.actor_name_snapshot||backendOwnerName(row.actor_user_id,'',profileMap),
      actorId:row.actor_user_id||'',accountId:row.outreach_account_id||'',type,label:eventLabel[type]||type,at:row.occurred_at,workdayDate:row.workday_date||metadata.workday_date||'',
      scheduledFor:row.scheduled_for||row.follow_up_due_at||null,previousScheduledFor:row.previous_scheduled_for||null,
      detail,detailLabel:metadata.detail_label||'',secondaryDetail:metadata.secondary_detail||'',secondaryLabel:metadata.secondary_label||'',note:row.note||'',
      meetingId:row.meeting_id||'',followupId:row.followup_id||'',sourceConnectionId:row.connection_id||'',sourceConfidence:row.source_confidence||'',
      inferredFromActivityId:metadata.inferred_from_event_id||'',reportOnly:Boolean(metadata.report_only_historical),metadata
    };
  });
  assignOperationalIds(mappedEvents);
  repairOperationalContactConsistency(mappedEvents);
  state.activities[project]=(state.activities[project]||[]).filter(x=>x.companyId!==companyId).concat(mappedEvents);

  const mappedAudit=(Array.isArray(bundle.change_history)?bundle.change_history:[]).map(row=>{
    const before=row.before_values||{}; const after=row.after_values||{};
    return {
      id:String(row.id||createId('audit')),companyId,company:companyName||after.company_name_snapshot||before.company_name_snapshot||after.name||before.name||'',
      activityId:row.table_name==='crm_events'?String(row.record_id||''):'',operation:String(row.operation||'').toLowerCase(),
      actor:row.changed_by_snapshot||backendOwnerName(row.changed_by_user_id,'',profileMap),actorId:row.changed_by_user_id||'',at:row.changed_at||new Date().toISOString(),
      before,after,reason:row.reason||'',table:row.table_name||''
    };
  });
  state.auditTrail[project]=(state.auditTrail[project]||[]).filter(x=>x.companyId!==companyId).concat(mappedAudit);
  if(state.companyOverrides?.[project]) delete state.companyOverrides[project][companyId];
  return true;
};

export const getRelationshipId = (project, companyRef, contactId='') => {
  const raw=getRawCompany(project,companyRef); if(!raw) return '';
  const contact=ensureCompanyContacts(raw).find(c=>c.id===contactId)||ensureCompanyContacts(raw)[0];
  return contact?.relationshipId||'';
};

export const getAccount = (accountId) => accounts.find(a=>a.id===accountId)||{id:'',platform:'',owner:'',label:'Account not recorded',unknown:true};
export const getAccounts = () => [...accounts];
export const getSelectedAccount = (project) => {
  const stored=localStorage.getItem(`${ACCOUNT_KEY}-${project}`)||'';
  if(stored&&accounts.some(a=>a.id===stored)) return stored;
  return accounts.find(a=>a.platform==='LinkedIn'&&canonicalizeIdentity(a.owner)==='saif')?.id || accounts.find(a=>a.platform==='LinkedIn')?.id || accounts[0]?.id || '';
};
export const setSelectedAccount = (project, accountId) => { if(accounts.some(a=>a.id===accountId)) localStorage.setItem(`${ACCOUNT_KEY}-${project}`,accountId); };
export const getActiveOwners = () => {
  const names=[...new Set(backendProfiles.filter(p=>p.is_active!==false&&p.approval_status==='approved').map(p=>p.full_name||p.username).filter(Boolean))];
  return [{id:'ALL',label:'All team'},...(names.length?names:['Omar']).map(name=>({id:name,label:name}))];
};
export const getBackendProfiles = () => backendProfiles.map(p=>({...p}));
export const getBackendServerNow = () => backendServerNow;

export const getConnections = (project, nowValue=currentInstant()) => [...(state.connections[project]||[])]
  .filter(x=>!x.deletedAt&&(x.historicalOnly||hasOccurred(x.sentAt,nowValue)))
  .map(x=>x.historicalOnly?{...x}:projectConnectionForRead(project,x,nowValue))
  .filter(Boolean)
  .sort((a,b)=>{
    if(Boolean(a.historicalOnly)!==Boolean(b.historicalOnly)) return a.historicalOnly?1:-1;
    const addedDiff=new Date(b.createdAt||b.sentAt||0)-new Date(a.createdAt||a.sentAt||0);
    if(addedDiff) return addedDiff;
    return new Date(b.sentAt||0)-new Date(a.sentAt||0);
  });

const connectionContactMatch=(conn,{name='',contactId=''}={})=>contactId?conn.contactId===contactId:sameDisplay(conn.name,name);

export const findConnection = (project, name, companyRef, owner='', options={}) => {
  const raw=getRawCompany(project,companyRef);
  const matches=(state.connections[project]||[]).filter(x=>{
    if(x.deletedAt || x.historicalOnly || (owner && x.owner!==owner)) return false;
    if(options.accountId && x.accountId!==options.accountId) return false;
    if(raw ? !connectionMatchesCompany(x,raw) : !sameDisplay(x.company,companyRef)) return false;
    return connectionContactMatch(x,{name,contactId:options.contactId||''});
  });
  const rank=(x)=>{
    const account=getAccount(x.accountId);
    if(account.platform==='LinkedIn'&&x.status==='Pending') return 0;
    if(account.platform==='LinkedIn'&&x.status==='Accepted') return 1;
    if(account.platform==='LinkedIn'&&x.status==='Message Sent') return 2;
    return 3;
  };
  return matches.sort((a,b)=>rank(a)-rank(b)||new Date(b.sentAt)-new Date(a.sentAt))[0]||null;
};

const findCompanyContactsByName = (rawCompany, contactName) => {
  ensureCompanyContacts(rawCompany);
  return rawCompany.contacts.filter(c=>sameDisplay(c.name,contactName));
};

const addContactToCompany = (rawCompany,{name,role='',accountId='',createdAt='',force=false}={}) => {
  if(!name) return null;
  ensureCompanyContacts(rawCompany);
  const exact=rawCompany.contacts.find(c=>sameDisplay(c.name,name)&&sameDisplay(c.role||'',role||''));
  if(exact&&!force) return exact;
  const contact=contactObject({name,role,accountId,createdAt});
  rawCompany.contacts.push(contact);
  if(!rawCompany.primaryContactId) rawCompany.primaryContactId=contact.id;
  return contact;
};

const createCompanyRow = (project, parsed,{company,contact,owner,accountId,at,provisional=false}={}) => {
  const contactRow=contactObject({name:contact||'—',role:parsed.Title||'',accountId,createdAt:at});
  return {
    id:createId('company'), company,
    contacts:contact&&contact!=='—'?[contactRow]:[], primaryContactId:contact&&contact!=='—'?contactRow.id:'',
    status:'Company Added',owner,agenda:parsed.Agenda||parsed['Lead Type']||'—',
    projectSummary:parsed['Project Summary']||'',whyInteresting:parsed['Why Interesting']||'',
    angle:parsed['Potential LFG Angle']||parsed['Potential LFG Angle:']||parsed['01 Angle']||parsed['O1 Angle']||'',
    personality:parsed.Personality||'',fundingStatus:parsed['Funding Status']||'',website:parsed.Website||'',
    targetCategory:parsed['Target Category']||'',priority:parsed.Priority||'',recommendedTiming:parsed['Recommended Timing']||'',
    bestPlatform:parsed['Best Platform']||'',primaryRoute:parsed['Primary Route']||'',fallbackRoute:parsed['Fallback Route']||'',
    whyThisContact:parsed['Why This Contact']||'',desiredOutcome:parsed['Desired Outcome']||'',
    telegramUsername:parsed['Telegram Username']||parsed['TG Username']||'',groupChat:parsed['Group Chat']||'',
    notes:parsed.Notes||'',addedAt:at,nextStep:'Review relationship',local:true,provisional,deletedAt:null
  };
};

const applyParsedCompanyDetails=(raw,parsed)=>{
  const fields={
    agenda:parsed.Agenda||parsed['Lead Type'],projectSummary:parsed['Project Summary'],whyInteresting:parsed['Why Interesting'],
    angle:parsed['Potential LFG Angle']||parsed['Potential LFG Angle:']||parsed['01 Angle']||parsed['O1 Angle'],
    personality:parsed.Personality,fundingStatus:parsed['Funding Status'],website:parsed.Website,targetCategory:parsed['Target Category'],
    priority:parsed.Priority,recommendedTiming:parsed['Recommended Timing'],bestPlatform:parsed['Best Platform'],primaryRoute:parsed['Primary Route'],
    fallbackRoute:parsed['Fallback Route'],whyThisContact:parsed['Why This Contact'],desiredOutcome:parsed['Desired Outcome'],
    telegramUsername:parsed['Telegram Username']||parsed['TG Username'],groupChat:parsed['Group Chat'],notes:parsed.Notes
  };
  Object.entries(fields).forEach(([k,v])=>{if(v!==undefined&&v!==null&&String(v).trim()!=='')raw[k]=v;});
};

const pushActivity=(project,event)=>{
  const row={id:createId('act'),recordedAt:new Date().toISOString(),deletedAt:null,...event};
  state.activities[project].push(row);
  return row;
};

const baseActivityRefs=(raw,contact)=>({companyId:raw?.id||'',company:raw?.company||'',contactId:contact?.id||'',contact:contact?.name||'',contactRole:contact?.role||''});

export const addConnection = (project,{name,company,companyId='',contactId='',accountId,owner='Omar',messageBody='',sentAt='',workdayDate='',allowExistingCompany=false}={}) => {
  let cleanName=String(name||'').trim(),cleanCompany=String(company||'').trim();
  const account=getAccount(accountId);
  const companyRaw=getRawCompany(project,companyId||cleanCompany);
  const archived=archivedCompanyMatch(state.companies[project]||[],companyId||cleanCompany);
  if(archived&&!companyRaw&&!allowExistingCompany) return {ok:false,reason:'archived-company',companyId:archived.id,company:archived.company};
  if(companyId&&!companyRaw) return {ok:false,reason:'invalid-company'};
  if(companyRaw) ensureCompanyContacts(companyRaw);

  let linkedContact=contactId&&companyRaw ? companyRaw.contacts.find(c=>c.id===contactId)||null : null;
  if(contactId&&!linkedContact) return {ok:false,reason:'invalid-contact'};
  if(linkedContact){
    cleanName=linkedContact.name;
    cleanCompany=companyRaw.company;
  } else if(companyRaw&&cleanName){
    const contactCandidates=findCompanyContactsByName(companyRaw,cleanName);
    if(contactCandidates.length===1) linkedContact=contactCandidates[0];
    else if(contactCandidates.length>1) return {ok:false,reason:'ambiguous-contact',contacts:contactCandidates.map(c=>({...c})),companyId:companyRaw.id};
  }
  if(!cleanName||!cleanCompany) return {ok:false,reason:'missing-fields'};

  const duplicate=(state.connections[project]||[]).find(x=>{
    if(x.deletedAt||x.owner!==owner) return false;
    const sameCompany=companyRaw?connectionMatchesCompany(x,companyRaw):sameDisplay(x.company,cleanCompany);
    if(!sameCompany) return false;
    if(linkedContact){
      if(x.contactId!==linkedContact.id) return false;
    } else if(x.contactId || !sameDisplay(x.name,cleanName)) return false;
    const existingAccount=getAccount(x.accountId);
    const sameChannel=account.platform==='LinkedIn'?existingAccount.platform==='LinkedIn':existingAccount.id===account.id;
    return sameChannel&&['Pending','Accepted','Message Sent'].includes(x.status);
  });
  if(duplicate) return {ok:false,reason:'duplicate',connection:duplicate};

  const now=currentInstant().toISOString(),occurredAt=sentAt||now;
  if(!hasOccurred(occurredAt)) return {ok:false,reason:'future-activity'};
  if(account.platform==='X'&&!String(messageBody||'').trim()) return {ok:false,reason:'missing-message'};
  const row={
    id:createId('conn'),name:cleanName,contactRole:linkedContact?.role||'',company:companyRaw?.company||cleanCompany,companyId:companyRaw?.id||'',contactId:linkedContact?.id||'',
    provisionalContact:!linkedContact,owner,accountId:account.id,status:account.platform==='X'?'Message Sent':'Pending',sentAt:occurredAt,acceptedAt:null,
    messageSentAt:account.platform==='X'?occurredAt:null,createdAt:now,local:true,deletedAt:null
  };
  state.connections[project].push(row);

  if(account.platform==='LinkedIn'){
    pushActivity(project,{companyId:row.companyId,company:row.company,contactId:row.contactId,contact:cleanName,contactRole:row.contactRole,owner,actor:owner,accountId:account.id,type:'connection_sent',label:'Connection sent',at:occurredAt,workdayDate:workdayDate||getWorkspaceDateKey(occurredAt),sourceConnectionId:row.id});
  } else {
    let raw=companyRaw,contactRow=linkedContact; const group=createId('group');
    if(!raw){
      raw=createCompanyRow(project,{}, {company:cleanCompany,contact:cleanName,owner,accountId:account.id,at:occurredAt,provisional:true});
      state.companies[project].push(raw); contactRow=ensureCompanyContacts(raw)[0];
      row.companyId=raw.id; row.company=raw.company; row.contactId=contactRow?.id||''; row.contactRole=contactRow?.role||''; row.provisionalContact=false;
      pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner,actor:owner,accountId:account.id,type:'company_added',label:'Company added',at:occurredAt,workdayDate:workdayDate||getWorkspaceDateKey(occurredAt),sourceConnectionId:row.id,source:'x_outreach'});
    } else if(!contactRow){
      contactRow=addContactToCompany(raw,{name:cleanName,accountId:account.id,createdAt:occurredAt,force:true});
      row.companyId=raw.id; row.company=raw.company; row.contactId=contactRow.id; row.contactRole=contactRow.role||''; row.provisionalContact=false;
      pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:account.id,type:'contact_added',label:'Contact added',at:occurredAt,workdayDate:workdayDate||getWorkspaceDateKey(occurredAt),sourceConnectionId:row.id,source:'x_outreach'});
    }
    const messageEvent=pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:account.id,type:'message_sent',label:'First message sent',at:occurredAt,workdayDate:workdayDate||getWorkspaceDateKey(occurredAt),detail:String(messageBody||'').trim(),detailLabel:'Message sent',sourceConnectionId:row.id,source:'x_outreach'});
    row.messageSourceActivityId=messageEvent.id;
    state.companyOverrides[project][raw.id]={status:'Message Sent',nextStep:'Wait for reply'};
  }
  save(); return {ok:true,connection:row};
};

export const addConnectionsBulk=(project,{items=[],accountId,owner='Omar',sentAt='',workdayDate=''}={})=>{
  const results=items.map(item=>addConnection(project,{name:item.name,company:item.company,companyId:item.companyId||'',contactId:item.contactId||'',accountId,owner,sentAt,workdayDate,allowExistingCompany:Boolean(item.allowExistingCompany)}));
  return {
    added:results.filter(x=>x.ok).length,
    duplicates:results.filter(x=>!x.ok&&x.reason==='duplicate').length,
    ambiguous:results.filter(x=>!x.ok&&x.reason==='ambiguous-contact').length,
    archived:results.filter(x=>!x.ok&&x.reason==='archived-company').length,
    future:results.filter(x=>!x.ok&&x.reason==='future-activity').length,
    results
  };
};

export const updateConnectionStatus=(project,connectionId,status)=>{
  const row=(state.connections[project]||[]).find(x=>x.id===connectionId&&!x.deletedAt); if(!row)return null;
  const now=currentInstant().toISOString();
  if(!hasOccurred(row.sentAt,now)) return null;
  const raw=getRawCompany(project,row.companyId||row.company);
  const contact=raw?.contacts?.find(c=>c.id===row.contactId)||raw?.contacts?.find(c=>sameDisplay(c.name,row.name))||null;
  row.status=status;
  if(status==='Accepted'){
    row.acceptedAt=now; row.acceptanceMethod='explicit'; row.acceptanceSourceActivityId='';
    pushActivity(project,{...baseActivityRefs(raw,contact),company:raw?.company||row.company,contact:contact?.name||row.name,owner:row.owner,actor:row.owner,accountId:row.accountId,type:'connection_accepted',label:'Connection accepted',at:now,sourceConfidence:'explicit',sourceConnectionId:row.id});
  }
  if(status==='Message Sent'&&!row.messageSentAt) row.messageSentAt=now;
  save(); return row;
};

export const getCompanies=(project)=>(state.companies[project]||[]).filter(x=>!x.deletedAt).map(row=>materializeCompany(project,row));
export const getCompany=(project,companyRef)=>{const raw=getRawCompany(project,companyRef);return raw?materializeCompany(project,raw):null;};

export const addCompany=(project,parsed,{messageBody='',owner='Omar',accountId='',messageSentAt='',workdayDate='',forceNewContact=false}={})=>{
  const company=String(parsed.Company||'').trim();
  const contact=String(parsed['Contact Name']||parsed.Contact||'').trim();
  const role=String(parsed.Title||'').trim();
  if(!company)return{ok:false,reason:'missing-company'};
  if(!contact)return{ok:false,reason:'missing-contact'};

  const existingRaw=getRawCompany(project,company);
  const archivedRaw=!existingRaw?archivedCompanyMatch(state.companies[project]||[],company):null;
  if(archivedRaw)return{ok:false,reason:'archived-company',companyId:archivedRaw.id,company:archivedRaw.company};
  const existingSameName=existingRaw?findCompanyContactsByName(existingRaw,contact):[];
  const exactExisting=existingSameName.find(c=>sameDisplay(c.role||'',role||''));
  // A same-name person with a different (or intentionally duplicated) role is not the
  // same relationship. Do not let name fallback steal/relink another contact's connection.
  // The only non-exact exception is the single provisional X contact being completed.
  const provisionalContactId=existingRaw?.provisional&&existingSameName.length===1?existingSameName[0].id:'';
  const knownContactId=!forceNewContact?(exactExisting?.id||provisionalContactId):'';
  const match=knownContactId
    ? findConnection(project,contact,existingRaw?.id||company,owner,{contactId:knownContactId})
    : (existingRaw&&existingSameName.length ? null : findConnection(project,contact,existingRaw?.id||company,owner));
  const selectedAccountId=match?.accountId||accountId||getSelectedAccount(project);
  const account=getAccount(selectedAccountId);
  const now=currentInstant().toISOString(),actualMessageAt=messageSentAt||now,message=String(messageBody||'').trim();
  const xExistingMessage=match&&getAccount(match.accountId).platform==='X'&&match.status==='Message Sent';
  const completingProvisionalX=!!(existingRaw?.provisional&&existingSameName.length===1&&xExistingMessage);

  if(!completingProvisionalX&&!hasOccurred(actualMessageAt))return{ok:false,reason:'future-activity'};
  if(!completingProvisionalX&&match&&account.platform==='LinkedIn'&&new Date(actualMessageAt)<new Date(match.sentAt)){
    return{ok:false,reason:'invalid-chronology',connection:match};
  }

  if(exactExisting&&!completingProvisionalX&&!forceNewContact){
    return {ok:false,reason:'duplicate',company:materializeCompany(project,existingRaw),connection:match||null,duplicateContactId:exactExisting.id,canForce:true};
  }
  if(!completingProvisionalX&&!message)return{ok:false,reason:'missing-message'};

  const group=createId('group');
  if(completingProvisionalX){
    const existingContact=existingSameName[0];
    applyParsedCompanyDetails(existingRaw,parsed); existingRaw.provisional=false;
    existingContact.role=role||existingContact.role||''; existingContact.accountId=match.accountId; existingRaw.updatedAt=now;
    match.companyId=existingRaw.id; match.company=existingRaw.company; match.contactId=existingContact.id; match.name=existingContact.name; match.contactRole=existingContact.role||''; match.provisionalContact=false;
    for(const prior of (state.activities[project]||[]).filter(a=>!a.deletedAt&&a.sourceConnectionId===match.id)){
      prior.companyId=existingRaw.id; prior.company=existingRaw.company; prior.contactId=existingContact.id; prior.contact=existingContact.name;
    }
    save();
    return {ok:true,company:materializeCompany(project,existingRaw),matchedConnection:match,existingCompany:true,completedXDetails:true,reusedInitialMessage:true};
  }

  let raw=existingRaw,contactRow,newCompany=false;
  if(!raw){
    raw=createCompanyRow(project,parsed,{company,contact,owner,accountId:selectedAccountId,at:actualMessageAt,provisional:false});
    state.companies[project].push(raw); contactRow=ensureCompanyContacts(raw)[0]; newCompany=true;
  } else {
    applyParsedCompanyDetails(raw,parsed);
    contactRow=addContactToCompany(raw,{name:contact,role,accountId:selectedAccountId,createdAt:actualMessageAt,force:true});
  }
  if(match){
    match.companyId=raw.id;match.company=raw.company;match.contactId=contactRow.id;match.name=contactRow.name;match.contactRole=contactRow.role||'';match.provisionalContact=false;
    // A connection can exist before the company/contact record does. Once the records
    // exist, backfill that connection's historical activities with stable foreign keys.
    for(const prior of (state.activities[project]||[]).filter(a=>!a.deletedAt&&a.sourceConnectionId===match.id)){
      prior.companyId=raw.id; prior.company=raw.company; prior.contactId=contactRow.id; prior.contact=contactRow.name;
    }
  }

  if(newCompany) pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:selectedAccountId,type:'company_added',label:'Company added',at:actualMessageAt,workdayDate:workdayDate||getWorkspaceDateKey(actualMessageAt)});
  else pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:selectedAccountId,type:'contact_added',label:'Contact added',at:actualMessageAt,workdayDate:workdayDate||getWorkspaceDateKey(actualMessageAt)});

  const messageEvent=pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:selectedAccountId,type:'message_sent',label:'First message sent',at:actualMessageAt,workdayDate:workdayDate||getWorkspaceDateKey(actualMessageAt),detail:message,detailLabel:'Message sent',sourceConnectionId:match?.id||''});

  if(match&&account.platform==='LinkedIn'&&match.status==='Pending'){
    match.acceptedAt=actualMessageAt; match.acceptanceMethod='inferred_from_message_sent'; match.acceptanceSourceActivityId=messageEvent.id;
    pushActivity(project,{actionGroupId:group,...baseActivityRefs(raw,contactRow),owner:raw.owner||owner,actor:owner,accountId:match.accountId,type:'connection_accepted',label:'Connection accepted',at:actualMessageAt,note:'Acceptance inferred from the matching LinkedIn message being sent.',sourceConfidence:'inferred',sourceConnectionId:match.id,inferredFromActivityId:messageEvent.id});
  }
  state.companyOverrides[project][raw.id]={status:'Message Sent',nextStep:'Wait for reply'};
  if(match){match.status='Message Sent';match.messageSentAt=actualMessageAt;match.messageSourceActivityId=messageEvent.id;}
  save();
  return {ok:true,company:materializeCompany(project,raw),matchedConnection:match||null,existingCompany:!newCompany,addedContact:!newCompany?contactRow.name:''};
};

const actionMap={
  note_added:{label:'Note added',status:null},connection_sent:{label:'Connection sent',status:'Connection Pending'},connection_accepted:{label:'Connection accepted',status:'Accepted'},
  message_sent:{label:'Message sent',status:'Message Sent'},followup_sent:{label:'Follow-up sent',status:'Follow-Up Sent'},followup_scheduled:{label:'Follow-up scheduled',status:'Follow-Up Needed'},
  replied:{label:'Contact replied',status:'Replied'},meeting_booked:{label:'Meeting booked',status:'Meeting Booked'},meeting_scheduled:{label:'Meeting scheduled',status:'Meeting Scheduled'},
  meeting_rescheduled:{label:'Meeting rescheduled',status:'Meeting Scheduled'},meeting_done:{label:'Meeting done · handed to operations',status:'Meeting Done'}
};

const deriveNextStep=(event,fallback='Review relationship')=>{
  if(!event)return fallback;
  if(event.type==='meeting_done')return'Operations handoff';
  if(event.type==='replied')return'Review reply';
  if(event.type==='followup_scheduled')return event.scheduledFor?`Follow up ${formatDateTime(event.scheduledFor)}`:'Follow-up scheduled';
  if(['message_sent','followup_sent'].includes(event.type))return'Wait for reply';
  return actionMap[event.type]?.label||fallback;
};

const validAcceptanceEvidence=(event,remaining)=>{
  if(event.type!=='connection_accepted')return false;
  if(event.sourceConfidence!=='inferred')return true;
  if(event.inferredFromActivityId)return remaining.some(x=>x.id===event.inferredFromActivityId&&x.type==='message_sent');
  if(event.actionGroupId)return remaining.some(x=>x.actionGroupId===event.actionGroupId&&x.type==='message_sent');
  return false;
};

function projectConnectionForRead(project,conn,nowValue=currentInstant()){
  if(!conn||conn.deletedAt||!hasOccurred(conn.sentAt,nowValue))return null;
  const remaining=activeActivitiesFor(project,'',{occurredOnly:true,nowValue});
  const sameRelationship=(event)=>{
    if(event.accountId!==conn.accountId)return false;
    const sameCompany=conn.companyId?event.companyId===conn.companyId:sameDisplay(event.company,conn.company);
    const sameContact=conn.contactId?event.contactId===conn.contactId:sameDisplay(event.contact,conn.name);
    return sameCompany&&sameContact;
  };
  const sentAt=new Date(conn.sentAt).getTime();
  const messages=remaining.filter(event=>event.type==='message_sent'&&sameRelationship(event)&&(
    event.sourceConnectionId===conn.id || (!event.sourceConnectionId&&new Date(event.at).getTime()>=sentAt)
  )).filter(event=>new Date(event.at).getTime()>=sentAt).sort(compareActivitiesDesc);
  const acceptances=remaining.filter(event=>event.type==='connection_accepted'&&sameRelationship(event)&&(!event.sourceConnectionId||event.sourceConnectionId===conn.id))
    .filter(event=>new Date(event.at).getTime()>=sentAt)
    .filter(event=>{
      if(event.sourceConfidence!=='inferred')return true;
      const source=remaining.find(x=>x.id===event.inferredFromActivityId&&x.type==='message_sent');
      return !!source&&sameRelationship(source)&&new Date(source.at).getTime()>=sentAt;
    }).sort(compareActivitiesDesc);
  const lastMessage=messages[0]||null;
  const lastAccepted=acceptances[0]||null;
  const row={...conn};
  if(getAccount(conn.accountId).platform==='LinkedIn'){
    if(lastMessage){
      row.status='Message Sent';row.messageSentAt=lastMessage.at;row.messageSourceActivityId=lastMessage.id;
      if(lastAccepted){row.acceptedAt=lastAccepted.at;row.acceptanceMethod=lastAccepted.sourceConfidence==='inferred'?'inferred_from_message_sent':'explicit';row.acceptanceSourceActivityId=lastAccepted.inferredFromActivityId||'';}
      else {row.acceptedAt=null;row.acceptanceMethod='';row.acceptanceSourceActivityId='';}
    } else if(lastAccepted){
      row.status='Accepted';row.acceptedAt=lastAccepted.at;row.messageSentAt=null;row.messageSourceActivityId='';
      row.acceptanceMethod=lastAccepted.sourceConfidence==='inferred'?'inferred_from_message_sent':'explicit';row.acceptanceSourceActivityId=lastAccepted.inferredFromActivityId||'';
    } else {
      row.status='Pending';row.acceptedAt=null;row.messageSentAt=null;row.messageSourceActivityId='';row.acceptanceMethod='';row.acceptanceSourceActivityId='';
    }
  } else {
    row.status='Message Sent';row.messageSentAt=conn.messageSentAt||conn.sentAt;
  }
  return row;
}

const rebuildCompanyProjection=(project,companyRef)=>{
  const raw=getRawCompany(project,companyRef); if(!raw)return;
  const remaining=activeActivitiesFor(project,raw.id,{occurredOnly:true});

  const structural=remaining.filter(x=>['company_added','contact_added'].includes(x.type)).sort(compareActivitiesAsc);
  if(structural.length){
    const existingById=new Map((raw.contacts||[]).map(c=>[c.id,c])); const contacts=[];
    for(const event of structural){
      if(!event.contact)continue;
      let cid=event.contactId;
      if(!cid){
        const matching=[...existingById.values()].filter(c=>sameDisplay(c.name,event.contact));
        cid=matching.length===1?matching[0].id:createId('contact'); event.contactId=cid;
      }
      if(contacts.some(c=>c.id===cid))continue;
      const prior=existingById.get(cid);
      contacts.push(contactObject({id:cid,name:event.contact,role:event.contactRole||prior?.role||'',accountId:event.accountId||prior?.accountId||'',createdAt:event.at}));
    }
    raw.contacts=contacts;
    raw.primaryContactId=contacts.some(c=>c.id===raw.primaryContactId)?raw.primaryContactId:(contacts[0]?.id||'');
  }

  const latest=remaining.find(x=>actionMap[x.type]?.status);
  if(latest)state.companyOverrides[project][raw.id]={...(state.companyOverrides[project][raw.id]||{}),status:actionMap[latest.type].status,nextStep:deriveNextStep(latest)};
  else delete state.companyOverrides[project][raw.id];

  for(const conn of (state.connections[project]||[]).filter(c=>!c.deletedAt&&!c.historicalOnly&&connectionMatchesCompany(c,raw))){
    const contactEvents=remaining.filter(e=>conn.contactId?e.contactId===conn.contactId:sameDisplay(e.contact,conn.name));
    const lastMessage=contactEvents.find(x=>x.type==='message_sent'&&x.accountId===conn.accountId&&new Date(x.at)>=new Date(conn.sentAt)&&(
      x.sourceConnectionId===conn.id || !x.sourceConnectionId
    ));
    const lastAccepted=contactEvents.find(x=>new Date(x.at)>=new Date(conn.sentAt)&&validAcceptanceEvidence(x,remaining)&&(!x.sourceConnectionId||x.sourceConnectionId===conn.id));
    const acc=getAccount(conn.accountId);
    if(lastMessage){
      conn.status='Message Sent';conn.messageSentAt=lastMessage.at;conn.messageSourceActivityId=lastMessage.id;
      if(lastAccepted){
        conn.acceptedAt=lastAccepted.at;conn.acceptanceMethod=lastAccepted.sourceConfidence==='inferred'?'inferred_from_message_sent':'explicit';conn.acceptanceSourceActivityId=lastAccepted.inferredFromActivityId||'';
      } else {
        conn.acceptedAt=null;conn.acceptanceMethod='';conn.acceptanceSourceActivityId='';
      }
    } else if(lastAccepted){
      conn.status='Accepted';conn.acceptedAt=lastAccepted.at;conn.messageSentAt=null;conn.messageSourceActivityId='';
      conn.acceptanceMethod=lastAccepted.sourceConfidence==='inferred'?'inferred_from_message_sent':'explicit';conn.acceptanceSourceActivityId=lastAccepted.inferredFromActivityId||'';
    } else if(acc.platform==='LinkedIn'){
      conn.status='Pending';conn.acceptedAt=null;conn.messageSentAt=null;conn.acceptanceMethod='';conn.acceptanceSourceActivityId='';conn.messageSourceActivityId='';
    } else conn.status='Message Sent';
  }
};

const syncActivityIdentityFromIds=(project,activity)=>{
  const raw=getRawCompany(project,activity.companyId||activity.company);
  if(!raw)return{raw:null,contact:null};
  ensureCompanyContacts(raw);
  activity.companyId=raw.id;activity.company=raw.company;
  const contact=activity.contactId?raw.contacts.find(c=>c.id===activity.contactId)||null:null;
  if(contact){activity.contact=contact.name;activity.contactRole=contact.role||'';}
  return{raw,contact};
};

const inferredAcceptancesForSource=(project,activityId)=> (state.activities[project]||[]).filter(x=>!x.deletedAt&&x.type==='connection_accepted'&&x.sourceConfidence==='inferred'&&x.inferredFromActivityId===activityId);

const exactConnectionForMessage=(project,raw,contact,activity)=>{
  if(!raw||!contact||!activity?.accountId)return null;
  return (state.connections[project]||[]).find(conn=>!conn.deletedAt&&conn.companyId===raw.id&&conn.contactId===contact.id&&conn.accountId===activity.accountId)||null;
};

// Keep inferred LinkedIn acceptance as a reversible projection of its exact source message.
// Editing the message timestamp/contact/company/account retargets or removes that inference.
const reconcileInferredAcceptanceSource=(project,activity,actor='')=>{
  const existing=inferredAcceptancesForSource(project,activity.id);
  const {raw,contact}=syncActivityIdentityFromIds(project,activity);
  const target=activity.type==='message_sent'?exactConnectionForMessage(project,raw,contact,activity):null;
  const chronologicalTarget=target&&hasOccurred(activity.at)&&new Date(activity.at)>=new Date(target.sentAt)?target:null;
  if(activity.type==='message_sent') activity.sourceConnectionId=chronologicalTarget?.id||'';
  else activity.sourceConnectionId='';

  const linkedInTarget=chronologicalTarget&&getAccount(chronologicalTarget.accountId).platform==='LinkedIn'?chronologicalTarget:null;
  const active=activeActivitiesFor(project,'',{occurredOnly:true});
  const hasIndependentAcceptance=linkedInTarget ? active.some(x=>x.type==='connection_accepted'&&x.sourceConnectionId===linkedInTarget.id&&(
    x.sourceConfidence!=='inferred' || (x.inferredFromActivityId&&x.inferredFromActivityId!==activity.id)
  )) : false;
  const shouldInfer=!!(linkedInTarget&&raw&&contact&&!hasIndependentAcceptance);

  if(shouldInfer){
    const derived=existing[0]||pushActivity(project,{});
    Object.assign(derived,{
      deletedAt:null,deletedBy:null,deletedReason:null,
      actionGroupId:activity.actionGroupId||derived.actionGroupId||createId('group'),
      ...baseActivityRefs(raw,contact),
      owner:activity.owner||raw.owner||'Omar',actor:actor||activity.actor||activity.owner||raw.owner||'Omar',accountId:linkedInTarget.accountId,
      type:'connection_accepted',label:'Connection accepted',at:activity.at,
      note:'Acceptance inferred from the matching LinkedIn message being sent.',sourceConfidence:'inferred',sourceConnectionId:linkedInTarget.id,inferredFromActivityId:activity.id
    });
    const now=new Date().toISOString();
    existing.slice(1).forEach(extra=>{extra.deletedAt=now;extra.deletedBy=actor||'System';extra.deletedReason='duplicate_inference_recomputed';});
  } else if(existing.length){
    const now=new Date().toISOString();
    existing.forEach(derived=>{derived.deletedAt=now;derived.deletedBy=actor||'System';derived.deletedReason='inference_source_recomputed';});
  }
  return {raw,contact,target};
};

const propagateOperationalRecordIdentity=(project,activity,before,actor='')=>{
  const identityChanged=activity.companyId!==before.companyId||activity.contactId!==before.contactId||activity.company!==before.company||activity.contact!==before.contact;
  if(!identityChanged)return 0;
  const identity={companyId:activity.companyId||'',company:activity.company||'',contactId:activity.contactId||'',contact:activity.contact||'',contactRole:activity.contactRole||''};
  let count=0;
  for(const [idField,recordId] of [['meetingId',activity.meetingId],['followupId',activity.followupId]]){
    if(!recordId)continue;
    for(const linked of (state.activities[project]||[]).filter(x=>!x.deletedAt&&x[idField]===recordId)){
      Object.assign(linked,identity);
      if(linked.id!==activity.id){linked.updatedAt=currentInstant().toISOString();linked.updatedBy=actor||'Unknown';linked.identityPropagatedFromActivityId=activity.id;}
      count+=1;
    }
  }
  return count;
};

const openMeetingRecordsFor=(project,raw,contact)=>getMeetingRecords(project).filter(r=>r.companyId===raw.id&&r.contactId===contact.id&&!r.done);
const openFollowupRecordsFor=(project,raw,contact)=>getFollowupRecords(project).filter(r=>r.companyId===raw.id&&r.contactId===contact.id&&!r.sent);

const exactOperationalTarget=(records,requestedId)=>requestedId ? records.find(r=>r.id===requestedId)||null : null;

export const recordCompanyAction=(project,companyRef,type,{at,workdayDate='',scheduledFor,note='',detail='',detailLabel='',secondaryDetail='',secondaryLabel='',actor='',contactId='',accountId='',meetingId:requestedMeetingId='',followupId:requestedFollowupId=''}={})=>{
  const raw=getRawCompany(project,companyRef); if(!raw||!actionMap[type])return null;
  ensureCompanyContacts(raw); const selectedContact=raw.contacts.find(c=>c.id===contactId)||raw.contacts[0]||null; if(!selectedContact)return null;
  const eventAt=at||currentInstant().toISOString(); const selectedAccountId=accountId||selectedContact.accountId||getSelectedAccount(project);
  if(!hasOccurred(eventAt))return null;
  const action=actionMap[type]; const actionGroupId=createId('group');

  const match=findConnection(project,selectedContact.name,raw.id,raw.owner,{contactId:selectedContact.id,accountId:selectedAccountId});
  if(match&&type==='message_sent'&&getAccount(match.accountId).platform==='LinkedIn'&&new Date(eventAt)<new Date(match.sentAt))return null;
  const matchWasPending=!!(match&&getAccount(match.accountId).platform==='LinkedIn'&&(projectConnectionForRead(project,match,currentInstant())||match).status==='Pending');

  const openMeetings=openMeetingRecordsFor(project,raw,selectedContact);
  const openFollowups=openFollowupRecordsFor(project,raw,selectedContact);
  let targetMeeting=exactOperationalTarget(openMeetings,requestedMeetingId);
  let targetFollowup=exactOperationalTarget(openFollowups,requestedFollowupId);
  if(requestedMeetingId&&!targetMeeting) return null;
  if(requestedFollowupId&&!targetFollowup) return null;

  const meetingMutation=['meeting_scheduled','meeting_rescheduled','meeting_done'].includes(type);
  const followupMutation=type==='followup_sent';
  // Backward-compatible only when there is exactly one possible target. Never guess when
  // multiple open records exist; the UI must pass the exact record ID in that case.
  if(meetingMutation&&!targetMeeting&&openMeetings.length===1) targetMeeting=openMeetings[0];
  if(followupMutation&&!targetFollowup&&openFollowups.length===1) targetFollowup=openFollowups[0];
  if(meetingMutation&&!requestedMeetingId&&openMeetings.length>1) return null;
  if(followupMutation&&!requestedFollowupId&&openFollowups.length>1) return null;

  let meetingId='',followupId='';
  if(type==='meeting_booked') meetingId=createId('meeting');
  else if(meetingMutation) meetingId=targetMeeting?.id||createId('meeting');
  if(type==='followup_scheduled') followupId=createId('followup');
  else if(followupMutation) followupId=targetFollowup?.id||createId('followup');

  const event=pushActivity(project,{actionGroupId,...baseActivityRefs(raw,selectedContact),owner:raw.owner||'Omar',actor:actor||raw.owner||'Omar',accountId:selectedAccountId,type,label:action.label,at:eventAt,workdayDate:workdayDate||getWorkspaceDateKey(eventAt),
    scheduledFor:scheduledFor||null,previousScheduledFor:type==='meeting_rescheduled'?(targetMeeting?.scheduledFor||null):null,note,detail:String(detail||'').trim(),detailLabel,
    secondaryDetail:String(secondaryDetail||'').trim(),secondaryLabel,meetingId,followupId});

  if(action.status)state.companyOverrides[project][raw.id]={...(state.companyOverrides[project][raw.id]||{}),status:action.status,nextStep:deriveNextStep(event)};

  if(match&&type==='message_sent'){
    event.sourceConnectionId=match.id;
    if(matchWasPending){
      match.acceptedAt=eventAt;match.acceptanceMethod='inferred_from_message_sent';match.acceptanceSourceActivityId=event.id;
      pushActivity(project,{actionGroupId,...baseActivityRefs(raw,selectedContact),owner:raw.owner||'Omar',actor:actor||raw.owner||'Omar',accountId:match.accountId,type:'connection_accepted',label:'Connection accepted',at:eventAt,workdayDate:workdayDate||getWorkspaceDateKey(eventAt),
        note:'Acceptance inferred from the matching LinkedIn message being sent.',sourceConfidence:'inferred',sourceConnectionId:match.id,inferredFromActivityId:event.id});
    }
    match.status='Message Sent';match.messageSentAt=eventAt;match.messageSourceActivityId=event.id;
  }
  save(); return event;
};

export const getActivityDetail=(activity)=>activity?(activity.detail||activity.secondaryDetail||activity.note||''):'';

export const deleteActivity=(project,activityId,actor='',{allowStructural=false}={})=>{
  const activity=(state.activities[project]||[]).find(x=>x.id===activityId);
  if(!activity||activity.deletedAt||(!allowStructural&&activity.type==='company_added'))return false;
  const before={...activity}; const deletedAt=new Date().toISOString();
  activity.deletedAt=deletedAt; activity.deletedBy=actor||'Unknown';
  state.auditTrail[project].push({id:createId('audit'),companyId:activity.companyId||'',company:activity.company,activityId,operation:'delete',actor:activity.deletedBy,at:deletedAt,before,after:{...activity}});

  // Derived acceptance is evidence-backed. Removing its source removes only the derived event,
  // never an independent explicit acceptance event.
  if(activity.type==='message_sent'){
    for(const derived of (state.activities[project]||[]).filter(x=>!x.deletedAt&&x.type==='connection_accepted'&&x.sourceConfidence==='inferred'&&(x.inferredFromActivityId===activity.id||(!x.inferredFromActivityId&&x.actionGroupId&&x.actionGroupId===activity.actionGroupId)))){
      derived.deletedAt=deletedAt; derived.deletedBy=activity.deletedBy; derived.deletedReason='inference_source_removed';
    }
  }
  if(activity.type==='message_sent'&&activity.sourceConnectionId&&getAccount(activity.accountId).platform==='X'){
    const sourceConnection=(state.connections[project]||[]).find(c=>c.id===activity.sourceConnectionId&&!c.deletedAt);
    if(sourceConnection){sourceConnection.deletedAt=deletedAt;sourceConnection.deletedBy=activity.deletedBy;}
  }
  rebuildCompanyProjection(project,activity.companyId||activity.company); save(); return true;
};

export const updateActivity=(project,activityId,updates={},actor='')=>{
  const activity=(state.activities[project]||[]).find(x=>x.id===activityId&&!x.deletedAt); if(!activity)return null;
  const before={...activity}; const oldCompanyRef=before.companyId||before.company;
  const candidate={...activity,...updates};
  if(!hasOccurred(candidate.at))return null;
  if(updates.contactId!==undefined){
    const targetRaw=getRawCompany(project,candidate.companyId||candidate.company);
    if(!targetRaw)return null;
    ensureCompanyContacts(targetRaw);
    if(candidate.contactId&&!targetRaw.contacts.some(c=>c.id===candidate.contactId))return null;
  }
  syncActivityIdentityFromIds(project,candidate);
  if(candidate.type==='message_sent'){
    const {raw,contact}=syncActivityIdentityFromIds(project,candidate);
    const target=exactConnectionForMessage(project,raw,contact,candidate);
    if(target&&getAccount(target.accountId).platform==='LinkedIn'&&new Date(candidate.at)<new Date(target.sentAt))return null;
  }
  Object.assign(activity,updates,{updatedAt:new Date().toISOString(),updatedBy:actor||'Unknown'});
  syncActivityIdentityFromIds(project,activity);
  const propagatedCount=propagateOperationalRecordIdentity(project,activity,before,actor||'Unknown');
  if(before.type==='message_sent'||activity.type==='message_sent') reconcileInferredAcceptanceSource(project,activity,actor||'Unknown');
  state.auditTrail[project].push({id:createId('audit'),companyId:activity.companyId||'',company:activity.company,activityId,operation:'update',actor:actor||'Unknown',at:activity.updatedAt,before,after:{...activity},propagatedOperationalEvents:propagatedCount});
  const affected=new Set([oldCompanyRef,activity.companyId||activity.company].filter(Boolean));
  affected.forEach(ref=>rebuildCompanyProjection(project,ref));
  save(); return activity;
};

export const undoLastAction=(project,companyRef,actor='')=>{
  const raw=getRawCompany(project,companyRef); if(!raw)return null;
  const latest=[...(state.activities[project]||[])].filter(x=>!x.deletedAt&&activityMatchesCompany(x,raw)&&x.type!=='connection_sent'&&(actor?x.actor===actor:true)).reverse()[0];
  if(!latest)return null;
  const grouped=latest.actionGroupId?(state.activities[project]||[]).filter(x=>!x.deletedAt&&x.actionGroupId===latest.actionGroupId&&(actor?x.actor===actor:true)):[latest];
  grouped.forEach(item=>deleteActivity(project,item.id,actor||item.actor||'Unknown',{allowStructural:true}));
  const hasCompanyAdded=activeActivitiesFor(project,raw.id).some(x=>x.type==='company_added');
  if(!raw.deletedAt&&!hasCompanyAdded&&!raw.provisional){raw.deletedAt=new Date().toISOString();raw.deletedReason='undo_company_creation';delete state.companyOverrides[project][raw.id];}
  rebuildCompanyProjection(project,raw.id);save();return{...latest,undoneCount:grouped.length};
};

export const deleteLocalCompany=(project,companyRef,actor='Omar')=>{
  const raw=getRawCompany(project,companyRef);if(!raw)return false;
  const now=new Date().toISOString();const before=JSON.parse(JSON.stringify(materializeCompany(project,raw)));
  raw.deletedAt=now;raw.deletedBy=actor;raw.deletedReason='relationship_archived';
  for(const conn of(state.connections[project]||[]).filter(c=>!c.deletedAt&&connectionMatchesCompany(c,raw))){conn.deletedAt=now;conn.deletedBy=actor;}
  for(const activity of(state.activities[project]||[]).filter(a=>!a.deletedAt&&activityMatchesCompany(a,raw))){activity.deletedAt=now;activity.deletedBy=actor;activity.deletedReason='relationship_archived';}
  delete state.companyOverrides[project][raw.id];
  state.auditTrail[project].push({id:createId('audit'),companyId:raw.id,company:raw.company,operation:'archive_relationship',actor,at:now,before,after:{deletedAt:now}});save();return true;
};

export const getChangeHistory=(project,companyRef='')=>{
  let rows=[...(state.auditTrail?.[project]||[])];
  if(companyRef){const raw=getRawCompany(project,companyRef);rows=raw?rows.filter(x=>x.companyId?x.companyId===raw.id:sameDisplay(x.company,raw.company)):rows.filter(x=>sameDisplay(x.company,companyRef));}
  return rows.sort((a,b)=>new Date(b.at||0)-new Date(a.at||0));
};

export const getDailyReports=(project,{owner='ALL'}={}) => (state.dailyReports?.[project]||[])
  .filter(row=>owner==='ALL'||row.owner===owner)
  .map(row=>({...row}));

const reportedMetricByDay=(project,owner='ALL')=>{
  const map=new Map();
  for(const row of (state.dailyReports?.[project]||[])){
    if(owner!=='ALL'&&row.owner!==owner) continue;
    map.set(row.date,row);
  }
  return map;
};

const hybridMetricCount=(project,{owner='ALL',range='7D',day='',now=currentInstant()}={},eventType,reportField)=>{
  const nowValue=now||currentInstant();
  const eventRows=activeActivitiesFor(project,'',{occurredOnly:true,nowValue})
    .filter(x=>owner==='ALL'||x.owner===owner)
    .filter(x=>{const key=x.workdayDate||getWorkspaceDateKey(x.at);return withinRange(`${key}T12:00:00Z`,range,day,nowValue);})
    .filter(x=>x.type===eventType);
  const eventCounts=new Map();
  eventRows.forEach(x=>{
    const key=x.workdayDate||getWorkspaceDateKey(x.at);
    eventCounts.set(key,(eventCounts.get(key)||0)+1);
  });
  const reports=reportedMetricByDay(project,owner);
  const dateKeys=new Set([...eventCounts.keys()]);
  for(const [dateKey] of reports){
    const rangeProbe=`${dateKey}T12:00:00Z`;
    if(withinRange(rangeProbe,range,day,nowValue)) dateKeys.add(dateKey);
  }
  let total=0;
  for(const dateKey of dateKeys){
    const reported=reports.get(dateKey);
    total += reported ? Number(reported[reportField]||0) : Number(eventCounts.get(dateKey)||0);
  }
  return total;
};

export const getActivities=(project,companyRef='',{now=currentInstant()}={})=>activeActivitiesFor(project,companyRef,{occurredOnly:true,nowValue:now});
export const getFilteredActivities=(project,{owner='ALL',range='7D',day='',now}={})=>{
  const nowValue=now||currentInstant();
  return activeActivitiesFor(project,'',{occurredOnly:true,nowValue}).filter(x=>owner==='ALL'||x.owner===owner).filter(x=>{const key=x.workdayDate||getWorkspaceDateKey(x.at);const probe=`${key}T12:00:00Z`;return withinRange(probe,range,day,nowValue);});
};

export const getDashboardMetrics=(project,filters={})=>{
  const owner=filters.owner||'ALL';const now=filters.now||currentInstant();const connections=getConnections(project,now).filter(x=>owner==='ALL'||x.owner===owner);const activities=getFilteredActivities(project,{...filters,now});
  return {
    pending:connections.filter(x=>x.status==='Pending').length,
    accepted:hybridMetricCount(project,{...filters,owner,now},'connection_accepted','connectionsAccepted'),
    messages:hybridMetricCount(project,{...filters,owner,now},'message_sent','messagesSent'),
    replies:activities.filter(x=>x.type==='replied').length,
    meetings:hybridMetricCount(project,{...filters,owner,now},'meeting_booked','meetingsBooked')
  };
};

export const getWeeklyActivity=(project,owner='ALL',nowValue=currentInstant())=>{
  const now=new Date(nowValue);const today=getWorkspaceDateKey(now);const keys=Array.from({length:7},(_,i)=>addWorkspaceDays(today,-(6-i)));
  const rows=activeActivitiesFor(project,'',{occurredOnly:true,nowValue:now}).filter(x=>owner==='ALL'||x.owner===owner).filter(x=>['connection_sent','message_sent'].includes(x.type));
  const counts=keys.map(key=>rows.filter(x=>(x.workdayDate||getWorkspaceDateKey(x.at))===key).length);const max=Math.max(1,...counts);
  const labels=keys.map(key=>{const [y,m,d]=key.split('-').map(Number);return new Intl.DateTimeFormat('en',{timeZone:'UTC',weekday:'short'}).format(new Date(Date.UTC(y,m-1,d,12))).slice(0,1);});
  return{counts,bars:counts.map(x=>Math.max(8,Math.round(x/max*100))),labels,dates:keys};
};

export const getOutreachRows=(project)=>getCompanies(project).flatMap(company=>{
  const contacts=ensureCompanyContacts(getRawCompany(project,company.id) || company);
  if(!contacts.length){
    const latest=activeActivitiesFor(project,company.id,{occurredOnly:true})[0];
    return [{...company,lastActivity:latest?.label||'No recorded activity',lastActivityAt:latest?.at||company.addedAt,lastActivityDetail:getActivityDetail(latest),nextStep:company.nextStep||'Review relationship'}];
  }
  return contacts.map(contact=>{
    const acts=activeActivitiesFor(project,company.id,{occurredOnly:true}).filter(a=>activityMatchesContact(a,contact));
    const latest=acts[0];
    const statusEvent=acts.find(a=>!a.reportOnly&&actionMap[a.type]?.status);
    return {...company,contactId:contact.id,contact:contact.name,role:contact.role||'—',accountId:latest?.accountId||contact.accountId||company.accountId,
      status:statusEvent?actionMap[statusEvent.type].status:(company.status||'Company Added'),
      lastActivity:latest?.label||'No recorded activity',lastActivityAt:latest?.at||contact.createdAt||company.addedAt,lastActivityDetail:getActivityDetail(latest),
      nextStep:statusEvent?deriveNextStep(statusEvent):(company.nextStep||'Review relationship')};
  });
}).sort((a,b)=>new Date(b.lastActivityAt||0)-new Date(a.lastActivityAt||0));

const groupOperationalRecords=(project,types,idField,prefix,nowValue=currentInstant())=>{
  const relevant=activeActivitiesFor(project,'',{occurredOnly:true,nowValue}).filter(a=>types.includes(a.type));const groups=new Map();
  for(const event of relevant){
    if(!event[idField])event[idField]=createId(prefix);
    if(!groups.has(event[idField]))groups.set(event[idField],[]);
    groups.get(event[idField]).push(event);
  }
  return [...groups.entries()].map(([recordId,events])=>({recordId,events:events.sort(compareActivitiesDesc)}));
};

export const getMeetingRecords=(project,{owner='ALL',now=currentInstant()}={})=>groupOperationalRecords(project,['meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done'],'meetingId','meeting',now)
  .map(({recordId,events})=>{
    const booked=events.find(x=>x.type==='meeting_booked')||null;
    const scheduleEvent=events.find(x=>['meeting_rescheduled','meeting_scheduled','meeting_booked'].includes(x.type)&&x.scheduledFor)||null;
    const done=events.find(x=>x.type==='meeting_done')||null;
    const anchor=booked||scheduleEvent||done||events[0];
    return{id:recordId,companyId:anchor.companyId||'',company:anchor.company,contactId:anchor.contactId||'',contact:anchor.contact||'—',owner:anchor.owner,accountId:anchor.accountId,
      booked,scheduleEvent,done,scheduledFor:scheduleEvent?.scheduledFor||null,status:done?'Meeting Done':scheduleEvent?'Scheduled':'Booked',lastAt:events[0]?.at||'',events};
  }).filter(r=>owner==='ALL'||r.owner===owner)
  .sort((a,b)=>new Date(b.scheduledFor||b.lastAt||0)-new Date(a.scheduledFor||a.lastAt||0));

export const getFollowupRecords=(project,{owner='ALL',now=currentInstant()}={})=>groupOperationalRecords(project,['followup_scheduled','followup_sent'],'followupId','followup',now)
  .map(({recordId,events})=>{
    const scheduled=events.find(x=>x.type==='followup_scheduled'&&x.scheduledFor)||null;
    const sent=events.find(x=>x.type==='followup_sent')||null;
    const anchor=scheduled||sent||events[0];
    return{id:recordId,companyId:anchor.companyId||'',company:anchor.company,contactId:anchor.contactId||'',contact:anchor.contact||'—',owner:anchor.owner,accountId:anchor.accountId,
      scheduled,sent,scheduledFor:scheduled?.scheduledFor||null,status:sent?'Sent':scheduled?'Scheduled':'Recorded',lastAt:events[0]?.at||'',events};
  }).filter(r=>owner==='ALL'||r.owner===owner)
  .sort((a,b)=>new Date(a.scheduledFor||a.lastAt||0)-new Date(b.scheduledFor||b.lastAt||0));

const isReplyResolved=(reply,contactEvents)=>{
  const resolverTypes=new Set(['message_sent','followup_sent','meeting_booked','meeting_scheduled','meeting_rescheduled','meeting_done']);
  const replyAt=new Date(reply.at).getTime();
  const replyRecorded=new Date(reply.recordedAt||reply.at).getTime();
  return contactEvents.some(event=>{
    if(event.reportOnly||!resolverTypes.has(event.type)||event.id===reply.id)return false;
    const eventAt=new Date(event.at).getTime();
    if(eventAt>replyAt)return true;
    if(eventAt<replyAt)return false;
    return new Date(event.recordedAt||event.at).getTime()>replyRecorded;
  });
};

export const getNeedsAttention=(project,owner='ALL',nowValue=currentInstant())=>{
  const now=new Date(nowValue);const out=[];
  getConnections(project,now).filter(x=>owner==='ALL'||x.owner===owner).forEach(c=>{
    if(c.status==='Pending'){
      const age=workspaceDayDifference(now,c.sentAt);
      if(age>=ATTENTION_PENDING_DAYS)out.push({id:`pending:${c.id}`,type:'pending_old',companyId:c.companyId||'',company:c.company,contactId:c.contactId||'',contact:c.name,owner:c.owner,at:c.sentAt,reason:`Connection pending for ${age} days`});
    }
  });

  const activities=activeActivitiesFor(project,'',{occurredOnly:true,nowValue:now}).filter(x=>owner==='ALL'||x.owner===owner);
  const contacts=new Map();
  for(const event of activities){
    if(!event.contact&&!event.contactId)continue;
    const key=event.contactId||`${event.companyId||canonicalizeIdentity(event.company)}::${canonicalizeIdentity(event.contact)}`;
    if(!contacts.has(key))contacts.set(key,[]);contacts.get(key).push(event);
  }
  for(const events of contacts.values()){
    const desc=[...events].sort(compareActivitiesDesc);const latestReply=desc.find(x=>x.type==='replied');
    if(latestReply&&!isReplyResolved(latestReply,events))out.push({id:`reply:${latestReply.id}`,type:'reply_waiting',companyId:latestReply.companyId||'',company:latestReply.company,contactId:latestReply.contactId||'',contact:latestReply.contact,owner:latestReply.owner,at:latestReply.at,reason:'Reply waiting for the next move'});
  }

  for(const follow of getFollowupRecords(project,{owner,now})){
    if(follow.scheduledFor&&!follow.sent&&new Date(follow.scheduledFor)<now)out.push({id:`followup:${follow.id}`,type:'follow_up_overdue',companyId:follow.companyId,company:follow.company,contactId:follow.contactId,contact:follow.contact,owner:follow.owner,at:follow.scheduledFor,reason:'Follow-up overdue',followupId:follow.id});
  }
  for(const meeting of getMeetingRecords(project,{owner,now})){
    if(meeting.booked&&!meeting.done&&!meeting.scheduledFor)out.push({id:`meeting:${meeting.id}`,type:'booked_no_schedule',companyId:meeting.companyId,company:meeting.company,contactId:meeting.contactId,contact:meeting.contact,owner:meeting.owner,at:meeting.booked.at,reason:'Meeting booked — schedule not recorded',meetingId:meeting.id});
  }
  return out.sort((a,b)=>new Date(a.at||0)-new Date(b.at||0));
};

export const getTodayAgenda=(project,owner='ALL',nowValue=currentInstant())=>{
  const today=getWorkspaceDateKey(nowValue);
  const meetings=getMeetingRecords(project,{owner,now:nowValue}).filter(m=>!m.done&&m.scheduledFor&&getWorkspaceDateKey(m.scheduledFor)===today).map(m=>m.scheduleEvent||m.booked).filter(Boolean);
  const followups=getFollowupRecords(project,{owner,now:nowValue}).filter(f=>!f.sent&&f.scheduledFor&&getWorkspaceDateKey(f.scheduledFor)===today).map(f=>f.scheduled).filter(Boolean);
  const now=new Date(nowValue);const recent=activeActivitiesFor(project,'',{occurredOnly:true,nowValue:now}).filter(x=>owner==='ALL'||x.owner===owner).slice(0,8);
  return{needsAttention:getNeedsAttention(project,owner,nowValue),meetings,followups,recent};
};

export const getNoRepeatCompanies=(project)=>{
  const seen=new Map();const add=(name)=>{const clean=String(name||'').trim();if(!clean)return;const key=canonicalizeIdentity(clean);if(!seen.has(key))seen.set(key,clean);};
  (backendMasterCompanies[project]||[]).forEach(add);
  (state.companies[project]||[]).forEach(c=>add(c.company));
  (state.connections[project]||[]).forEach(c=>add(c.company));
  return[...seen.values()].sort((a,b)=>a.localeCompare(b,undefined,{sensitivity:'base'}));
};

export const exportPrototypeSnapshot=()=>({exportedAt:new Date().toISOString(),workspaceTimezone:'Etc/GMT+4',accounts:getAccounts(),state:JSON.parse(JSON.stringify(state)),reference:{LFG:getHistoricalReference('LFG'),O1:getHistoricalReference('O1')}});

export const getActivityAnalytics=(project,{owner='ALL',days=60,now=currentInstant()}={})=>{
  const nowInstant=new Date(now);const count=Math.max(1,Number(days||60));const today=getWorkspaceDateKey(nowInstant);const startKey=addWorkspaceDays(today,-(count-1));
  const start=getWorkspaceDayRange(startKey)?.start;const end=getWorkspaceDayRange(addWorkspaceDays(today,1))?.start;
  const rows=activeActivitiesFor(project,'',{occurredOnly:true,nowValue:nowInstant}).filter(x=>owner==='ALL'||x.owner===owner).filter(x=>{
    const key=x.workdayDate||getWorkspaceDateKey(x.at);return key>=startKey&&key<=today;
  });
  const byDay=new Map();
  for(let i=0;i<count;i+=1){const key=addWorkspaceDays(startKey,i);byDay.set(key,{date:key,connection_sent:0,connection_accepted:0,connection_pending_current:0,connection_accepted_current:0,message_sent:0,followup_sent:0,followup_scheduled:0,replied:0,meeting_booked:0,meeting_scheduled:0,meeting_rescheduled:0,meeting_done:0,total:0,events:[]});}
  const connectionById=new Map((state.connections[project]||[]).filter(x=>!x.deletedAt).map(x=>[x.id,x]));
  rows.forEach(event=>{
    const bucket=byDay.get(event.workdayDate||getWorkspaceDateKey(event.at));if(!bucket)return;
    if(Object.prototype.hasOwnProperty.call(bucket,event.type))bucket[event.type]+=1;
    if(event.type==='connection_sent'&&event.sourceConnectionId){
      const conn=connectionById.get(event.sourceConnectionId);
      if(conn?.status==='Pending') bucket.connection_pending_current+=1;
      else if(['Accepted','Message Sent'].includes(conn?.status)) bucket.connection_accepted_current+=1;
    }
    bucket.total+=1;bucket.events.push(event);
  });
  const reported=reportedMetricByDay(project,owner);
  for(const [dateKey,bucket] of byDay){
    const report=reported.get(dateKey);
    if(!report) continue;
    const replacements=[
      ['connection_sent','connectionsSent'],
      ['connection_accepted','connectionsAccepted'],
      ['message_sent','messagesSent'],
      ['meeting_booked','meetingsBooked']
    ];
    for(const [metric,field] of replacements){
      const next=Number(report[field]||0);
      bucket.total += next-Number(bucket[metric]||0);
      bucket[metric]=next;
    }
    bucket.reportedDaily=true;
  }
  const timeline=[...byDay.values()];const bestBy=metric=>timeline.reduce((best,day)=>day[metric]>(best?.[metric]??-1)?day:best,null);
  const companyRecordsFor=(metric)=>{
    const map=new Map();rows.filter(x=>x.type===metric).forEach(x=>{const key=x.companyId||canonicalizeIdentity(x.company);if(!map.has(key))map.set(key,{id:x.companyId||'',name:x.company});});return[...map.values()];
  };
  const replyCompanyRecords=companyRecordsFor('replied'),meetingCompanyRecords=companyRecordsFor('meeting_booked'),messageCompanyRecords=companyRecordsFor('message_sent');
  return{timeline,bestReplyDay:bestBy('replied'),bestMeetingDay:bestBy('meeting_booked'),bestMessageDay:bestBy('message_sent'),
    replyCompanies:replyCompanyRecords.map(x=>x.name),meetingCompanies:meetingCompanyRecords.map(x=>x.name),messageCompanies:messageCompanyRecords.map(x=>x.name),
    replyCompanyRecords,meetingCompanyRecords,messageCompanyRecords};
};

export const getHistoricalReference=()=>({summary:{companies:0,outreach:0,connections:0},companies:[]});

// Test-only helpers are deliberately not exposed in the UI.
export const __resetPrototypeStateForTests=()=>{state=seed();save();};
export const __setPrototypeNowForTests=(value=null)=>{
  if(value===null||value===undefined){nowProvider=()=>new Date();return;}
  const fixed=validInstant(value); if(!fixed)throw new Error('Invalid test clock');
  nowProvider=()=>new Date(fixed.getTime());
};
export const __injectActivityForTests=(project,event={})=>{
  const row=pushActivity(project,{...event}); save(); return {...row};
};
export const __getPrototypeStateForTests=()=>JSON.parse(JSON.stringify(state));
