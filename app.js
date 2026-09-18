import { getRoute, renderRoute } from './router.js?v=20260918-gmt4-1';
import { sidebar } from './sidebar.js';
import { topbar } from './topbar.js';
import { loader } from './loader.js';
import { getProject, setProject } from './projectState.js';
import { setOwner, setRange, setDay } from './managerState.js';
import { authenticate, initializeAuth, claimFirstAdmin, acceptInvitation, clearVerificationReturn, getInviteToken, normalizeInviteReturn, isAuthenticated, signOut, getCurrentUser, canManage, isOutreachAccount, isManagerAccount } from './authState.js';
import { currentOwner } from './access.js';
import {
  addConnection, addConnectionsBulk, setSelectedAccount, updateConnectionStatus, findConnection, getAccount, getConnections, getSelectedAccount,
  addCompany, getCompany, getActivities, recordCompanyAction, deleteLocalCompany, deleteActivity, updateActivity, undoLastAction, getActivityAnalytics, exportPrototypeSnapshot,
  getNoRepeatCompanies, canonicalizeIdentity, getCompanyContacts, getMeetingRecords, getFollowupRecords, getHistoricalConnectionPaging
} from './crmState.js?v=20260918-gmt4-1';
import { esc } from './html.js';
import { renderAnalyticsDayPanel } from './activityAnalytics.js?v=20260917-connanalytics1';
import { activityActions } from './activityActions.js';
import { combine12hTime, toLocalDateInputValue, getDeviceTimeValue, getDeviceDateKey, getWorkspaceDateKey, formatWorkspaceDateKey, formatDate, formatDateTime, timeParts12h, localDateTimeToDate, addWorkspaceDays, validateLocalDateTime } from './date.js?v=20260918-gmt4-1';
import { safeDecodeRouteComponent } from './route.js';
import { parseBatchCandidates, batchCheckSummary } from './batchCheck.js';
import { isBackendEnabled, syncBackendState, backendAddConnection, backendAddConnectionsBulk, backendAddCompany, backendRecordCompanyAction, backendUpdateActivity, backendDeleteActivity, backendUndoLastAction, backendArchiveCompany, backendSetProfileAccess, backendInviteMember, backendCheckBatch, backendLoadHistoricalConnections } from './backendSync.js?v=20260918-gmt4-1';

const app = document.getElementById('app');
let launching = true;
let parsedCompanyDraft = null;
const historicalLoadInFlight=new Set();

const showToast = (id, text) => {
  const toast=document.getElementById(id);
  if(!toast) return;
  if(text) toast.textContent=text;
  toast.classList.add('show');
  setTimeout(()=>toast.classList.remove('show'),1600);
};

const differentContactWarning = (project,{name='',company='',companyId='',contactId=''}={}) => {
  const existing=getCompany(project,companyId||company);
  if(!existing) return null;
  const target=canonicalizeIdentity(name);
  const contacts=getCompanyContacts(existing);
  const exact=contacts.some(c=>c.id===contactId || canonicalizeIdentity(c.name)===target);
  if(exact) return null;
  const others=contacts.filter(c=>canonicalizeIdentity(c.name)!==target);
  if(!others.length) return null;
  return {company:existing.company,others};
};

const confirmAdditionalCompanyContact = ({name,company,others=[]}={}) => {
  const preview=others.slice(0,3).map(c=>c.name).filter(Boolean).join(', ');
  const more=others.length>3?` and ${others.length-3} more`:'';
  return confirm(`“${company}” already has another contact in the CRM${preview?` (${preview}${more})`:''}.\n\nIf ${name} is a different person and you already sent this connection request, click OK to add them anyway.\n\nThe exact same person will still be blocked as a duplicate.`);
};


const configureWorkdayField=(fieldId,instantGetter,{preserve=false}={})=>{
  const field=document.getElementById(fieldId); if(!field) return;
  let touched=preserve;
  const sync=()=>{
    const instant=instantGetter?.(); if(!instant) return;
    const actual=getWorkspaceDateKey(instant); if(!actual) return;
    field.min=addWorkspaceDays(actual,-1); field.max=actual;
    if(!touched || !field.value || field.value>actual || field.value<field.min) field.value=actual;
    const help=field.parentElement?.querySelector('small');
    if(help) help.textContent=`Actual GMT-04 business date: ${formatWorkspaceDateKey(actual,{weekday:'short'})}. You may count this toward ${formatWorkspaceDateKey(addWorkspaceDays(actual,-1),{weekday:'short'})} if you are finishing the previous workday.`;
  };
  field.addEventListener('change',()=>{touched=true;});
  sync();
  return sync;
};

const resolveLocalFormInstant = (dateElement, timeValue) => {
  if(dateElement?.setCustomValidity) dateElement.setCustomValidity('');
  const validation=validateLocalDateTime(dateElement?.value||'',timeValue||'');
  if(validation.valid) return validation.iso;
  if(dateElement?.setCustomValidity){
    dateElement.setCustomValidity(validation.message);
    dateElement.reportValidity?.();
  } else if(validation.message) alert(validation.message);
  return null;
};

const reportFormTimeError = (dateElement, message) => {
  if(dateElement?.setCustomValidity){
    dateElement.setCustomValidity(message);
    dateElement.reportValidity?.();
  } else if(message) alert(message);
  return false;
};

const validateOccurredFormInstant = (dateElement, iso, message='This activity is in the future. Completed activity must use a time that has already occurred.') => {
  if(dateElement?.setCustomValidity) dateElement.setCustomValidity('');
  const at=new Date(iso);
  if(Number.isNaN(at.getTime())) return reportFormTimeError(dateElement,'Choose a valid activity date and time.');
  if(at>new Date()) return reportFormTimeError(dateElement,message);
  return true;
};

const render = () => {
  if (launching) {
    app.innerHTML = loader();
    return;
  }

  let route = getRoute();
  const inviteToken=getInviteToken();
  if(inviteToken && !isAuthenticated()){
    route='login';
    if(location.hash!=='#/login') normalizeInviteReturn();
  }

  if (!isAuthenticated() && route !== 'login') {
    route = 'login';
    if (location.hash !== '#/login') history.replaceState(null, '', '#/login');
  }

  if (isAuthenticated() && route === 'login') {
    route = 'home';
    const target = '#/home';
    if (location.hash !== target) history.replaceState(null, '', target);
  }

  if (isAuthenticated()) {
    const outreachRestricted = ['reports','team','settings'];
    if (isOutreachAccount() && outreachRestricted.includes(route)) {
      route = 'home';
      if (location.hash !== '#/home') history.replaceState(null, '', '#/home');
    }
    if (isManagerAccount() && route === 'add-company') {
      route = 'companies';
      if (location.hash !== '#/companies') history.replaceState(null, '', '#/companies');
    }
  }

  const view = renderRoute(route);
  app.innerHTML = view.standalone
    ? view.html
    : `<div class="app-shell">${sidebar(view.page)}<div class="main-shell">${topbar()}${view.html}</div></div>`;
  bind();
};

const BLOCK_FIELD_NAMES = [
  'Company','Contact Name','Contact','Title','Personality','Project Summary','Why Interesting','Potential LFG Angle','Funding Status','Lead Type','Agenda','Outreach Message','Message','First Message','Status','Notes',
  'Website','Target Category','Priority','Recommended Timing','Best Platform','Primary Route','Fallback Route','Why This Contact','01 Angle','O1 Angle','Desired Outcome','Next Step','Telegram Username','TG Username','Group Chat','LinkedIn Account Used'
];
const BLOCK_FIELD_LOOKUP = new Map(BLOCK_FIELD_NAMES.map(name=>[name.toLowerCase(),name]));
const MULTILINE_BLOCK_FIELDS = new Set(['Outreach Message','Message','First Message','Notes']);

const parseBlock = (text) => {
  const out = {};
  let key = '';
  String(text||'').split(/\r?\n/).forEach(raw => {
    const match=raw.match(/^([^:\r\n]+):[ \t]*(.*)$/);
    const candidate=match?BLOCK_FIELD_LOOKUP.get(match[1].trim().toLowerCase()):null;
    if(candidate){
      key=candidate;
      out[key]=match[2]||'';
      return;
    }
    if(!key) return;
    if(MULTILINE_BLOCK_FIELDS.has(key)){
      out[key]=`${out[key]||''}\n${raw}`.replace(/^\n/,'');
    } else if(raw.trim()) {
      out[key]=`${out[key]||''} ${raw.trim()}`.trim();
    }
  });
  Object.keys(out).forEach(k=>{ out[k]=MULTILINE_BLOCK_FIELDS.has(k)?String(out[k]).trim():String(out[k]).trim(); });
  return out;
};

const bindManagerFilters = () => {
  const owner = document.querySelector('#owner-filter');
  if(owner) owner.addEventListener('change', e => { setOwner(e.target.value); render(); });
  document.querySelectorAll('[data-range]').forEach(btn => btn.addEventListener('click', () => { setRange(btn.dataset.range); render(); }));
  const day = document.querySelector('#day-filter');
  if(day) day.addEventListener('change', e => { setDay(e.target.value); render(); });
  document.querySelectorAll('[data-report-day]').forEach(btn=>btn.addEventListener('click',()=>{
    setDay(btn.dataset.reportDay||'');
    setRange('CUSTOM');
    render();
  }));
};

const bindConnections = () => {
  const project=getProject();
  document.querySelectorAll('[data-account-select]').forEach(btn=>btn.addEventListener('click',()=>{
    setSelectedAccount(project,btn.dataset.accountSelect);
    render();
  }));

  const knownContact=document.getElementById('connection-known-contact');
  const connectionName=document.getElementById('connection-name');
  const connectionCompany=document.getElementById('connection-company');
  const syncKnownContact=()=>{
    const option=knownContact?.selectedOptions?.[0];
    const exact=Boolean(option?.value);
    if(exact){
      if(connectionName) connectionName.value=option.dataset.personName||'';
      if(connectionCompany) connectionCompany.value=option.dataset.companyName||'';
    }
    if(connectionName) connectionName.readOnly=exact;
    if(connectionCompany) connectionCompany.readOnly=exact;
  };
  knownContact?.addEventListener('change',syncKnownContact);
  syncKnownContact();

  const connectionInstant=()=>{const time=combine12hTime(document.getElementById('connection-hour')?.value,document.getElementById('connection-minute')?.value,document.getElementById('connection-period')?.value);return resolveLocalFormInstant(document.getElementById('connection-date'),time);};
  const syncConnectionWorkday=configureWorkdayField('connection-workday',connectionInstant);
  ['connection-date','connection-hour','connection-minute','connection-period'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>syncConnectionWorkday?.()));

  const form=document.getElementById('quick-connection-form');
  if(form) form.addEventListener('submit',async e=>{
    e.preventDefault();
    const name=connectionName?.value.trim();
    const company=connectionCompany?.value.trim();
    const selected=document.querySelector('.account-choice.selected')?.dataset.accountSelect;
    const exactOption=knownContact?.selectedOptions?.[0];
    const contactId=exactOption?.value||'';
    const companyId=contactId?(exactOption?.dataset.companyId||''):'';
    const messageBody=document.getElementById('connection-message')?.value.trim()||'';
    const selectedAccount=getAccount(selected);
    const connectionTime=combine12hTime(document.getElementById('connection-hour')?.value,document.getElementById('connection-minute')?.value,document.getElementById('connection-period')?.value);
    const sentAt=resolveLocalFormInstant(document.getElementById('connection-date'),connectionTime);
    const workdayDate=document.getElementById('connection-workday')?.value||getWorkspaceDateKey(sentAt);
    if(!name||!company||!selected||!sentAt) return;
    if(!validateOccurredFormInstant(document.getElementById('connection-date'),sentAt,'This connection request is in the future. Outreach activity must use a time that has already occurred.')) return;
    if(selectedAccount.platform==='X' && !messageBody) return;
    let allowExistingCompany=false;
    const contactWarning=differentContactWarning(project,{name,company,companyId,contactId});
    if(contactWarning){
      if(!confirmAdditionalCompanyContact({name,company:contactWarning.company,others:contactWarning.others})) return;
      allowExistingCompany=true;
    }
    let result;
    try{
      result=isBackendEnabled()
        ? await backendAddConnection(project,{name,company,companyId,contactId,accountId:selected,messageBody,sentAt,workdayDate,allowExistingCompany})
        : addConnection(project,{name,company,companyId,contactId,accountId:selected,owner:currentOwner(),messageBody,sentAt,workdayDate,allowExistingCompany});
      if(!result.ok && result.reason==='archived-company' && !allowExistingCompany){
        const okay=confirm(`“${company}” already exists in LFG history.\n\nIf ${name} is a different person at this company and you already sent this connection request, click OK to add this person anyway.`);
        if(!okay){ showToast('connection-toast','Connection not added'); return; }
        allowExistingCompany=true;
        result=isBackendEnabled()
          ? await backendAddConnection(project,{name,company,companyId,contactId,accountId:selected,messageBody,sentAt,workdayDate,allowExistingCompany:true})
          : addConnection(project,{name,company,companyId,contactId,accountId:selected,owner:currentOwner(),messageBody,sentAt,workdayDate,allowExistingCompany:true});
      }
    }catch(error){showToast('connection-toast',error.message||'Connection could not be saved');return;}
    if(!result.ok && result.reason==='duplicate'){ showToast('connection-toast','Duplicate connection already exists for this exact contact'); return; }
    if(!result.ok && (result.reason==='ambiguous-contact'||result.reason==='ambiguous-company')){ showToast('connection-toast','Multiple matching records exist — choose the exact CRM contact above'); return; }
    if(!result.ok && result.reason==='archived-company'){ showToast('connection-toast','This company already exists in LFG history. Use Add anyway only for a genuinely different person.'); return; }
    if(!result.ok && result.reason==='future-activity'){ showToast('connection-toast','This activity is in the future. Use a time that has already occurred.'); return; }
    if(!result.ok){ showToast('connection-toast','Connection could not be saved'); return; }
    render();
    showToast('connection-toast',selectedAccount.platform==='X'?'Outreach saved':'Connection added');
  });

  document.getElementById('add-bulk-connections')?.addEventListener('click',async()=>{
    const selected=document.querySelector('.account-choice.selected')?.dataset.accountSelect;
    const raw=document.getElementById('bulk-connections')?.value||'';
    if(!selected||!raw.trim()) return;
    let items=raw.split(/\r?\n/).map(line=>line.trim()).filter(Boolean).map(line=>{
      const parts=line.split(/\s*[|\t]\s*/);
      return {name:(parts[0]||'').trim(),company:(parts.slice(1).join(' | ')||'').trim()};
    }).filter(x=>x.name&&x.company);
    const additional=items.map((item,index)=>({index,item,warning:differentContactWarning(project,item)})).filter(x=>x.warning);
    if(additional.length){
      const companyNames=[...new Set(additional.map(x=>x.warning.company))];
      const okay=confirm(`${additional.length} connection${additional.length===1?'':'s'} ${additional.length===1?'is':'are'} for companies that already have another contact in the CRM:\n\n${companyNames.slice(0,8).join('\n')}${companyNames.length>8?`\n+ ${companyNames.length-8} more`:''}\n\nClick OK only if these are genuinely different people and you already sent the connection requests. Exact-person duplicates will still be blocked.`);
      if(!okay) return;
      const warned=new Set(additional.map(x=>x.index));
      items=items.map((item,index)=>warned.has(index)?{...item,allowExistingCompany:true}:item);
    }
    const connectionTime=combine12hTime(document.getElementById('connection-hour')?.value,document.getElementById('connection-minute')?.value,document.getElementById('connection-period')?.value);
    const sentAt=resolveLocalFormInstant(document.getElementById('connection-date'),connectionTime);
    const workdayDate=document.getElementById('connection-workday')?.value||getWorkspaceDateKey(sentAt);
    if(!sentAt) return;
    if(!validateOccurredFormInstant(document.getElementById('connection-date'),sentAt,'These connection requests are in the future. Outreach activity must use a time that has already occurred.')) return;
    let result;
    try{
      result=isBackendEnabled()?await backendAddConnectionsBulk(project,{items,accountId:selected,sentAt,workdayDate}):addConnectionsBulk(project,{items,accountId:selected,owner:currentOwner(),sentAt,workdayDate});
    }catch(error){showToast('connection-toast',error.message||'Connections could not be saved');return;}
    const label=document.getElementById('bulk-connection-result');
    if(label) label.textContent=`${result.added} added${result.duplicates?` · ${result.duplicates} duplicates skipped`:''}${result.ambiguous?` · ${result.ambiguous} need exact contact selection`:''}${result.archived?` · ${result.archived} archived/no-repeat protected`:''}${result.future?` · ${result.future} future timestamps rejected`:''}`;
    showToast('connection-toast',`${result.added} connections added`);
    setTimeout(render,450);
  });

  document.getElementById('copy-pending-connections')?.addEventListener('click',async()=>{
    const rows=getConnections(project).filter(x=>(canManage()||x.owner===currentOwner())&&x.status==='Pending');
    const text=rows.map(x=>`${x.name} | ${x.company} | ${getAccount(x.accountId).label} | ${formatDate(x.sentAt)}`).join('\n');
    try{await navigator.clipboard.writeText(text||'No pending connections');}catch{}
    showToast('connection-toast',`${rows.length} pending connections copied`);
  });

  document.querySelectorAll('[data-connection-status]').forEach(btn=>btn.addEventListener('click',()=>{
    updateConnectionStatus(project,btn.dataset.connectionId,btn.dataset.connectionStatus);
    render();
  }));

  document.querySelectorAll('[data-connection-filter]').forEach(btn=>btn.addEventListener('click',()=>{
    document.querySelectorAll('[data-connection-filter]').forEach(x=>x.classList.remove('active'));
    btn.classList.add('active');
    const value=btn.dataset.connectionFilter;
    document.querySelectorAll('[data-connection-row]').forEach(row=>{
      row.style.display=value==='ALL'||row.dataset.status===value?'':'none';
    });
  }));

  const loadHistorical=async()=>{
    if(!isBackendEnabled()||getRoute()!=='connections'||historicalLoadInFlight.has(project)) return;
    const paging=getHistoricalConnectionPaging(project);
    if(paging.loaded>=paging.total) return;
    historicalLoadInFlight.add(project);
    const button=document.getElementById('load-more-historical-connections');
    if(button){button.disabled=true;button.textContent='Loading historical rows…';}
    try{
      await backendLoadHistoricalConnections(project,{offset:paging.loaded,limit:50});
      if(getRoute()==='connections') render();
    }catch(error){
      console.error('Historical connection page failed',error);
      if(button){button.disabled=false;button.textContent='Retry historical rows';}
    }finally{historicalLoadInFlight.delete(project);}
  };
  document.getElementById('load-more-historical-connections')?.addEventListener('click',loadHistorical);
  const paging=getHistoricalConnectionPaging(project);
  if(getRoute()==='connections'&&paging.total>0&&paging.loaded===0&&!historicalLoadInFlight.has(project)){
    queueMicrotask(loadHistorical);
  }
};

const bindAddCompany = () => {
  const project=getProject();
  const parse=document.getElementById('parse-company');
  const paste=document.getElementById('company-paste');
  const fields=document.getElementById('company-parsed-fields');
  const banner=document.getElementById('connection-match-banner');
  const save=document.getElementById('save-company');

  // If the company already has same-name contacts, never resolve a relationship by name
  // alone. Prefer one exact name+role contact ID; otherwise leave it unmatched so the
  // user cannot accidentally bind a pending connection to the wrong person.
  const exactKnownContactForDraft=(existing,contact,role='')=>{
    if(!existing||!contact) return null;
    const sameName=getCompanyContacts(existing).filter(c=>canonicalizeIdentity(c.name)===canonicalizeIdentity(contact));
    const exactRole=sameName.filter(c=>canonicalizeIdentity(c.role||'')===canonicalizeIdentity(role||''));
    if(exactRole.length===1) return exactRole[0];
    if(!role&&sameName.length===1) return sameName[0];
    return null;
  };
  const connectionForDraft=(existing,contact,company,role='')=>{
    if(!company||!contact) return null;
    const exact=exactKnownContactForDraft(existing,contact,role);
    if(exact) return findConnection(project,contact,existing.id,currentOwner(),{contactId:exact.id});
    const sameName=existing?getCompanyContacts(existing).filter(c=>canonicalizeIdentity(c.name)===canonicalizeIdentity(contact)):[];
    if(sameName.length) return null;
    return findConnection(project,contact,existing?.id||company,currentOwner());
  };

  const resetMessageMode=()=>{
    const messageBody=document.getElementById('initial-message-body');
    if(messageBody){ messageBody.readOnly=false; messageBody.required=true; }
    const help=document.querySelector('#initial-message-panel .field-help');
    if(help) help.textContent='Required. This becomes the first message in the relationship timeline.';
  };

  if(parse&&paste&&fields&&banner&&save) parse.addEventListener('click',()=>{
    const data=parseBlock(paste.value);
    parsedCompanyDraft=data;
    const company=data.Company||'';
    const contact=data['Contact Name']||data.Contact||'';
    const existing=company?getCompany(project,company):null;
    const role=data.Title||'';
    const match=connectionForDraft(existing,contact,company,role);
    const wanted=project==='O1' ? ['Company','Contact Name','Title','Website','Target Category','Priority','Recommended Timing','Best Platform','Primary Route','Fallback Route','Why This Contact','01 Angle','O1 Angle','Desired Outcome','Outreach Message','Lead Type','Status','Next Step','Telegram Username','TG Username','Group Chat','LinkedIn Account Used','Notes'] : ['Company','Contact Name','Title','Personality','Project Summary','Why Interesting','Potential LFG Angle','Potential LFG Angle:','Funding Status','Lead Type','Agenda','Outreach Message','Status','Notes'];
    const rows=wanted.filter(k=>data[k]).map(k=>`<div class="parsed-row"><span>${esc(k)}</span><strong>${esc(data[k])}</strong></div>`).join('');
    fields.innerHTML=rows||'<div class="empty-mini">I could not find labeled fields. Make sure the block includes at least <strong>Company:</strong>.</div>';

    const messagePanel=document.getElementById('initial-message-panel');
    const messageBody=document.getElementById('initial-message-body');
    const accountWrap=document.getElementById('company-account-wrap');
    const accountSelect=document.getElementById('company-account');
    accountWrap?.classList.remove('hidden');
    messagePanel?.classList.remove('hidden');
    resetMessageMode();

    const companyContacts=existing?getCompanyContacts(existing):[];
    const sameNameContacts=companyContacts.filter(c=>canonicalizeIdentity(c.name)===canonicalizeIdentity(contact));
    const sameContact=sameNameContacts.length>0;
    const sameExactContact=sameNameContacts.some(c=>canonicalizeIdentity(c.role||'')===canonicalizeIdentity(role));
    const sameNameConfirm=document.getElementById('same-name-contact-confirm');
    const forceNewContact=document.getElementById('force-new-contact');
    sameNameConfirm?.classList.add('hidden');
    if(forceNewContact) forceNewContact.checked=false;
    const matchAccount=match?getAccount(match.accountId):null;
    const completingX=!!(existing?.provisional && sameContact && match && matchAccount?.platform==='X' && match.status==='Message Sent');
    const priorXMessage=completingX?getActivities(project,existing.id).find(a=>a.type==='message_sent' && canonicalizeIdentity(a.contact)===canonicalizeIdentity(contact) && a.sourceConnectionId===match.id):null;
    const incomingMessage=data['Outreach Message']||data['Message']||data['First Message']||'';
    if(accountSelect) accountSelect.value=match?.accountId || getSelectedAccount(project);
    if(messageBody) messageBody.value=completingX?(priorXMessage?.detail||incomingMessage):incomingMessage;

    banner.className='duplicate-banner';
    if(completingX){
      banner.classList.add('success');
      banner.innerHTML=`<span>✓</span><span><strong>${esc(contact)} · ${esc(company)}</strong> already has its first X message recorded. This will complete the company details without creating a second message.</span>`;
      if(messageBody){ messageBody.readOnly=true; messageBody.required=false; }
      const help=document.querySelector('#initial-message-panel .field-help');
      if(help) help.textContent='Already recorded from X outreach. Saving will reuse this exact message and timestamp.';
      save.dataset.baseAllowed=company&&contact?'true':'false';
      save.disabled=!(company&&contact);
      save.textContent='Complete company details';
      return;
    }

    if(existing){
      if(sameExactContact){
        banner.classList.add('danger');
        banner.innerHTML=`${esc('⚠')} <span><strong>${esc(company)}</strong> already has a contact displayed as <strong>${esc(contact)}</strong>${role?` · ${esc(role)}`:''}. If this is genuinely a different person, confirm below and the CRM will create a separate contact ID instead of merging them.</span>`;
        sameNameConfirm?.classList.remove('hidden');
        save.dataset.baseAllowed=company&&contact?'true':'false'; save.disabled=true; save.textContent='Add separate contact + message';
      } else {
        banner.classList.add('success');
        banner.innerHTML=`<span>✓</span><span><strong>${esc(company)}</strong> already exists. This will add <strong>${esc(contact||'a new contact')}</strong>${sameContact?' as a different same-name person':''} as a separate contact with its own stable ID, title/account and activity history${match?' and match the pending connection':''}.</span>`;
        save.dataset.baseAllowed=company&&contact?'true':'false'; save.disabled=!(company&&contact&&incomingMessage); save.textContent='Add contact + message';
      }
    } else if(match){
      const account=getAccount(match.accountId);
      banner.classList.add('success');
      banner.innerHTML=`<span>✓</span><span>Connection found: <strong>${esc(contact)} · ${esc(company)}</strong> via ${esc(account.label)}. Saving the first LinkedIn message will infer acceptance and keep everything in one relationship.</span>`;
      save.dataset.baseAllowed=company&&contact?'true':'false';
      save.disabled=!(company&&contact&&incomingMessage);
      save.textContent='Add company + message';
    } else {
      banner.classList.add('neutral');
      banner.innerHTML=`<span>•</span><span>No matching pending connection found. The relationship can still be saved with its first sent message, but no LinkedIn acceptance will be inferred.</span>`;
      save.dataset.baseAllowed=company&&contact?'true':'false';
      save.disabled=!(company&&contact&&incomingMessage);
      save.textContent='Add company + message';
    }
  });

  const clear=document.getElementById('clear-company');
  if(clear&&paste&&fields&&banner&&save) clear.addEventListener('click',()=>{
    paste.value=''; parsedCompanyDraft=null;
    fields.innerHTML='<div class="empty-mini">Paste the details and press <strong>Read details</strong>.</div>';
    banner.className='duplicate-banner neutral'; banner.innerHTML='Waiting for company details.';
    document.getElementById('initial-message-panel')?.classList.add('hidden');
    document.getElementById('company-account-wrap')?.classList.add('hidden');
    document.getElementById('same-name-contact-confirm')?.classList.add('hidden');
    const force=document.getElementById('force-new-contact'); if(force) force.checked=false;
    const messageBody=document.getElementById('initial-message-body'); if(messageBody){messageBody.value='';messageBody.readOnly=false;messageBody.required=true;}
    save.dataset.baseAllowed='false'; save.disabled=true; save.textContent='Add company + message';
  });

  const refreshCompanySaveState=()=>{
    if(!save) return;
    const message=document.getElementById('initial-message-body');
    const force=document.getElementById('force-new-contact');
    const confirmWrap=document.getElementById('same-name-contact-confirm');
    const needsForce=confirmWrap && !confirmWrap.classList.contains('hidden');
    const allowed=save.dataset.baseAllowed==='true' && (!needsForce || force?.checked);
    save.disabled=!(allowed && (message?.readOnly || message?.value.trim()));
  };
  document.getElementById('initial-message-body')?.addEventListener('input',refreshCompanySaveState);
  document.getElementById('force-new-contact')?.addEventListener('change',refreshCompanySaveState);

  const initialMessageInstant=()=>{const t=combine12hTime(document.getElementById('initial-message-hour')?.value,document.getElementById('initial-message-minute')?.value,document.getElementById('initial-message-period')?.value);return resolveLocalFormInstant(document.getElementById('initial-message-date'),t);};
  const syncInitialMessageWorkday=configureWorkdayField('initial-message-workday',initialMessageInstant);
  ['initial-message-date','initial-message-hour','initial-message-minute','initial-message-period'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>syncInitialMessageWorkday?.()));

  if(save) save.addEventListener('click',async()=>{
    if(!parsedCompanyDraft) return;
    const existing=getCompany(project,parsedCompanyDraft.Company||'');
    const contact=parsedCompanyDraft['Contact Name']||parsedCompanyDraft.Contact||'';
    const role=parsedCompanyDraft.Title||'';
    const match=connectionForDraft(existing,contact,parsedCompanyDraft.Company||'',role);
    const completingX=!!(existing?.provisional && getCompanyContacts(existing).some(c=>canonicalizeIdentity(c.name)===canonicalizeIdentity(contact)) && match && getAccount(match.accountId).platform==='X' && match.status==='Message Sent');
    const messageBody=document.getElementById('initial-message-body')?.value.trim()||'';
    if(!completingX && !messageBody){ showToast('company-toast','Paste the first message before saving'); document.getElementById('initial-message-body')?.focus(); return; }
    const accountId=document.getElementById('company-account')?.value||getSelectedAccount(project);
    const messageTime=combine12hTime(document.getElementById('initial-message-hour')?.value,document.getElementById('initial-message-minute')?.value,document.getElementById('initial-message-period')?.value);
    const messageSentAt=resolveLocalFormInstant(document.getElementById('initial-message-date'),messageTime);
    const workdayDate=document.getElementById('initial-message-workday')?.value||getWorkspaceDateKey(messageSentAt);
    if(!messageSentAt){ showToast('company-toast','Choose when the message was sent'); return; }
    if(!completingX&&!validateOccurredFormInstant(document.getElementById('initial-message-date'),messageSentAt)) return;
    if(!completingX&&match&&getAccount(match.accountId).platform==='LinkedIn'&&new Date(messageSentAt)<new Date(match.sentAt)){
      reportFormTimeError(document.getElementById('initial-message-date'),'This message cannot occur before the connection request.');
      return;
    }
    const forceNewContact=Boolean(document.getElementById('force-new-contact')?.checked);
    const exactContact=forceNewContact?null:exactKnownContactForDraft(existing,contact,role);
    let result;
    try{
      result=isBackendEnabled()
        ? await backendAddCompany(project,parsedCompanyDraft,{messageBody,accountId,messageSentAt,workdayDate,forceNewContact,companyId:existing?.id||'',contactId:exactContact?.id||'',matchedConnectionId:match?.id||''})
        : addCompany(project,parsedCompanyDraft,{messageBody,owner:currentOwner(),accountId,messageSentAt,forceNewContact});
    }catch(error){showToast('company-toast',error.message||'Company could not be saved');return;}
    if(!result.ok&&result.reason==='missing-message'){ showToast('company-toast','First message is required'); return; }
    if(!result.ok&&result.reason==='duplicate'){ showToast('company-toast','Matching contact already exists. Confirm it is a different person to add a separate record.'); return; }
    if(!result.ok&&result.reason==='archived-company'){ showToast('company-toast','This company was previously archived and remains protected by the Master no-repeat list. An authorized reactivation is required instead of creating a duplicate.'); return; }
    if(!result.ok&&result.reason==='future-activity'){ showToast('company-toast','This activity is in the future. Completed activity must use a time that has already occurred.'); return; }
    if(!result.ok&&result.reason==='invalid-chronology'){ showToast('company-toast','This message cannot occur before the connection request.'); return; }
    if(result.ok){
      const companyRef=result.company.id||result.company.company; parsedCompanyDraft=null;
      showToast('company-toast',result.reusedInitialMessage?'Company details completed · original X message reused':result.matchedConnection?'Company added · connection matched':'Company added');
      setTimeout(()=>{ location.hash=`#/company/${encodeURIComponent(companyRef)}`; },350);
    }
  });
};

const bindCompanyProfile = () => {
  const route=getRoute();
  if(!route.startsWith('company/')) return;
  const decoded=safeDecodeRouteComponent(route.slice(8));
  if(!decoded.ok) return;
  const project=getProject();
  const companyName=decoded.value;
  if(isManagerAccount()) return; // Manager prototype is intentionally read-only.

  const company=getCompany(project,companyName);
  const contacts=company?getCompanyContacts(company):[];
  const setPickerTime=(prefix,value)=>{
    const d=new Date(value||Date.now()); if(Number.isNaN(d.getTime())) return;
    const parts=timeParts12h(getDeviceTimeValue(d));
    const date=document.getElementById(`${prefix}-date`); if(date) date.value=toLocalDateInputValue(d);
    const hour=document.getElementById(`${prefix}-hour`); if(hour) hour.value=parts.hour;
    const minute=document.getElementById(`${prefix}-minute`); if(minute) minute.value=parts.minute;
    const period=document.getElementById(`${prefix}-period`); if(period) period.value=parts.period;
  };

  const syncContactAccount=()=>{
    const contactId=document.getElementById('activity-contact')?.value||'';
    const selected=contacts.find(c=>c.id===contactId)||contacts[0];
    const account=document.getElementById('activity-account');
    if(account && selected?.accountId) account.value=selected.accountId;
  };

  const refreshOperationalTargets=(type,existing=null)=>{
    const wrap=document.getElementById('activity-target-wrap');
    const select=document.getElementById('activity-target-id');
    const label=document.getElementById('activity-target-label');
    const help=document.getElementById('activity-target-help');
    if(!wrap||!select) return;
    select.required=false; select.innerHTML=''; wrap.classList.add('hidden');
    if(existing) return; // Editing already targets the exact activity/record IDs on that event.
    const contactId=document.getElementById('activity-contact')?.value||company?.primaryContactId||'';
    const isFollowup=type==='followup_sent';
    const isMeeting=['meeting_scheduled','meeting_rescheduled','meeting_done'].includes(type);
    if(!isFollowup&&!isMeeting) return;
    const records=isFollowup
      ? getFollowupRecords(project).filter(r=>r.companyId===company.id&&r.contactId===contactId&&!r.sent)
      : getMeetingRecords(project).filter(r=>r.companyId===company.id&&r.contactId===contactId&&!r.done);
    if(!records.length) return;
    wrap.classList.remove('hidden'); select.required=true;
    if(label) label.textContent=isFollowup?'Follow-up to mark sent':'Meeting to update';
    if(help) help.textContent=records.length>1?'Multiple open records exist. Choose the exact one; the CRM will not guess.':'This action will update this exact record ID.';
    const options=records.map(record=>{
      const when=record.scheduledFor?formatDateTime(record.scheduledFor):'No schedule recorded';
      return `<option value="${esc(record.id)}">${esc(when)}${record.status?` — ${esc(record.status)}`:''}</option>`;
    });
    select.innerHTML=(records.length>1?'<option value="">Choose exact record…</option>':'')+options.join('');
    if(records.length===1) select.value=records[0].id;
  };

  const openActionModal=(type,activityId='')=>{
    const config=activityActions[type];
    const modal=document.getElementById('activity-action-modal');
    if(!config||!modal) return;
    const existing=activityId?getActivities(project,companyName).find(a=>a.id===activityId):null;
    const typeInput=document.getElementById('activity-action-type');
    const editInput=document.getElementById('activity-edit-id');
    const title=document.getElementById('activity-modal-title');
    const detail=document.getElementById('activity-detail');
    const detailLabel=document.getElementById('activity-detail-label');
    const secondaryWrap=document.getElementById('activity-secondary-wrap');
    const secondary=document.getElementById('activity-secondary');
    const secondaryLabel=document.getElementById('activity-secondary-label');
    const meetingFields=document.getElementById('activity-meeting-fields');
    const meetingLabel=document.getElementById('activity-meeting-label');
    const contactSelect=document.getElementById('activity-contact');
    const accountSelect=document.getElementById('activity-account');
    if(typeInput) typeInput.value=type;
    if(editInput) editInput.value=activityId||'';
    if(title) title.textContent=existing?`Edit · ${config.label}`:config.label;
    if(contactSelect){
      contactSelect.value=existing?.contactId || contacts.find(c=>canonicalizeIdentity(c.name)===canonicalizeIdentity(existing?.contact||''))?.id || company?.primaryContactId || contacts[0]?.id || '';
    }
    syncContactAccount();
    if(accountSelect && existing?.accountId) accountSelect.value=existing.accountId;
    if(detail){ detail.value=existing?.detail||existing?.note||''; detail.placeholder=config.detailPlaceholder||''; detail.required=Boolean(config.detailRequired); }
    if(detailLabel) detailLabel.textContent=config.detailLabel||'Details';
    if(config.secondaryLabel){
      secondaryWrap?.classList.remove('hidden');
      if(secondary){ secondary.value=existing?.secondaryDetail||''; secondary.placeholder=config.secondaryPlaceholder||''; }
      if(secondaryLabel) secondaryLabel.textContent=config.secondaryLabel;
    } else {
      secondaryWrap?.classList.add('hidden'); if(secondary) secondary.value='';
    }
    if(config.needsMeetingTime){
      meetingFields?.classList.remove('hidden');
      if(meetingLabel) meetingLabel.textContent=config.meetingLabel||'Meeting date & time';
      setPickerTime('activity-meeting',existing?.scheduledFor||localDateTimeToDate(addWorkspaceDays(getDeviceDateKey(),1),'10:00'));
    } else meetingFields?.classList.add('hidden');
    refreshOperationalTargets(type,existing);
    setPickerTime('activity',existing?.at||new Date());
    const workday=document.getElementById('activity-workday'); if(workday) workday.value=existing?.workdayDate||getWorkspaceDateKey(existing?.at||new Date());
    const activityInstant=()=>{const t=combine12hTime(document.getElementById('activity-hour')?.value,document.getElementById('activity-minute')?.value,document.getElementById('activity-period')?.value);return resolveLocalFormInstant(document.getElementById('activity-date'),t);};
    const syncActivityWorkday=configureWorkdayField('activity-workday',activityInstant,{preserve:Boolean(existing)});
    ['activity-date','activity-hour','activity-minute','activity-period'].forEach(id=>document.getElementById(id)?.addEventListener('change',()=>syncActivityWorkday?.()));
    modal.classList.add('show'); modal.setAttribute('aria-hidden','false');
    setTimeout(()=>detail?.focus(),40);
  };

  document.getElementById('activity-contact')?.addEventListener('change',()=>{
    syncContactAccount();
    const type=document.getElementById('activity-action-type')?.value||'';
    const editId=document.getElementById('activity-edit-id')?.value||'';
    const existing=editId?getActivities(project,companyName).find(a=>a.id===editId):null;
    refreshOperationalTargets(type,existing);
  });
  document.querySelectorAll('[data-company-action]').forEach(btn=>btn.addEventListener('click',()=>openActionModal(btn.dataset.companyAction)));
  document.querySelectorAll('[data-edit-activity]').forEach(btn=>btn.addEventListener('click',()=>{ const activity=getActivities(project,companyName).find(a=>a.id===btn.dataset.editActivity); if(activity) openActionModal(activity.type,activity.id); }));
  document.querySelectorAll('[data-close-action-modal]').forEach(x=>x.addEventListener('click',()=>{ const modal=document.getElementById('activity-action-modal'); modal?.classList.remove('show'); modal?.setAttribute('aria-hidden','true'); }));

  const activityForm=document.getElementById('activity-action-form');
  if(activityForm) activityForm.addEventListener('submit',async e=>{
    e.preventDefault();
    const type=document.getElementById('activity-action-type')?.value||'message_sent';
    const config=activityActions[type]; if(!config) return;
    const activityDate=document.getElementById('activity-date')?.value;
    const activityTime=combine12hTime(document.getElementById('activity-hour')?.value,document.getElementById('activity-minute')?.value,document.getElementById('activity-period')?.value);
    const at=resolveLocalFormInstant(document.getElementById('activity-date'),activityTime);
      const workdayDate=document.getElementById('activity-workday')?.value||getWorkspaceDateKey(at);
    const detail=document.getElementById('activity-detail')?.value.trim()||'';
    const secondaryDetail=document.getElementById('activity-secondary')?.value.trim()||'';
    if(!at) return;
    if(!validateOccurredFormInstant(document.getElementById('activity-date'),at)) return;
    if(config.detailRequired&&!detail){ document.getElementById('activity-detail')?.focus(); return; }
    let scheduledFor=null;
    if(config.needsMeetingTime){
      const meetingDate=document.getElementById('activity-meeting-date')?.value;
      const meetingTime=combine12hTime(document.getElementById('activity-meeting-hour')?.value,document.getElementById('activity-meeting-minute')?.value,document.getElementById('activity-meeting-period')?.value);
      scheduledFor=resolveLocalFormInstant(document.getElementById('activity-meeting-date'),meetingTime); if(!scheduledFor) return;
    }
    const contactId=document.getElementById('activity-contact')?.value||company?.primaryContactId||'';
    const accountId=document.getElementById('activity-account')?.value||'';
    const editId=document.getElementById('activity-edit-id')?.value||'';
    const actor=getCurrentUser()?.displayName||currentOwner();
    const selectedContact=contacts.find(c=>c.id===contactId);
    if(type==='message_sent'&&selectedContact){
      const relationship=findConnection(project,selectedContact.name,company.id,company.owner||currentOwner(),{contactId:selectedContact.id,accountId});
      if(relationship&&getAccount(relationship.accountId).platform==='LinkedIn'&&new Date(at)<new Date(relationship.sentAt)){
        reportFormTimeError(document.getElementById('activity-date'),'This message cannot occur before the connection request.');
        return;
      }
    }
    if(editId){
      let updated;
      try{
        updated=isBackendEnabled()
          ? await backendUpdateActivity(project,companyName,editId,{type,at,workdayDate,scheduledFor,detail,detailLabel:config.detailLabel||'Details',secondaryDetail,secondaryLabel:config.secondaryLabel||'',contactId,accountId})
          : updateActivity(project,editId,{at,workdayDate,scheduledFor,detail,detailLabel:config.detailLabel||'Details',secondaryDetail,secondaryLabel:config.secondaryLabel||'',contactId,contact:selectedContact?.name||'',contactRole:selectedContact?.role||'',accountId},actor);
      }catch(error){showToast('profile-toast',error.message||'Activity could not be updated');return;}
      if(!updated||updated.ok===false){ showToast('profile-toast','Activity could not be updated. Check the timestamp and relationship chronology.'); return; }
      render(); showToast('profile-toast','Activity updated · previous value kept in history');
    } else {
      const targetId=document.getElementById('activity-target-id')?.value||'';
      const meetingId=['meeting_scheduled','meeting_rescheduled','meeting_done'].includes(type)?targetId:'';
      const followupId=type==='followup_sent'?targetId:'';
      let created;
      try{
        created=isBackendEnabled()
          ? await backendRecordCompanyAction(project,companyName,type,{at,workdayDate,scheduledFor,detail,detailLabel:config.detailLabel||'Details',secondaryDetail,secondaryLabel:config.secondaryLabel||'',contactId,accountId,meetingId,followupId})
          : recordCompanyAction(project,companyName,type,{at,workdayDate,scheduledFor,detail,detailLabel:config.detailLabel||'Details',secondaryDetail,secondaryLabel:config.secondaryLabel||'',actor,contactId,accountId,meetingId,followupId});
      }catch(error){showToast('profile-toast',error.message||'Activity could not be saved');return;}
      if(!created||created.ok===false){ showToast('profile-toast','Choose the exact open meeting or follow-up record'); return; }
      render(); showToast('profile-toast','Activity saved');
    }
  });

  document.querySelectorAll('[data-delete-activity]').forEach(btn=>btn.addEventListener('click',async()=>{
    const activityId=btn.dataset.deleteActivity; if(!activityId) return;
    if(confirm('Delete this activity? Dashboard, reports and company status will update automatically.')){
      try{
        if(isBackendEnabled()) await backendDeleteActivity(project,companyName,activityId,'Activity deleted from company profile');
        else deleteActivity(project,activityId,getCurrentUser()?.displayName||currentOwner());
        render(); showToast('profile-toast','Activity deleted');
      }catch(error){showToast('profile-toast',error.message||'Activity could not be deleted');}
    }
  }));
  document.getElementById('undo-last-action')?.addEventListener('click',async()=>{
    try{
      const undone=isBackendEnabled()?await backendUndoLastAction(project,companyName):undoLastAction(project,companyName,getCurrentUser()?.displayName||currentOwner());
      if(!undone||undone.ok===false){showToast('profile-toast','Nothing to undo');return;}
      render(); showToast('profile-toast',`Undid ${undone.event_type||undone.label||'last action'}`);
    }catch(error){showToast('profile-toast',error.message||'Nothing to undo');}
  });
  document.getElementById('delete-local-company')?.addEventListener('click',async()=>{
    if(confirm(`Archive “${company?.company||companyName}” and its relationship history from active CRM views?`)){
      try{
        if(isBackendEnabled()) await backendArchiveCompany(project,company.id);
        else deleteLocalCompany(project,companyName,getCurrentUser()?.displayName||currentOwner());
        location.hash='#/companies'; render();
      }catch(error){showToast('profile-toast',error.message||'Company could not be archived');}
    }
  });
};

const bindOutreachFilters = () => {
  const search=document.getElementById('outreach-search');
  const owner=document.getElementById('outreach-owner-filter');
  const status=document.getElementById('outreach-status-filter');
  const apply=()=>{
    const q=(search?.value||'').toLowerCase();
    const o=owner?.value||'ALL';
    const s=status?.value||'ALL';
    document.querySelectorAll('[data-outreach-row]').forEach(row=>{
      const okQ=!q||row.textContent.toLowerCase().includes(q);
      const okO=o==='ALL'||row.dataset.owner===o;
      const okS=s==='ALL'||row.dataset.status===s;
      row.style.display=okQ&&okO&&okS?'':'none';
    });
  };
  search?.addEventListener('input',apply); owner?.addEventListener('change',apply); status?.addEventListener('change',apply);
};



const bindActivityAnalytics = () => {
  if(getRoute()!=='activity-analytics') return;
  const project=getProject();
  const ownerSelect=document.getElementById('analytics-owner');
  const daysSelect=document.getElementById('analytics-days');
  const chart=document.getElementById('analytics-chart-scroll');
  const getDays=()=>Number(daysSelect?.value||localStorage.getItem('lfg-crm-analytics-days')||60);
  const getOwner=()=>ownerSelect?.value||(isOutreachAccount()?currentOwner():'ALL');

  ownerSelect?.addEventListener('change',e=>{
    setOwner(e.target.value);
    render();
  });
  daysSelect?.addEventListener('change',e=>{
    localStorage.setItem('lfg-crm-analytics-days',e.target.value);
    render();
  });

  const updateMetric=(metric)=>{
    document.querySelectorAll('[data-analytics-metric]').forEach(btn=>btn.classList.toggle('active',btn.dataset.analyticsMetric===metric));
    const columns=[...document.querySelectorAll('[data-analytics-day]')];
    const max=Math.max(1,...columns.map(col=>Number(col.dataset[metric]||0)));
    columns.forEach(col=>{
      const value=Number(col.dataset[metric]||0);
      const bar=col.querySelector('.analytics-bar');
      const count=col.querySelector('.analytics-day-count');
      if(bar) bar.style.height=`${Math.max(4,Math.round(value/max*100))}%`;
      if(count) count.textContent=value?String(value):'';
    });
    const label={replied:'Replies',meeting_booked:'Meetings booked',message_sent:'Messages sent',connection_sent:'Connections sent',total:'All activity'}[metric]||'Activity';
    const current=document.getElementById('analytics-current-metric');
    if(current) current.textContent=label;
  };
  document.querySelectorAll('[data-analytics-metric]').forEach(btn=>btn.addEventListener('click',()=>updateMetric(btn.dataset.analyticsMetric)));

  const selectDay=(date)=>{
    document.querySelectorAll('[data-analytics-day]').forEach(x=>x.classList.toggle('selected',x.dataset.analyticsDay===date));
    const panel=document.getElementById('analytics-day-panel');
    if(panel) panel.innerHTML=renderAnalyticsDayPanel(project,getOwner(),getDays(),date);
  };
  document.querySelectorAll('[data-analytics-day]').forEach(btn=>btn.addEventListener('click',()=>selectDay(btn.dataset.analyticsDay)));

  const copyText=async(text)=>{
    try{ await navigator.clipboard.writeText(text); }
    catch{
      const area=document.createElement('textarea'); area.value=text; area.style.position='fixed'; area.style.opacity='0'; document.body.appendChild(area); area.select(); document.execCommand('copy'); area.remove();
    }
    showToast('analytics-toast','Copied for analysis');
  };

  document.querySelectorAll('[data-copy-company-set]').forEach(btn=>btn.addEventListener('click',()=>{
    const metric=btn.dataset.copyCompanySet;
    const analytics=getActivityAnalytics(project,{owner:getOwner(),days:getDays()});
    const companies=metric==='replied'?analytics.replyCompanies:analytics.meetingCompanies;
    const title=metric==='replied'?'Companies that replied':'Companies that booked meetings';
    copyText(`${title} (${project})\n${companies.length?companies.join('\n'):'None yet'}`);
  }));

  document.getElementById('copy-analysis-brief')?.addEventListener('click',()=>{
    const analytics=getActivityAnalytics(project,{owner:getOwner(),days:getDays()});
    const replyDay=analytics.bestReplyDay;
    const meetingDay=analytics.bestMeetingDay;
    const text=[
      `LFG Outreach performance analysis set — ${project}`,
      `Owner: ${getOwner()==='ALL'?'All team':getOwner()}`,
      `Window: last ${getDays()} days`,
      '',
      `Best reply day: ${replyDay?.date||'—'} (${replyDay?.replied||0} replies)`,
      `Best meeting-booking day: ${meetingDay?.date||'—'} (${meetingDay?.meeting_booked||0} meetings)`,
      '',
      'Companies that replied:',
      ...(analytics.replyCompanies.length?analytics.replyCompanies:['None yet']),
      '',
      'Companies that booked meetings:',
      ...(analytics.meetingCompanies.length?analytics.meetingCompanies:['None yet']),
      '',
      'Analyze the patterns across these companies: what they do, their stage, geography, likely reason for interest, and what should change in our outreach targeting and messaging criteria.'
    ].join('\n');
    copyText(text);
  });

  requestAnimationFrame(()=>{ if(chart) chart.scrollLeft=chart.scrollWidth; });
};

const bindManagementViews = () => {
  const inviteForm=document.getElementById('team-invite-form');
  if(inviteForm) inviteForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const fullName=document.getElementById('team-invite-name')?.value.trim()||'';
    const email=document.getElementById('team-invite-email')?.value.trim()||'';
    const role=document.getElementById('team-invite-role')?.value||'team_member';
    const error=document.getElementById('team-invite-error');
    const resultBox=document.getElementById('team-invite-result');
    const button=inviteForm.querySelector('button[type="submit"]');
    if(error) error.textContent='';
    if(resultBox){resultBox.classList.add('hidden');resultBox.innerHTML='';}
    button.disabled=true;button.classList.add('loading');
    try{
      const result=await backendInviteMember({email,fullName,role});
      const invitation=result?.invitation;
      if(!result?.ok||!invitation?.invite_url) throw new Error('Invitation link was not created.');
      if(resultBox){
        resultBox.classList.remove('hidden');
        resultBox.innerHTML=`<div><strong>Invitation ready</strong><span>${esc(invitation.email)} · expires ${esc(formatDateTime(invitation.expires_at))}</span></div><div class="team-invite-link-row"><input id="team-invite-link" readonly value="${esc(invitation.invite_url)}"><button class="mini-action" id="copy-team-invite-link" type="button">Copy link</button></div><small>Send this private one-time link to the invited person. They will create their password from it.</small>`;
        document.getElementById('copy-team-invite-link')?.addEventListener('click',async()=>{
          const input=document.getElementById('team-invite-link');
          try{await navigator.clipboard.writeText(input?.value||'');}
          catch{input?.select();document.execCommand('copy');}
          showToast('team-toast','Invitation link copied');
        });
      }
      inviteForm.reset();
      showToast('team-toast','Invitation created');
    }catch(err){if(error)error.textContent=err?.message||'Invitation could not be created.';}
    finally{button.disabled=false;button.classList.remove('loading');}
  });
  document.querySelectorAll('[data-team-report]').forEach(btn=>btn.addEventListener('click',()=>{
    setOwner(btn.dataset.teamReport||'ALL');
    setRange('7D');
    location.hash='#/reports';
  }));

  document.querySelectorAll('[data-team-access]').forEach(btn=>btn.addEventListener('click',async()=>{
    const userId=btn.dataset.teamUser||'';
    const action=btn.dataset.teamAccess||'';
    const role=document.querySelector(`[data-team-role="${CSS.escape(userId)}"]`)?.value||'team_member';
    if(!userId) return;
    btn.disabled=true;
    try{
      if(action==='reject') await backendSetProfileAccess({userId,role,approvalStatus:'disabled',isActive:false});
      else if(action==='deactivate') await backendSetProfileAccess({userId,role,approvalStatus:'approved',isActive:false});
      else await backendSetProfileAccess({userId,role,approvalStatus:'approved',isActive:true});
      await syncBackendState(getProject());
      render();
      showToast('team-toast','Team access updated');
    }catch(error){
      btn.disabled=false;
      alert(error?.message||'Team access could not be updated.');
    }
  }));

  const weeklyCopy=document.getElementById('copy-weekly-report');
  const weeklySource=document.getElementById('weekly-report-copy-source');
  if(weeklyCopy && weeklySource) weeklyCopy.addEventListener('click',async()=>{
    const text=weeklySource.value||'';
    try{ await navigator.clipboard.writeText(text); }
    catch{ weeklySource.classList.remove('visually-hidden'); weeklySource.select(); document.execCommand('copy'); weeklySource.classList.add('visually-hidden'); }
    showToast('report-toast','Weekly report copied');
  });

  document.getElementById('export-crm-data')?.addEventListener('click',()=>{
    const data=exportPrototypeSnapshot();
    const blob=new Blob([JSON.stringify(data,null,2)],{type:'application/json'});
    const url=URL.createObjectURL(blob);
    const a=document.createElement('a'); a.href=url; a.download=`lfg-crm-export-${getWorkspaceDateKey()}.json`; a.click();
    setTimeout(()=>URL.revokeObjectURL(url),1000);
  });
};

const bindCompanySearch = () => {
  const search=document.getElementById('company-search');
  if(!search) return;
  const apply=()=>{
    const q=search.value.trim().toLowerCase();
    sessionStorage.setItem('lfg-crm-company-search', search.value.trim());
    document.querySelectorAll('[data-company-row]').forEach(row=>row.style.display=!q||row.textContent.toLowerCase().includes(q)?'':'none');
  };
  search.addEventListener('input',apply);
  apply();
};

const bindGlobalSearch = () => {
  const search=document.getElementById('global-company-search');
  if(!search) return;
  search.addEventListener('keydown',e=>{
    if(e.key!=='Enter') return;
    e.preventDefault();
    const q=search.value.trim();
    if(!q) return;
    sessionStorage.setItem('lfg-crm-company-search',q);
    if(getRoute()==='companies'){
      const local=document.getElementById('company-search');
      if(local){ local.value=q; local.dispatchEvent(new Event('input')); }
    } else {
      location.hash='#/companies';
    }
  });
};


const bind = () => {
  document.querySelectorAll('[data-project]').forEach(btn => btn.addEventListener('click', async () => {
    setProject(btn.dataset.project);
    if(isBackendEnabled()&&isAuthenticated()){
      launching=true; render();
      try{await syncBackendState(getProject());}catch(error){console.error(error);}
      launching=false;
    }
    render();
  }));

  const verificationButton=document.getElementById('verification-go-login');
  if(verificationButton) verificationButton.addEventListener('click',()=>{
    clearVerificationReturn();
    render();
  });

  const login = document.querySelector('#crm-login');
  const inviteForm = document.querySelector('#crm-accept-invite');
  const bootstrap = document.querySelector('#crm-bootstrap');
  const showLogin=()=>{login?.classList.remove('hidden');bootstrap?.classList.add('hidden');};
  const showBootstrap=()=>{login?.classList.add('hidden');bootstrap?.classList.remove('hidden');};
  document.getElementById('bootstrap-back-login')?.addEventListener('click',showLogin);

  if (login) login.addEventListener('submit', async (e) => {
    e.preventDefault();
    const email = document.querySelector('#login-email');
    const password = document.querySelector('#login-password');
    const error = document.querySelector('#login-error');
    const button = login.querySelector('button[type="submit"]');
    error.textContent = '';
    button.disabled = true; button.classList.add('loading');
    const result = await authenticate(email.value, password.value);
    button.disabled = false; button.classList.remove('loading');
    if (!result.ok) {
      if(result.reason==='pending'&&result.bootstrapAvailable){ error.textContent='Account created. This workspace still needs its first admin activation.'; showBootstrap(); return; }
      if(result.reason==='pending'){ error.textContent='Your account is waiting for an LFG admin to approve access.'; return; }
      if(result.reason==='inactive'){ error.textContent='This account is inactive. Contact an LFG admin.'; return; }
      error.textContent = result.message||'Incorrect email or password.';
      password.value = ''; password.focus();
      login.classList.remove('login-shake'); void login.offsetWidth; login.classList.add('login-shake');
      return;
    }
    login.classList.add('login-success');
    const user=getCurrentUser(); setOwner(user?.role==='outreach' ? (user.ownerName||user.displayName) : 'ALL'); setRange('7D');
    try{if(isBackendEnabled())await syncBackendState(getProject());}catch(error){error && console.error(error);}
    setTimeout(() => { location.hash = '#/home'; render(); }, 160);
  });

  if(inviteForm) inviteForm.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const password=document.getElementById('invite-password')?.value||'';
    const confirm=document.getElementById('invite-password-confirm')?.value||'';
    const error=document.getElementById('invite-error');
    const button=inviteForm.querySelector('button[type="submit"]');
    error.textContent='';
    if(password.length<8){error.textContent='Password must be at least 8 characters.';return;}
    if(password!==confirm){error.textContent='Passwords do not match.';return;}
    button.disabled=true; button.classList.add('loading');
    const result=await acceptInvitation(password);
    button.disabled=false; button.classList.remove('loading');
    if(!result.ok){error.textContent=result.message||'Invitation could not be accepted.';return;}
    const user=getCurrentUser(); setOwner(user?.role==='outreach'?(user.ownerName||user.displayName):'ALL'); setRange('7D');
    try{await syncBackendState(getProject());}catch(syncError){error.textContent=syncError.message||'Account activated, but CRM data could not be loaded.';return;}
    location.hash='#/home'; render();
  });

  if(bootstrap) bootstrap.addEventListener('submit',async(e)=>{
    e.preventDefault();
    const code=document.getElementById('bootstrap-code')?.value||''; const error=document.getElementById('bootstrap-error'); const button=bootstrap.querySelector('button[type="submit"]');
    error.textContent=''; button.disabled=true; button.classList.add('loading');
    const result=await claimFirstAdmin(code);
    button.disabled=false; button.classList.remove('loading');
    if(!result.ok){error.textContent=result.message||'Bootstrap code was not accepted.';return;}
    const user=getCurrentUser(); setOwner(user?.role==='outreach'?(user.ownerName||user.displayName):'ALL'); setRange('7D');
    try{await syncBackendState(getProject());}catch(syncError){error.textContent=syncError.message||'Admin activated, but CRM data could not be loaded.';return;}
    location.hash='#/home'; render();
  });

  document.querySelectorAll('[data-logout]').forEach(btn => btn.addEventListener('click', async () => {
    await signOut(); location.hash = '#/login'; render();
  }));

  bindManagerFilters();
  bindConnections();
  bindAddCompany();
  bindCompanyProfile();
  bindOutreachFilters();
  bindCompanySearch();
  bindGlobalSearch();
  bindActivityAnalytics();
  bindManagementViews();

  const batchInput=document.querySelector('#batch-check-input');
  const batchButton=document.querySelector('#check-company-batch');
  const batchClear=document.querySelector('#clear-company-batch');
  const batchResults=document.querySelector('#batch-check-results');
  if(batchClear) batchClear.addEventListener('click',()=>{ if(batchInput) batchInput.value=''; if(batchResults) batchResults.innerHTML=''; });
  if(batchButton && batchInput && batchResults) batchButton.addEventListener('click',async()=>{
    const items=parseBatchCandidates(batchInput.value);
    if(!items.length){ batchResults.innerHTML='<div class="batch-check-empty">Paste at least one company name first.</div>'; return; }
    batchButton.disabled=true; batchButton.classList.add('loading');
    try{
      let rows=[];
      if(isBackendEnabled()) rows=await backendCheckBatch(getProject(),items);
      else {
        const protectedSet=new Set(getNoRepeatCompanies(getProject()).map(x=>canonicalizeIdentity(x)));
        const seen=new Set();
        rows=items.map(item=>{ const key=canonicalizeIdentity(item.company); if(seen.has(key)) return {...item,status:'batch-duplicate',reason:'Repeated inside this pasted batch'}; seen.add(key); return {...item,status:protectedSet.has(key)?'duplicate':'clear',sources:protectedSet.has(key)?['Master no-repeat list']:[]}; });
      }
      const list=Array.isArray(rows)?rows:[];
      const summary=batchCheckSummary(list);
      const summaryBits=[`<strong>${summary.clear}/${summary.total}</strong> clear`,summary.duplicate?`<strong>${summary.duplicate}</strong> already in system`:'',summary.review?`<strong>${summary.review}</strong> review`:'',summary.batchDuplicate?`<strong>${summary.batchDuplicate}</strong> repeated in batch`:''].filter(Boolean).join(' · ');
      const cards=list.map(row=>{
        const cls=row.status==='clear'?'clear':row.status==='duplicate'?'duplicate':'review';
        const label=row.status==='clear'?'Clear':row.status==='duplicate'?'Already in system':row.status==='batch-duplicate'?'Repeated in batch':row.status==='review'?'Review person match':'Invalid';
        const sources=Array.isArray(row.sources)&&row.sources.length?row.sources.join(' · '):'';
        const contact=row.contact?`<span>${esc(row.contact)}</span>`:'';
        const detail=row.status==='duplicate'
          ? `${row.matched_company?`Matched: ${esc(row.matched_company)}. `:''}${sources?esc(sources):'Protected by Master List'}${row.contact_same_company?` · Exact contact also found`:''}`
          : row.status==='review'?`Company is not in the no-repeat list, but this contact name appears elsewhere in the ${esc(getProject())} history. Review before outreach.`
          : row.reason?esc(row.reason):'Not found in the current or historical no-repeat data.';
        return `<div class="batch-result-row ${cls}"><div><strong>${esc(row.company||'—')}</strong>${contact}</div><div class="batch-result-detail">${detail}</div><span class="batch-result-status">${label}</span></div>`;
      }).join('');
      batchResults.innerHTML=`<div class="batch-result-summary">${summaryBits}</div><div class="batch-result-list">${cards}</div>`;
    }catch(error){
      batchResults.innerHTML=`<div class="batch-check-empty">${esc(error.message||'Batch check failed.')}</div>`;
    }finally{ batchButton.disabled=false; batchButton.classList.remove('loading'); }
  });

  const copy = document.querySelector('#copy-master-list');
  const source = document.querySelector('#master-copy-source');
  const toast = document.querySelector('#copy-toast');
  if(source) source.value=getNoRepeatCompanies(getProject()).join('\n');
  if(copy && source) copy.addEventListener('click', async()=>{
    try { await navigator.clipboard.writeText(source.value); }
    catch { source.classList.remove('visually-hidden'); source.select(); document.execCommand('copy'); source.classList.add('visually-hidden'); }
    if(toast){ toast.classList.add('show'); setTimeout(()=>toast.classList.remove('show'),1400); }
  });
  const masterSearch = document.querySelector('#master-search');
  if(masterSearch) masterSearch.addEventListener('input', e => {
    const q=e.target.value.toLowerCase();
    document.querySelectorAll('#master-list-body tr').forEach(tr=>tr.style.display=tr.textContent.toLowerCase().includes(q)?'':'none');
  });
};

window.addEventListener('hashchange', render);
render();

const waitForFrontendReady = async () => {
  // Invitation links render immediately and do not hydrate the full CRM until activation succeeds.
  const inviteToken=normalizeInviteReturn();
  if(!inviteToken && isBackendEnabled()){
    try{
      const restored=await initializeAuth();
      if(restored) await syncBackendState(getProject());
    }catch(error){
      console.error('Backend session restore failed',error);
      await signOut();
    }
  }
  launching=false;
  if(inviteToken){
    if(location.hash!=='#/login') normalizeInviteReturn();
  }else{
    if(!location.hash || location.hash==='#/') history.replaceState(null,'',isAuthenticated()?'#/home':'#/login');
    if(location.hash==='#/login'&&isAuthenticated()) history.replaceState(null,'','#/home');
  }
  render();
};
waitForFrontendReady();
