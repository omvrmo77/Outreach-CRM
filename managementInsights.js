import {
  getDashboardMetrics,
  getFilteredActivities,
  getConnections,
  getAccounts,
  getActivityAnalytics,
  getActiveOwners,
  getNeedsAttention as getSharedNeedsAttention
} from './crmState.js?v=20260917-multicontact1';
import { withinRange } from './date.js?v=20260918-gmt4-1';

const ownerMatch = (row, owner) => owner === 'ALL' || row.owner === owner;

export const getManagementOverview = (project, owner='ALL') => ({
  today: getDashboardMetrics(project, { owner, range:'TODAY', day:'' }),
  week: getDashboardMetrics(project, { owner, range:'7D', day:'' }),
  month: getDashboardMetrics(project, { owner, range:'30D', day:'' })
});

// Home and Reports now use the exact same attention rules.
export const getNeedsAttention = (project, owner='ALL') => getSharedNeedsAttention(project, owner).slice(0,12);

export const getAccountPerformance = (project, { owner='ALL', range='7D', day='', now=new Date() } = {}) => {
  const events=getFilteredActivities(project,{owner,range,day,now});
  const connections=getConnections(project,now).filter(row=>ownerMatch(row,owner) && withinRange(row.sentAt,range,day,now));
  return getAccounts().map(account=>{
    const rows=events.filter(event=>event.accountId===account.id);
    const sentConnections=account.platform==='LinkedIn' ? connections.filter(row=>row.accountId===account.id).length : 0;
    const messages=rows.filter(x=>x.type==='message_sent').length;
    const replies=rows.filter(x=>x.type==='replied').length;
    const meetings=rows.filter(x=>x.type==='meeting_booked').length;
    return {
      ...account,
      connections:sentConnections,
      messages,
      replies,
      meetings,
      replyRate:messages?Math.round(replies/messages*100):0,
      meetingRate:replies?Math.round(meetings/replies*100):0
    };
  });
};

export const getWeeklyReview = (project, owner='ALL') => {
  const analytics=getActivityAnalytics(project,{owner,days:7});
  const timeline=analytics.timeline;
  const best=[...timeline].sort((a,b)=>b.total-a.total)[0] || null;
  const weakest=[...timeline].sort((a,b)=>a.total-b.total)[0] || null;
  const messages=timeline.reduce((n,d)=>n+d.message_sent,0);
  const replies=timeline.reduce((n,d)=>n+d.replied,0);
  const meetings=timeline.reduce((n,d)=>n+d.meeting_booked,0);
  const connections=timeline.reduce((n,d)=>n+d.connection_sent,0);
  const accepted=timeline.reduce((n,d)=>n+d.connection_accepted,0);
  const total=timeline.reduce((n,d)=>n+d.total,0);
  return {
    analytics, best, weakest, total, messages, replies, meetings, connections, accepted,
    replyRate:messages?Math.round(replies/messages*100):0,
    meetingRate:replies?Math.round(meetings/replies*100):0,
    replyCompanies:analytics.replyCompanies,
    meetingCompanies:analytics.meetingCompanies
  };
};

export const buildWeeklyReportText = (project, owner, review) => [
  `${project} outreach weekly review`,
  `Team member: ${owner==='ALL'?'All team':owner}`,
  '',
  `Connections sent: ${review.connections}`,
  `Connections accepted: ${review.accepted}`,
  `Messages sent: ${review.messages}`,
  `Replies: ${review.replies}`,
  `Meetings booked: ${review.meetings}`,
  `Reply rate: ${review.replyRate}%`,
  `Meeting / reply rate: ${review.meetingRate}%`,
  `Best activity day: ${review.best?.date||'—'} (${review.best?.total||0} actions)`,
  `Lowest activity day: ${review.weakest?.date||'—'} (${review.weakest?.total||0} actions)`,
  '',
  'Companies that replied:',
  ...(review.replyCompanies.length?review.replyCompanies:['None']),
  '',
  'Companies that booked meetings:',
  ...(review.meetingCompanies.length?review.meetingCompanies:['None'])
].join('\n');

export const getTeamComparison = (project) => getActiveOwners().filter(x=>x.id!=='ALL').map(({id:owner})=>({
  owner,
  week:getDashboardMetrics(project,{owner,range:'7D',day:''}),
  month:getDashboardMetrics(project,{owner,range:'30D',day:''})
}));
