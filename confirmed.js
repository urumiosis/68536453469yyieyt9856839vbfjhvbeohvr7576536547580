/* Public email-confirmation callback. Does not load any private app assets. */
(async () => {
  'use strict';

  const title = document.getElementById('confirmation-title');
  const message = document.getElementById('confirmation-message');
  const login = document.getElementById('confirmation-login');
  if (!title || !message || !login) return;

  const show = (heading, description) => {
    title.textContent = heading;
    message.textContent = description;
    login.hidden = false;
  };

  // Supabase returns link errors in query parameters or URL fragments.
  const query = new URLSearchParams(window.location.search);
  const fragment = new URLSearchParams(window.location.hash.slice(1));
  if (query.has('error') || query.has('error_code') ||
      fragment.has('error') || fragment.has('error_code')) {
    show('Länken kunde inte bekräftas.',
      'Länken kan ha gått ut. Försök logga in eller använd ett nytt bekräftelsemejl.');
    return;
  }

  if (!window.supabase?.createClient) {
    show('Kunde inte kontrollera bekräftelsen.',
      'Försök logga in. Om kontot inte är bekräftat kan du använda ett nytt bekräftelsemejl.');
    return;
  }

  try {
    // The JS client handles the implicit confirmation callback from the URL.
    // The session is never saved, so a separate login is always required.
    const supabase = window.supabase.createClient(
      'https://eqwlikflvpyghkvhsxmz.supabase.co',
      'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp',
      { auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: true
      } }
    );
    const { data, error } = await supabase.auth.getUser();
    if (!error && data?.user?.email_confirmed_at) {
      show('Din mejl är bekräftad!',
        'Ditt konto är klart. Nu kan du logga in med din skolmejl och ditt lösenord.');
      return;
    }
  } catch {
    // Confirmation may have succeeded before the browser lost its callback.
  }

  show('Kunde inte kontrollera bekräftelsen.',
    'Prova att logga in. Om din mejl inte är bekräftad, öppna ditt senaste bekräftelsemejl igen.');
})();
