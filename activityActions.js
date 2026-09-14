export const activityActions = {
  note_added: { label:'Add note', detailLabel:'Note', detailPlaceholder:'Add context the team should keep with this company.', detailRequired:true, needsMeetingTime:false },
  connection_accepted: {
    label: 'Connection accepted',
    detailLabel: 'Context',
    detailPlaceholder: 'Optional note about the acceptance or next step.',
    detailRequired: false,
    needsMeetingTime: false
  },
  message_sent: {
    label: 'Message sent',
    detailLabel: 'Message sent',
    detailPlaceholder: 'Paste the exact message you sent.',
    detailRequired: true,
    needsMeetingTime: false
  },
  followup_sent: {
    label: 'Follow-up sent',
    detailLabel: 'Follow-up message',
    detailPlaceholder: 'Paste the exact follow-up you sent.',
    detailRequired: true,
    needsMeetingTime: false
  },
  followup_scheduled: {
    label: 'Set follow-up',
    detailLabel: 'Follow-up note',
    detailPlaceholder: 'Optional: what should happen in this follow-up?',
    detailRequired: false,
    needsMeetingTime: true,
    meetingLabel: 'Follow-up date & time'
  },
  replied: {
    label: 'They replied',
    detailLabel: 'Their reply',
    detailPlaceholder: 'Paste what they replied with.',
    detailRequired: true,
    secondaryLabel: 'Your response / next move',
    secondaryPlaceholder: 'Optional: paste your response or note the next action.',
    needsMeetingTime: false
  },
  meeting_booked: {
    label: 'Meeting booked',
    detailLabel: 'Booking context',
    detailPlaceholder: 'Optional: who booked it, what they said, or any useful context.',
    detailRequired: false,
    needsMeetingTime: true,
    meetingLabel: 'Meeting date & time'
  },
  meeting_scheduled: {
    label: 'Schedule meeting',
    detailLabel: 'Meeting note',
    detailPlaceholder: 'Optional meeting context.',
    detailRequired: false,
    needsMeetingTime: true,
    meetingLabel: 'Meeting date & time'
  },
  meeting_rescheduled: {
    label: 'Reschedule meeting',
    detailLabel: 'Reason / context',
    detailPlaceholder: 'Optional: why it moved or anything important.',
    detailRequired: false,
    needsMeetingTime: true,
    meetingLabel: 'New meeting date & time'
  },
  meeting_done: {
    label: 'Meeting done',
    detailLabel: 'Meeting outcome',
    detailPlaceholder: 'Optional: add any outcome or handoff note you know.',
    detailRequired: false,
    needsMeetingTime: false
  }
};

export const actionLabels = Object.fromEntries(Object.entries(activityActions).map(([key,value]) => [key,value.label]));
