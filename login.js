import { icon } from './icons.js';
import { getInviteToken, getVerificationReturn } from './authState.js?v=20260918-major4';

export const loginPage = () => {
  const inviteToken=getInviteToken();
  const inviteMode=Boolean(inviteToken);
  const verification=getVerificationReturn();
  const verificationMode=verification.verified;
  return `
  <main class="login-page">
    <section class="login-art">
      <div class="login-atmosphere" aria-hidden="true"><i></i><i></i><i></i></div>
      <img class="login-logo" src="./lfg-logo.png" alt="LFG">
      <div class="login-statement">
        <div class="page-kicker">Internal operations</div>
        <h1>One system.<br>Every conversation.</h1>
        <p>Outreach intelligence for Laissez-Faire Group — companies, contacts, replies, meetings and follow-ups in one controlled workspace.</p>
      </div>
      <div class="login-security-note">${icon('shield')} <span>Private LFG workspace · Supabase secured</span></div>
    </section>

    <section class="login-panel">
      <div class="login-box">
        <div class="page-kicker">LFG Outreach CRM</div>
        ${verificationMode?`
          <div class="verification-success">
            <div class="verification-success-icon">${icon('check')}</div>
            <div class="page-kicker">Email verification</div>
            <h2>Your email is verified.</h2>
            <p>Your email address has been confirmed successfully. You can now return to the LFG Outreach CRM and sign in with your email and password.</p>
            <div class="duplicate-banner success"><span>✓</span><span>Verification complete. Your account is ready for the next access step.</span></div>
            <button class="button primary login-submit" id="verification-go-login" type="button"><span>Go to sign in</span>${icon('arrow')}</button>
            <a class="mini-action verification-home-link" href="https://omvrmo77.github.io/Outreach-CRM/">Open CRM home</a>
          </div>
        `:inviteMode?`
          <h2>Accept invitation.</h2>
          <p>Create your password to activate the LFG workspace account assigned to this invitation.</p>
          <form class="login-form" id="crm-accept-invite" novalidate>
            <div class="duplicate-banner neutral"><span>•</span><span>This invitation link is private, one-time use, and expires after 7 days.</span></div>
            <div class="field"><label for="invite-password">Create password</label><input id="invite-password" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="field"><label for="invite-password-confirm">Confirm password</label><input id="invite-password-confirm" type="password" autocomplete="new-password" minlength="8" required></div>
            <div class="login-error" id="invite-error" role="alert" aria-live="polite"></div>
            <button class="button primary login-submit" type="submit"><span>Activate account</span>${icon('arrow')}</button>
          </form>
        `:`
          <h2>Welcome back.</h2>
          <p>Sign in with your approved LFG workspace account.</p>
          <form class="login-form" id="crm-login" novalidate>
            <div class="field"><label for="login-email">Email</label><input id="login-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" required></div>
            <div class="field"><label for="login-password">Password</label><input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required></div>
            <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>
            <button class="button primary login-submit" type="submit"><span>Enter workspace</span>${icon('arrow')}</button>
            <div class="login-prototype-note">Access is invite-only. Ask an LFG Admin for a secure invitation link.</div>
          </form>
        `}

        <form class="login-form hidden" id="crm-bootstrap" novalidate>
          <div class="duplicate-banner neutral"><span>•</span><span>This is the first LFG account. Enter the one-time workspace bootstrap code to claim the initial admin role.</span></div>
          <div class="field"><label for="bootstrap-code">One-time bootstrap code</label><input id="bootstrap-code" type="password" autocomplete="off" required></div>
          <div class="login-error" id="bootstrap-error" role="alert" aria-live="polite"></div>
          <button class="button primary login-submit" type="submit"><span>Activate first admin</span>${icon('shield')}</button>
          <button class="mini-action" id="bootstrap-back-login" type="button">Back to sign in</button>
        </form>
      </div>
    </section>
  </main>`;
};
