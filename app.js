/* Anti Markaryd — sign in and verify the owner-signed certificate before loading the private app. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://eqwlikflvpyghkvhsxmz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp';
  const MAX_CERTIFICATE_BYTES = 4096;

  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const certFileInput = document.getElementById('cert-file');
  const certStatus = document.getElementById('cert-status');
  const lockedSite = document.getElementById('locked-site');

  let supabase = null;
  let activeUserId = null;
  let loginGeneration = 0;
  let privateAppStarted = false;

  function showLogin() {
    if (loginScreen) loginScreen.classList.add('active');
    if (dashboardScreen) {
      dashboardScreen.classList.remove('active');
      dashboardScreen.hidden = true;
      dashboardScreen.setAttribute('aria-hidden', 'true');
    }
  }

  function showLoginError(message) {
    if (!loginError) return;
    loginError.textContent = message;
    loginError.hidden = false;
  }

  function setBusy(busy, label) {
    if (!loginBtn) return;
    loginBtn.disabled = busy;
    const span = loginBtn.querySelector('span');
    if (span) span.textContent = label;
  }

  function showCertificateGate(user) {
    if (activeUserId === user.id) return;
    activeUserId = user.id;
    loginGeneration++;
    loginScreen.classList.remove('active');
    userEmailEl.textContent = user.email || user.id;
    dashboardScreen.hidden = false;
    dashboardScreen.setAttribute('aria-hidden', 'false');
    dashboardScreen.classList.add('active');
    certFileInput.disabled = false;
    certStatus.hidden = true;
  }

  function expireAppAt(deadline) {
    const remaining = deadline - performance.now();
    if (remaining <= 0) {
      lockedSite.hidden = true;
      window.location.reload();
      return;
    }
    window.setTimeout(() => expireAppAt(deadline), Math.min(remaining, 2_147_483_647));
  }

  async function verifyUploadedCertificate() {
    const file = certFileInput.files?.[0];
    if (!file || !activeUserId || privateAppStarted) return;
    const userId = activeUserId;
    const generation = loginGeneration;
    certFileInput.disabled = true;
    certStatus.hidden = false;
    certStatus.className = 'cert-status';
    certStatus.textContent = 'Verifierar certifikatet…';

    try {
      if (file.size > MAX_CERTIFICATE_BYTES) throw new Error('Ogiltigt certifikat.');
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || session?.user?.id !== userId) throw new Error('Logga in igen.');
      const certificate = await file.text();
      if (loginGeneration !== generation) return;
      const response = await fetch(SUPABASE_URL + '/functions/v1/verify-license', {
        method: 'POST',
        cache: 'no-store',
        headers: {
          apikey: SUPABASE_KEY,
          Authorization: 'Bearer ' + session.access_token,
          'Content-Type': 'text/plain;charset=UTF-8'
        },
        body: certificate
      });
      if (response.status === 401) throw new Error('Logga in igen.');
      if (response.status === 403) throw new Error('Certifikatet är ogiltigt eller har gått ut.');
      if (!response.ok) throw new Error('Certifikatet kunde inte verifieras just nu. Försök igen.');
      const receivedAt = performance.now();
      const app = await response.json();
      if (loginGeneration !== generation) return;
      if (typeof app.code !== 'string' || !Number.isSafeInteger(app.expiresInMs) ||
          app.expiresInMs <= performance.now() - receivedAt) {
        throw new Error('Appen kunde inte laddas. Försök igen.');
      }

      if (!app.content || !Array.isArray(app.games)) throw new Error('Appens innehåll saknas.');
      const initPrivateApp = new Function(app.code + '\n; return initPrivateApp;')();
      privateAppStarted = true;
      initPrivateApp(session.user, app);
      expireAppAt(receivedAt + app.expiresInMs);
    } catch (error) {
      if (loginGeneration !== generation) return;
      certStatus.className = 'cert-status bad';
      certStatus.textContent = privateAppStarted
        ? 'Appen kunde inte startas. Ladda om sidan och försök igen.'
        : error.message || 'Certifikatet kunde inte verifieras. Försök igen.';
    } finally {
      if (loginGeneration === generation) {
        certFileInput.value = '';
        certFileInput.disabled = privateAppStarted;
      }
    }
  }

  function init() {
    if (!window.supabase?.createClient) {
      showLoginError(
        'Kunde inte ladda Supabase. Kontrollera nätverket och CDN.'
      );
      return;
    }

    supabase = window.supabase.createClient(
      SUPABASE_URL,
      SUPABASE_KEY,
      {
        auth: {
          persistSession: true,
          autoRefreshToken: true,
          detectSessionInUrl: false
        }
      }
    );

    if (loginForm) {
      loginForm.addEventListener('submit', async (event) => {
        event.preventDefault();

        if (loginError) loginError.hidden = true;
        setBusy(true, 'LOGGAR IN...');

        const email =
          document.getElementById('email')?.value.trim() || '';

        const password =
          document.getElementById('password')?.value || '';

        if (!email || !password) {
          showLoginError('Fyll i både e-post och lösenord.');
          setBusy(false, 'LOGGA IN');
          return;
        }

        try {
          const { data, error } =
            await supabase.auth.signInWithPassword({
              email,
              password
            });

          if (error) {
            showLoginError(
              error.message === 'Invalid login credentials'
                ? 'Felaktig e-post eller lösenord.'
                : 'Inloggning misslyckades: ' + error.message
            );
            return;
          }

          if (data.user) showCertificateGate(data.user);
        } catch (error) {
          showLoginError(
            error.message || 'Nätverksfel vid inloggning.'
          );
        } finally {
          setBusy(false, 'LOGGA IN');
        }
      });
    }

    if (logoutBtn) {
      logoutBtn.addEventListener('click', async () => {
        try {
          await supabase.auth.signOut();
        } finally {
          window.location.reload();
        }
      });
    }

    certFileInput.addEventListener('change', verifyUploadedCertificate);

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        activeUserId = null;
        loginGeneration++;
        lockedSite.hidden = true;
        showLogin();
        if (privateAppStarted) window.location.reload();
      } else if (session?.user && activeUserId && session.user.id !== activeUserId) {
        loginGeneration++;
        lockedSite.hidden = true;
        showLogin();
        window.location.reload();
      }
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          showLogin();
          return;
        }

        if (data.session?.user) {
          showCertificateGate(data.session.user);
        } else {
          showLogin();
        }
      })
      .catch((error) => {
        console.error(error);
        showLogin();
      });
  }

  init();
})();
