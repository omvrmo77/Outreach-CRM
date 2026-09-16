import { homePage } from './home.js';
import { dashboardPage } from './dashboard.js';
import { companiesPage } from './companies.js';
import { outreachPage } from './outreach.js';
import { connectionsPage } from './connections.js';
import { followupsPage } from './followups.js';
import { meetingsPage } from './meetings.js';
import { reportsPage } from './reports.js';
import { teamPage } from './team.js';
import { settingsPage } from './settings.js';
import { companyProfilePage } from './companyProfile.js';
import { loginPage } from './login.js';
import { masterListPage } from './masterList.js';
import { addCompanyPage } from './addCompany.js';
import { activityAnalyticsPage } from './activityAnalytics.js';
import { profilePage } from './profile.js';
import { safeDecodeRouteComponent } from './route.js';

export const getRoute = () => {
  const raw=location.hash.replace(/^#\//,'').split('?')[0];
  return raw || 'login';
};
export const renderRoute = (route) => {
  if(route==='login') return { standalone:true, html:loginPage() };
  if(route.startsWith('company/')) {
    const decoded=safeDecodeRouteComponent(route.slice(8));
    if(!decoded.ok) return {page:'companies',html:companyProfilePage('',{invalidRoute:true})};
    return { page:'companies', html:companyProfilePage(decoded.value,{decoded:true}) };
  }
  const routes = { home:homePage, dashboard:dashboardPage, companies:companiesPage, outreach:outreachPage, connections:connectionsPage, followups:followupsPage, meetings:meetingsPage, reports:reportsPage, team:teamPage, master:masterListPage, 'add-company':addCompanyPage, 'activity-analytics':activityAnalyticsPage, profile:profilePage, settings:settingsPage };
  const fn = routes[route] || homePage;
  return { page: routes[route] ? route : 'home', html: fn() };
};
