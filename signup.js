/* Registration is a separate page. Server-side Auth Hook validates student eligibility. */
(() => {
  'use strict';
  const form = document.getElementById('signup-form');
  const button = document.getElementById('signup-btn');
  const feedback = document.getElementById('signup-feedback');
  if (!form || !button || !feedback) return;

  const show = (message, kind = '') => {
    feedback.hidden = false;
    feedback.className = 'cert-status' + (kind ? ' ' + kind : '');
    feedback.textContent = message;
  };

  if (!window.supabase?.createClient) {
    show('Registreringen kunde inte öppnas. Ladda om sidan och försök igen.', 'bad');
    button.disabled = true;
    return;
  }

  const supabase = window.supabase.createClient(
    'https://eqwlikflvpyghkvhsxmz.supabase.co',
    'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp',
    { auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false } }
  );

  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (button.disabled) return;
    const email = document.getElementById('signup-email').value.trim().toLowerCase();
    const password = document.getElementById('signup-password').value;
    button.disabled = true;
    show('Skapar ditt konto…');
    try {
      if (password.length < 12) throw new Error('Välj ett lösenord med minst 12 tecken.');
      const { error } = await supabase.auth.signUp({
        email, password,
        options: { emailRedirectTo: new URL('./', location.href).href }
      });
      if (error) throw error;
      form.reset();
      show('Kontrollera din skolmejl och bekräfta adressen. Gå sedan till inloggningen.', 'ok');
    } catch (error) {
      const message = String(error?.message || '').toLowerCase();
      let notice = 'Registreringen kunde inte slutföras. Försök igen.';
      if (message.includes('tillfälligt stängd') ||
          message.includes('signups not allowed') ||
          error?.code === 'signup_disabled') {
        notice = 'Registreringen är tillfälligt stängd.';
      } else if (message.includes('skolmejl') ||
                 message.includes('e0000') ||
                 message.includes('e9999') ||
                 message.includes('not allowed')) {
        notice = 'Använd din skolmejl för att skapa konto.';
      } else if (message.includes('minst 12 tecken')) {
        notice = 'Välj ett lösenord med minst 12 tecken.';
      }
      show(notice, 'bad');
    } finally {
      button.disabled = false;
    }
  });
})();
