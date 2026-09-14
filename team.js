import { getProject } from './projectState.js';
import { getTeamComparison } from './managementInsights.js';
import { getBackendProfiles } from './crmState.js';
import { getCurrentUser } from './authState.js';
import { icon } from './icons.js';
import { esc } from './html.js';

const backendRoleLabel=(role='team_member')=>({admin:'Admin',outreach_lead:'Outreach Lead',head_operations:'Head of Operations',team_member:'Outreach'}[role]||role);
const approvalLabel=(profile={})=>profile.is_active===false?'Inactive':profile.approval_status==='approved'?'Approved':profile.approval_status==='rejected'?'Rejected':'Pending';

export const teamPage=()=>{
  const project=getProject();
  const rows=getTeamComparison(project);
  const profiles=getBackendProfiles();
  const current=getCurrentUser();
  const isAdmin=current?.backendRole==='admin';
  return `<main class="page">
    <div class="page-header"><div><div class="page-kicker">${project} / Team</div><h1 class="page-title">Team performance</h1></div></div>

    <section class="team-role-grid">
      ${profiles.length?profiles.map(profile=>{
        const name=profile.full_name||profile.username||'LFG user';
        const initials=(profile.initials||name.split(/\s+/).slice(0,2).map(x=>x[0]||'').join('')).toUpperCase();
        const status=approvalLabel(profile);
        return `<div class="card card-pad team-role-card" data-team-user-card="${esc(profile.id)}">
          <div class="avatar">${esc(initials||'LF')}</div>
          <div><span class="manager-label">${esc(backendRoleLabel(profile.role))} · ${esc(status)}</span><h3>${esc(name)}</h3><p>${esc(profile.job_title||profile.username||'LFG workspace member')}</p></div>
          ${isAdmin&&profile.id!==current?.id?`<div class="role-permission-list">
            <select class="manager-select" data-team-role="${esc(profile.id)}">
              <option value="team_member" ${profile.role==='team_member'?'selected':''}>Outreach</option>
              <option value="outreach_lead" ${profile.role==='outreach_lead'?'selected':''}>Outreach Lead</option>
              <option value="head_operations" ${profile.role==='head_operations'?'selected':''}>Head of Operations</option>
              <option value="admin" ${profile.role==='admin'?'selected':''}>Admin</option>
            </select>
            <button class="mini-action" data-team-access="approve" data-team-user="${esc(profile.id)}">${profile.approval_status==='approved'&&profile.is_active!==false?'Save role':'Approve'}</button>
            <button class="mini-action" data-team-access="reject" data-team-user="${esc(profile.id)}">Reject</button>
            <button class="mini-action" data-team-access="${profile.is_active===false?'reactivate':'deactivate'}" data-team-user="${esc(profile.id)}">${profile.is_active===false?'Reactivate':'Deactivate'}</button>
          </div>`:`<div class="role-permission-list"><span>${esc(status)}</span><span>${esc(backendRoleLabel(profile.role))}</span></div>`}
        </div>`;
      }).join(''):'<div class="card card-pad"><div class="empty-mini">No team profiles yet.</div></div>'}
    </section>

    <section class="card card-pad team-comparison-card">
      <div class="section-head"><div><h3 class="section-title">Outreach team comparison</h3></div></div>
      <div class="team-comparison-table">
        <div class="team-comparison-row team-comparison-head"><span>Team member</span><span>7d messages</span><span>7d replies</span><span>7d meetings</span><span>30d messages</span><span>30d replies</span><span>30d meetings</span><span></span></div>
        ${rows.length ? rows.map(row=>`<div class="team-comparison-row"><div><strong>${esc(row.owner)}</strong><small>Outreach</small></div><strong>${row.week.messages}</strong><strong>${row.week.replies}</strong><strong>${row.week.meetings}</strong><strong>${row.month.messages}</strong><strong>${row.month.replies}</strong><strong>${row.month.meetings}</strong><button class="mini-action" data-team-report="${esc(row.owner)}">View report ${icon('arrow')}</button></div>`).join('') : '<div class="empty-mini">No team activity yet.</div>'}
      </div>
    </section>
    <div id="team-toast" class="toast" aria-live="polite"></div>
  </main>`;
};
