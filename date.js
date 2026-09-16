export const WORKSPACE_TIMEZONE = 'America/Chicago';

const DATE_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;
const asDate = (value) => value instanceof Date ? new Date(value.getTime()) : (value ? new Date(value) : null);
const pad = (value) => String(value).padStart(2, '0');

export const getDeviceTimeZone = () => Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';

export const getDeviceDateKey = (value = new Date()) => {
  const d=asDate(value);
  if(!d || Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`;
};

export const getDeviceTimeValue = (value = new Date()) => {
  const d=asDate(value);
  if(!d || Number.isNaN(d.getTime())) return '';
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

export const validateLocalDateTime = (dateKey, time='00:00') => {
  if (!DATE_KEY_RE.test(String(dateKey || '')) || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(time || ''))) {
    return {valid:false,date:null,iso:null,message:'Choose a valid local date and time.'};
  }
  const [y,m,d]=String(dateKey).split('-').map(Number);
  const [hh=0,mm=0,ss=0]=String(time).split(':').map(Number);
  const local=new Date(y,m-1,d,hh,mm,ss,0);
  const matches=local.getFullYear()===y && local.getMonth()===m-1 && local.getDate()===d && local.getHours()===hh && local.getMinutes()===mm && local.getSeconds()===ss;
  if(!matches || Number.isNaN(local.getTime())){
    return {valid:false,date:null,iso:null,message:`This local time does not exist in ${getDeviceTimeZone()} because of a daylight-saving time change. Choose another time.`};
  }
  return {valid:true,date:local,iso:local.toISOString(),message:''};
};

export const localDateTimeToDate = (dateKey,time='00:00') => {
  const result=validateLocalDateTime(dateKey,time);
  return result.valid ? new Date(result.date.getTime()) : null;
};

export const localDateTimeToIso = (dateKey,time='00:00') => validateLocalDateTime(dateKey,time).iso;

export const toLocalDateInputValue = (value = new Date()) => getDeviceDateKey(value);

const workspacePartsFormatter = new Intl.DateTimeFormat('en-US', {
  timeZone: WORKSPACE_TIMEZONE,
  year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', second: '2-digit',
  hourCycle: 'h23'
});

const partsObject = (value) => {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return null;
  const out = {};
  workspacePartsFormatter.formatToParts(d).forEach(part => {
    if (part.type !== 'literal') out[part.type] = part.value;
  });
  return {
    year: Number(out.year), month: Number(out.month), day: Number(out.day),
    hour: Number(out.hour), minute: Number(out.minute), second: Number(out.second)
  };
};

export const getWorkspaceNow = () => new Date();

export const getWorkspaceDateKey = (value = new Date()) => {
  if (typeof value === 'string' && DATE_KEY_RE.test(value)) return value;
  const p = partsObject(value);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}` : '';
};

export const getWorkspaceBusinessDate = getWorkspaceDateKey;

export const getWorkspaceTimeValue = (value = new Date()) => {
  const p = partsObject(value);
  return p ? `${pad(p.hour)}:${pad(p.minute)}` : '';
};

export const getWorkspaceHour = (value = new Date()) => partsObject(value)?.hour ?? 0;

export const addWorkspaceDays = (dateKey, amount) => {
  if (!DATE_KEY_RE.test(String(dateKey || ''))) return '';
  const [y, m, d] = dateKey.split('-').map(Number);
  const utc = new Date(Date.UTC(y, m - 1, d + Number(amount || 0), 12));
  return `${utc.getUTCFullYear()}-${pad(utc.getUTCMonth() + 1)}-${pad(utc.getUTCDate())}`;
};

const desiredWallMs = (dateKey, time = '00:00:00') => {
  const [y, m, d] = String(dateKey).split('-').map(Number);
  const [hh = 0, mm = 0, ss = 0] = String(time).split(':').map(Number);
  if (![y,m,d,hh,mm,ss].every(Number.isFinite)) return NaN;
  return Date.UTC(y, m - 1, d, hh, mm, ss, 0);
};

const wallPartsMatch = (value, dateKey, time) => {
  const p=partsObject(value);
  if(!p) return false;
  const [y,m,d]=String(dateKey).split('-').map(Number);
  const [hh=0,mm=0,ss=0]=String(time).split(':').map(Number);
  return p.year===y && p.month===m && p.day===d && p.hour===hh && p.minute===mm && p.second===ss;
};

const workspaceOffsetMsAt = (value) => {
  const d=asDate(value); const p=partsObject(d);
  if(!d || !p) return null;
  return Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute,p.second,0)-d.getTime();
};

// Resolve a Chicago wall-clock date/time by testing the real offsets around that date.
// This makes nonexistent spring-forward times detectable and fall-back ambiguity explicit.
// Ambiguous fall-back times deterministically use the EARLIER instant (the first occurrence).
const workspaceWallTimeCandidates = (dateKey, time='00:00') => {
  if (!DATE_KEY_RE.test(String(dateKey || '')) || !/^\d{1,2}:\d{2}(?::\d{2})?$/.test(String(time || ''))) return [];
  const wanted=desiredWallMs(dateKey,time);
  if(!Number.isFinite(wanted)) return [];
  const probeHours=[-36,-24,-12,0,12,24,36];
  const offsets=[...new Set(probeHours.map(h=>workspaceOffsetMsAt(new Date(wanted+h*3600000))).filter(Number.isFinite))];
  const unique=new Map();
  for(const offset of offsets){
    const candidate=new Date(wanted-offset);
    if(wallPartsMatch(candidate,dateKey,time)) unique.set(candidate.getTime(),candidate);
  }
  return [...unique.values()].sort((a,b)=>a-b);
};

export const validateWorkspaceDateTime = (dateKey, time='00:00') => {
  const candidates=workspaceWallTimeCandidates(dateKey,time);
  if(!candidates.length){
    return {
      valid:false,
      code:'nonexistent-workspace-time',
      date:null,
      iso:null,
      ambiguous:false,
      message:'This time does not exist in Chicago because of the daylight-saving time change. Please choose another time.'
    };
  }
  const date=new Date(candidates[0].getTime());
  return {
    valid:true,
    code:candidates.length>1?'ambiguous-workspace-time':'valid',
    date,
    iso:date.toISOString(),
    ambiguous:candidates.length>1,
    ambiguityPolicy:candidates.length>1?'earlier-occurrence':null,
    message:''
  };
};

// Convert a Chicago wall-clock date/time into its exact UTC instant using the IANA zone.
// Never use a fixed CST/CDT offset. Fall-back ambiguity uses the earlier occurrence.
export const workspaceDateTimeToDate = (dateKey, time = '00:00') => {
  const result=validateWorkspaceDateTime(dateKey,time);
  return result.valid ? new Date(result.date.getTime()) : null;
};

export const workspaceDateTimeToIso = (date, time) => validateWorkspaceDateTime(date,time).iso;

export const getWorkspaceDayRange = (dateKey = getWorkspaceDateKey()) => {
  const start = workspaceDateTimeToDate(dateKey, '00:00:00');
  const end = workspaceDateTimeToDate(addWorkspaceDays(dateKey, 1), '00:00:00');
  return start && end ? { dateKey, start, end, startIso:start.toISOString(), endIso:end.toISOString() } : null;
};

export const getWorkspaceWeekRange = (value = new Date()) => {
  const key = getWorkspaceDateKey(value);
  const [y,m,d] = key.split('-').map(Number);
  const weekday = new Date(Date.UTC(y,m-1,d,12)).getUTCDay();
  const mondayOffset = (weekday + 6) % 7;
  const startKey = addWorkspaceDays(key, -mondayOffset);
  const endKey = addWorkspaceDays(startKey, 7);
  return { startKey, endKey, start:getWorkspaceDayRange(startKey)?.start || null, end:getWorkspaceDayRange(endKey)?.start || null };
};

export const getWorkspaceMonthRange = (value = new Date()) => {
  const key = getWorkspaceDateKey(value);
  const [y,m] = key.split('-').map(Number);
  const startKey = `${y}-${pad(m)}-01`;
  const next = new Date(Date.UTC(y, m, 1, 12));
  const endKey = `${next.getUTCFullYear()}-${pad(next.getUTCMonth()+1)}-01`;
  return { startKey, endKey, start:getWorkspaceDayRange(startKey)?.start || null, end:getWorkspaceDayRange(endKey)?.start || null };
};

export const isWorkspaceToday = (value, now = new Date()) => getWorkspaceDateKey(value) === getWorkspaceDateKey(now);

export const workspaceDayDifference = (later, earlier) => {
  const a = getWorkspaceDateKey(later);
  const b = getWorkspaceDateKey(earlier);
  if (!a || !b) return 0;
  const [ay,am,ad]=a.split('-').map(Number);
  const [by,bm,bd]=b.split('-').map(Number);
  return Math.floor((Date.UTC(ay,am-1,ad)-Date.UTC(by,bm-1,bd))/86400000);
};

export const formatDateTime = (value) => {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US', {
    timeZone: WORKSPACE_TIMEZONE,
    day: '2-digit', month: 'short', year: 'numeric', hour: 'numeric', minute: '2-digit', hour12: true
  }).format(d);
};

export const formatDeviceDateTime = (value) => {
  const d=asDate(value);
  if(!d || Number.isNaN(d.getTime())) return 'Date unavailable';
  return new Intl.DateTimeFormat('en-US',{day:'2-digit',month:'short',year:'numeric',hour:'numeric',minute:'2-digit',hour12:true}).format(d);
};

export const formatDate = (value) => {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone:WORKSPACE_TIMEZONE, day:'2-digit', month:'short', year:'numeric' }).format(d);
};

export const formatTime = (value) => {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { timeZone:WORKSPACE_TIMEZONE, hour:'numeric', minute:'2-digit', hour12:true }).format(d);
};

export const formatWorkspaceDateKey = (dateKey, options={}) => {
  if (!DATE_KEY_RE.test(String(dateKey || ''))) return String(dateKey || '—');
  const [y,m,d] = dateKey.split('-').map(Number);
  const stable = new Date(Date.UTC(y,m-1,d,12));
  return new Intl.DateTimeFormat('en-US', { timeZone:'UTC', month:'short', day:'numeric', year:'numeric', ...options }).format(stable);
};

export const formatWorkspaceWeekday = (dateKey, style='short') => {
  if (!DATE_KEY_RE.test(String(dateKey || ''))) return '';
  const [y,m,d] = dateKey.split('-').map(Number);
  return new Intl.DateTimeFormat('en-US',{timeZone:'UTC',weekday:style}).format(new Date(Date.UTC(y,m-1,d,12)));
};

export const toDateInputValue = (value = new Date()) => getWorkspaceDateKey(value);

export const toDateTimeLocalValue = (value = new Date()) => {
  const p=partsObject(value);
  return p ? `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}` : '';
};

export const timeParts12h = (value = '10:00') => {
  const [rawHour='10', rawMinute='00'] = String(value || '10:00').split(':');
  let h24 = Number(rawHour);
  let minute = Number(rawMinute);
  if (!Number.isFinite(h24) || h24 < 0 || h24 > 23) h24 = 10;
  if (!Number.isFinite(minute) || minute < 0 || minute > 59) minute = 0;
  return { hour:String(h24 % 12 || 12), minute:pad(minute), period:h24 < 12 ? 'AM' : 'PM' };
};

export const hourOptions12h = (selected = '10') => Array.from({length:12},(_,i)=>i+1)
  .map(hour => `<option value="${hour}" ${String(hour)===String(selected)?'selected':''}>${hour}</option>`).join('');

export const minuteOptions = (selected = '00') => Array.from({length:60},(_,i)=>pad(i))
  .map(minute => `<option value="${minute}" ${minute===String(selected).padStart(2,'0')?'selected':''}>${minute}</option>`).join('');

export const periodOptions = (selected = 'AM') => ['AM','PM']
  .map(period => `<option value="${period}" ${period===selected?'selected':''}>${period}</option>`).join('');

export const combine12hTime = (hour, minute, period) => {
  let h = Number(hour); const m = Number(minute);
  if (!Number.isFinite(h) || h < 1 || h > 12 || !Number.isFinite(m) || m < 0 || m > 59) return '';
  if (period === 'AM') h = h === 12 ? 0 : h;
  else if (period === 'PM') h = h === 12 ? 12 : h + 12;
  else return '';
  return `${pad(h)}:${pad(m)}`;
};

// Reporting helper for completed/occurred activity. Chicago defines the business-day
// boundaries, while the actual current instant is always the upper bound. A timestamp
// later today in Chicago therefore does not count until that instant has actually occurred.
export const withinRange = (value, range, customDay = '', nowValue = new Date()) => {
  const d = asDate(value);
  const now = asDate(nowValue);
  if (!d || Number.isNaN(d.getTime()) || !now || Number.isNaN(now.getTime()) || d>now) return false;
  if (range === 'CUSTOM' && customDay) return getWorkspaceDateKey(d) === customDay;
  const todayKey=getWorkspaceDateKey(now);
  if (range === 'TODAY') {
    const bounds=getWorkspaceDayRange(todayKey); return !!bounds && d>=bounds.start && d<bounds.end;
  }
  if (range === 'WEEK') {
    const bounds=getWorkspaceWeekRange(now); return !!bounds.start && !!bounds.end && d>=bounds.start && d<bounds.end;
  }
  if (range === 'MONTH') {
    const bounds=getWorkspaceMonthRange(now); return !!bounds.start && !!bounds.end && d>=bounds.start && d<bounds.end;
  }
  const days = range === '30D' ? 30 : 7;
  const startKey=addWorkspaceDays(todayKey,-(days-1));
  const start=getWorkspaceDayRange(startKey)?.start;
  return !!start && d>=start;
};

export const formatCompactDateTime = (value) => {
  const d = asDate(value);
  if (!d || Number.isNaN(d.getTime())) return 'Date unavailable';
  const date = new Intl.DateTimeFormat('en-US',{timeZone:WORKSPACE_TIMEZONE,month:'short',day:'numeric'}).format(d);
  const time = new Intl.DateTimeFormat('en-US',{timeZone:WORKSPACE_TIMEZONE,hour:'numeric',minute:'2-digit',hour12:true}).format(d);
  return `${date} · ${time}`;
};
