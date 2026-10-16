/* Anti Markaryd — GitHub Pages login/bootstrap only.
 * The post-login application code is fetched from the RLS-protected
 * public.private_app_code table after authentication.
 */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://eqwlikflvpyghkvhsxmz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp';
  const PRIVATE_CODE_ROW_ID = 1;

  const loginScreen = document.getElementById('login-screen');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');

  let supabase = null;
  let privateAppLoaded = false;

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

  async function loadPrivateApp(user) {
    if (!supabase || !user || privateAppLoaded) return;

    const { data: sessionData, error: sessionError } =
      await supabase.auth.getSession();

    const sessionUser = sessionData?.session?.user;

    if (
      sessionError ||
      !sessionUser ||
      sessionUser.id !== user.id
    ) {
      throw new Error(
        'Din inloggning kunde inte verifieras. Logga in igen.'
      );
    }

    // RLS on private_app_code allows SELECT only to authenticated users.
    const { data, error } = await supabase
      .from('private_app_code')
      .select('code')
      .eq('id', PRIVATE_CODE_ROW_ID)
      .single();

    if (error) {
      throw new Error(
        'Kunde inte hämta appen från Supabase: ' + error.message
      );
    }

    if (!data?.code) {
      throw new Error(
        'Appkoden saknas i Supabase-tabellen private_app_code.'
      );
    }

    // The row is maintained by the site owner. It is not user-generated input.
    const factory = new Function(
      data.code + '\n; return initPrivateApp;'
    );

    const initPrivateApp = factory();

    if (typeof initPrivateApp !== 'function') {
      throw new Error(
        'Supabase-koden saknar initPrivateApp-funktionen.'
      );
    }

    await initPrivateApp(supabase, user);
    privateAppLoaded = true;
  }

  async function handleAuthenticatedUser(user) {
    if (!user) {
      privateAppLoaded = false;
      showLogin();
      return;
    }

    try {
      if (userEmailEl) {
        userEmailEl.textContent = user.email || user.id;
      }

      await loadPrivateApp(user);
    } catch (error) {
      console.error(error);
      showLogin();
      showLoginError(error.message || 'Kunde inte ladda appen.');
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

          await handleAuthenticatedUser(data.user);
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

    supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_OUT') {
        privateAppLoaded = false;
        showLogin();
      }
    });

    supabase.auth.getSession()
      .then(({ data, error }) => {
        if (error) {
          showLogin();
          return;
        }

        if (data.session?.user) {
          handleAuthenticatedUser(data.session.user);
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
