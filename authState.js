import { authRequest, backendOperations } from './crmApi.js';

const SESSION_KEY='lfg-crm-supabase-session-v1';
const REFRESH_SKEW_MS=60_000;

const PUBLIC_APP_URL='https://omvrmo77.github.io/Outreach-CRM/';
const EMAIL_VERIFICATION_REDIRECT=`${PUBLIC_APP_URL}?verified=1`;

export const getVerificationReturn=()=>{
  try{
    const params=new URLSearchParams(location.search);
    const verified=params.get('verified')==='1';
    const error=params.get('error')||'';
    const description=params.get('error_description')||params.get('error_description'.replace('_',' '))||'';
    return {verified,error,description};
  }catch{return {verified:false,error:'',description:''};}
};

export const clearVerificationReturn=()=>{
  try{
    const url=new URL(location.href);
    url.searchParams.delete('verified');
    url.searchParams.delete('error');
    url.searchParams.delete('error_code');
    url.searchParams.delete('error_description');
    url.hash='#/login';
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }catch{
    try{history.replaceState(null,'',`${location.pathname}#/login`);}catch{}
  }
};

const inviteParamFrom=(value='')=>{
  try{
    const params=new URLSearchParams(String(value||'').replace(/^\?/,''));
    return params.get('invite_token')||params.get('invite')||'';
  }catch{return '';}
};

export const getInviteToken=()=>{
  try{
    const direct=inviteParamFrom(location.search);
    if(direct) return direct;
    const hash=String(location.hash||'');
    const qIndex=hash.indexOf('?');
    if(qIndex>=0){
      const fromHash=inviteParamFrom(hash.slice(qIndex+1));
      if(fromHash) return fromHash;
    }
    return '';
  }catch{return '';}
};

export const normalizeInviteReturn=()=>{
  const token=getInviteToken();
  if(!token) return '';
  try{
    const url=new URL(location.href);
    url.search='';
    url.searchParams.set('invite_token',token);
    url.hash='#/login';
    history.replaceState(null,'',url.pathname+url.search+url.hash);
  }catch{}
  return token;
};

let session=null;
let authenticated=false;
let currentUser=null;
let pendingProfile=null;

const initialsFor=(name='')=>String(name||'').trim().split(/\s+/).filter(Boolean).slice(0,2).map(x=>x[0]?.toUpperCase()||'').join('')||'LF';
const uiRoleFor=(backendRole='team_member')=>{
  if(backendRole==='admin') return 'admin';
  if(['outreach_lead','head_operations'].includes(backendRole)) return 'manager';
  return 'outreach';
};
const roleLabelFor=(profile={})=>profile.job_title||({admin:'Admin',outreach_lead:'Outreach Lead',head_operations:'Head of Operations',team_member:'Outreach'}[profile.role]||'Outreach');

const clearSession=()=>{
  session=null;authenticated=false;currentUser=null;pendingProfile=null;
  try{localStorage.removeItem(SESSION_KEY);}catch{}
};

const persistSession=(value)=>{
  if(!value?.access_token){ clearSession(); return; }
  session={
    access_token:value.access_token,
    refresh_token:value.refresh_token||session?.refresh_token||'',
    expires_at:Number(value.expires_at||0) || Math.floor(Date.now()/1000)+Number(value.expires_in||3600),
    token_type:value.token_type||'bearer',
    user:value.user||session?.user||null
  };
  try{localStorage.setItem(SESSION_KEY,JSON.stringify(session));}catch{}
};

const readStoredSession=()=>{
  try{
    const parsed=JSON.parse(localStorage.getItem(SESSION_KEY)||'null');
    return parsed?.access_token?parsed:null;
  }catch{return null;}
};

const applyProfile=(profile)=>{
  if(!profile){authenticated=false;currentUser=null;pendingProfile=null;return;}
  pendingProfile=profile;
  if(profile.approval_status!=='approved'||profile.is_active===false){authenticated=false;currentUser=null;return;}
  const displayName=profile.full_name||profile.username||profile.email||'LFG User';
  currentUser={
    id:profile.id,
    email:profile.email||session?.user?.email||'',
    username:profile.username||profile.email||'',
    displayName,
    initials:profile.initials||initialsFor(displayName),
    backendRole:profile.role||'team_member',
    role:uiRoleFor(profile.role),
    roleLabel:roleLabelFor(profile),
    ownerName:displayName,
    approvalStatus:profile.approval_status,
    jobTitle:profile.job_title||'',
    productCodes:Array.isArray(profile.product_codes)?profile.product_codes.map(String):[],
    products:Array.isArray(profile.products)?profile.products.map(x=>({...x})):[]
  };
  authenticated=true;
};

const refreshIfNeeded=async()=>{
  if(!session?.access_token) return null;
  const expiresMs=Number(session.expires_at||0)*1000;
  if(expiresMs && expiresMs-Date.now()>REFRESH_SKEW_MS) return session.access_token;
  if(!session.refresh_token){clearSession();return null;}
  try{
    const refreshed=await authRequest('token?grant_type=refresh_token',{body:{refresh_token:session.refresh_token}});
    persistSession(refreshed);
    return session?.access_token||null;
  }catch{
    clearSession();return null;
  }
};

const loadProfile=async()=>{
  const token=await refreshIfNeeded();
  if(!token) return null;
  const profile=await backendOperations.myProfile(token);
  applyProfile(profile);
  return profile;
};

export const initializeAuth=async()=>{
  session=readStoredSession();
  if(!session) return false;
  try{await loadProfile();return authenticated;}catch{clearSession();return false;}
};

export const authenticate=async(email,password)=>{
  try{
    const result=await authRequest('token?grant_type=password',{body:{email:String(email||'').trim(),password:String(password||'')}});
    persistSession(result);
    const profile=await loadProfile();
    if(profile?.approval_status==='approved'&&profile?.is_active!==false) return {ok:true,profile};
    let bootstrapAvailable=false;
    try{bootstrapAvailable=Boolean(await backendOperations.bootstrapAvailable(session.access_token));}catch{}
    return {ok:false,reason:profile?.is_active===false?'inactive':'pending',profile,bootstrapAvailable};
  }catch(error){clearSession();return {ok:false,reason:'credentials',message:error.message};}
};

export const signUp=async(email,password,fullName='')=>{
  try{
    const result=await authRequest(`signup?redirect_to=${encodeURIComponent(EMAIL_VERIFICATION_REDIRECT)}`,{body:{email:String(email||'').trim(),password:String(password||''),data:{full_name:String(fullName||'').trim()}}});
    if(result?.access_token){
      persistSession(result);
      const profile=await loadProfile();
      let bootstrapAvailable=false;
      try{bootstrapAvailable=Boolean(await backendOperations.bootstrapAvailable(session.access_token));}catch{}
      return {ok:true,requiresConfirmation:false,profile,bootstrapAvailable};
    }
    return {ok:true,requiresConfirmation:true,user:result?.user||null};
  }catch(error){return {ok:false,message:error.message};}
};

export const claimFirstAdmin=async(bootstrapToken)=>{
  const token=await getAccessToken();
  if(!token) return {ok:false,message:'Sign in first.'};
  try{
    const profile=await backendOperations.claimFirstAdmin(token,String(bootstrapToken||'').trim());
    applyProfile(profile);
    return {ok:authenticated,profile};
  }catch(error){return {ok:false,message:error.message};}
};


export const acceptInvitation=async(password)=>{
  const token=getInviteToken();
  if(!token) return {ok:false,message:'Invitation token is missing.'};
  try{
    const accepted=await backendOperations.acceptInvite({token,password:String(password||'')});
    if(!accepted?.ok||!accepted?.email) return {ok:false,message:'Invitation could not be accepted.'};
    const signedIn=await authenticate(accepted.email,password);
    if(!signedIn.ok) return {ok:false,message:signedIn.message||'Account created, but sign-in failed.'};
    try{history.replaceState(null,'',`${location.pathname}#/home`);}catch{}
    return {ok:true,profile:signedIn.profile,email:accepted.email};
  }catch(error){return {ok:false,message:error.message};}
};

export const getAccessToken=async()=>refreshIfNeeded();
export const hasAuthSession=()=>Boolean(session?.access_token);
export const getPendingProfile=()=>pendingProfile;
export const isAuthenticated=()=>authenticated;
export const getCurrentUser=()=>currentUser;

export const getAccessibleProductCodes=()=>Array.isArray(currentUser?.productCodes)?[...currentUser.productCodes]:[];
export const canAccessProduct=(code)=>getAccessibleProductCodes().includes(String(code||''));
export const canManage=()=>['admin','manager'].includes(currentUser?.role);
export const isManagerAccount=()=>currentUser?.role==='manager';
export const isOutreachAccount=()=>currentUser?.role==='outreach';
export const getPrototypeUsers=()=>[];

export const signOut=async()=>{
  const token=session?.access_token||'';
  try{if(token)await authRequest('logout',{token,body:{}});}catch{}
  clearSession();
};
