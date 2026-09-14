import { icon } from './icons.js';

export const loginPage = () => `
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
        <h2>Welcome back.</h2>
        <p>Sign in with your approved LFG workspace account.</p>

        <form class="login-form" id="crm-login" novalidate>
          <div class="field">
            <label for="login-email">Email</label>
            <input id="login-email" name="email" type="email" autocomplete="email" placeholder="you@company.com" required>
          </div>
          <div class="field">
            <label for="login-password">Password</label>
            <input id="login-password" name="password" type="password" autocomplete="current-password" placeholder="Enter password" required>
          </div>
          <div class="login-error" id="login-error" role="alert" aria-live="polite"></div>
          <button class="button primary login-submit" type="submit">
            <span>Enter workspace</span>${icon('arrow')}
          </button>
          <button class="mini-action" id="show-signup" type="button">Need an account? Request access</button>
        </form>

        <form class="login-form hidden" id="crm-signup" novalidate>
          <div class="field"><label for="signup-name">Full name</label><input id="signup-name" autocomplete="name" required></div>
          <div class="field"><label for="signup-email">Email</label><input id="signup-email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="signup-password">Password</label><input id="signup-password" type="password" autocomplete="new-password" minlength="8" required></div>
          <div class="login-error" id="signup-error" role="alert" aria-live="polite"></div>
          <button class="button primary login-submit" type="submit"><span>Request access</span>${icon('arrow')}</button>
          <button class="mini-action" id="show-login" type="button">Back to sign in</button>
        </form>

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
