/* Anti Markaryd — sign in and verify the owner-signed certificate before loading the private app. */
(() => {
  'use strict';

  const SUPABASE_URL = 'https://eqwlikflvpyghkvhsxmz.supabase.co';
  const SUPABASE_KEY = 'sb_publishable_eGjEo-jwcsyFEJLCyfoPJw_mtXXO9Rp';
  const MAX_CERTIFICATE_BYTES = 4096;
  const DEVICE_KEY_ALGORITHM = { name: 'ECDSA', namedCurve: 'P-256' };
  const DEVICE_SIGN_ALGORITHM = { name: 'ECDSA', hash: 'SHA-256' };

  const loginScreen = document.getElementById('login-screen');
  const banScreen = document.getElementById('ban-screen');
  const banDescription = document.getElementById('ban-description');
  const dashboardScreen = document.getElementById('dashboard-screen');
  const loginForm = document.getElementById('login-form');
  const loginBtn = document.getElementById('login-btn');
  const loginError = document.getElementById('login-error');
  const userEmailEl = document.getElementById('user-email');
  const logoutBtn = document.getElementById('logout-btn');
  const certFileInput = document.getElementById('cert-file');
  const certStatus = document.getElementById('cert-status');
  const certPreview = document.getElementById('certificate-preview');
  const certPreviewText = document.getElementById('certificate-preview-text');
  const firstTimeCertificate = document.getElementById('first-time-certificate');
  const issueFirstCertificateBtn = document.getElementById('issue-first-certificate');
  const lockedSite = document.getElementById('locked-site');
  const certificateIssuance = document.getElementById('certificate-issuance');
  const autoCertificateStatus = document.getElementById('auto-certificate-status');
  const downloadCertificate = document.getElementById('download-certificate');
  const readCertificate = document.getElementById('read-certificate');
  const certificateText = document.getElementById('certificate-text');

  let supabase = null;
  let activeUserId = null;
  let loginGeneration = 0;
  let privateAppStarted = false;
  let certificateDownloadUrl = null;

  function showLogin() {
    if (document.body.classList.contains('permanently-banned')) return;
    if (loginScreen) loginScreen.classList.add('active');
    if (dashboardScreen) {
      dashboardScreen.classList.remove('active');
      dashboardScreen.hidden = true;
      dashboardScreen.setAttribute('aria-hidden', 'true');
    }
  }

  function showPermanentBan(code) {
    if (!banScreen || !banDescription) return;
    if (document.body.classList.contains('permanently-banned')) return;
    banDescription.textContent = code === 'device_permanently_banned'
      ? 'Den här Chrome-profilens åtkomst till webbplatsen är permanent spärrad.'
      : 'Ditt konto har permanent spärrats från webbplatsen.';
    lockedSite.hidden = true;
    loginScreen.classList.remove('active');
    dashboardScreen.hidden = true;
    dashboardScreen.classList.remove('active');
    certFileInput.disabled = true;
    issueFirstCertificateBtn.disabled = true;
    privateAppStarted = false;
    loginGeneration++;
    banScreen.hidden = false;
    document.body.classList.add('permanently-banned');
    document.title = 'Åtkomst nekad · Anti Markaryd';
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
    if (document.body.classList.contains('permanently-banned')) return;
    if (activeUserId === user.id) return;
    activeUserId = user.id;
    loginGeneration++;
    loginScreen.classList.remove('active');
    userEmailEl.textContent = user.email || user.id;
    dashboardScreen.hidden = false;
    dashboardScreen.setAttribute('aria-hidden', 'false');
    dashboardScreen.classList.add('active');

    // Every login starts locked, regardless of the previous session.
    privateAppStarted = false;
    lockedSite.hidden = true;
    certFileInput.disabled = false;
    certFileInput.value = '';
    certStatus.hidden = true;
    certPreview.hidden = true;
    certPreview.open = false;
    certPreviewText.textContent = '';
    firstTimeCertificate.hidden = true;
    issueFirstCertificateBtn.disabled = false;
    certificateIssuance.hidden = true;
    autoCertificateStatus.textContent = '';
    downloadCertificate.hidden = true;
    readCertificate.hidden = true;
    certificateText.textContent = '';
    if (certificateDownloadUrl) URL.revokeObjectURL(certificateDownloadUrl);
    certificateDownloadUrl = null;

    // The status request never issues a certificate. Existing users only
    // see the upload control; first-time users may explicitly issue once.
    void checkFirstCertificateStatus(user.id, loginGeneration);
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

  function encodeBase64Url(bytes) {
    return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  }

  function openDeviceStorage() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open('anti-markaryd-device', 1);
      request.onupgradeneeded = () => request.result.createObjectStore('keys');
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  function getDeviceKey(db, userId, candidate) {
    return new Promise((resolve, reject) => {
      const transaction = db.transaction('keys', candidate ? 'readwrite' : 'readonly');
      const store = transaction.objectStore('keys');
      const request = store.get(userId);
      let key;
      request.onsuccess = () => {
        key = request.result ?? candidate;
        if (!request.result && candidate) store.add(candidate, userId);
      };
      transaction.oncomplete = () => resolve(key);
      transaction.onabort = () => reject(transaction.error);
    });
  }

  async function loadDevice(userId) {
    try {
      const db = await openDeviceStorage();
      let key;
      try {
        key = await getDeviceKey(db, userId);
        if (!key) {
          const candidate = await crypto.subtle.generateKey(DEVICE_KEY_ALGORITHM, false, ['sign', 'verify']);
          key = await getDeviceKey(db, userId, candidate);
        }
      } finally {
        db.close();
      }
      const publicKey = new Uint8Array(await crypto.subtle.exportKey('raw', key.publicKey));
      const fingerprint = await crypto.subtle.digest('SHA-256', publicKey);
      return { privateKey: key.privateKey, publicKey: encodeBase64Url(publicKey), id: encodeBase64Url(new Uint8Array(fingerprint)) };
    } catch {
      throw new Error('Enhetsnyckeln kunde inte sparas eller läsas. Använd din vanliga Chrome-profil.');
    }
  }

  async function requestCertificateIssuance(session, body) {
    const response = await fetch(SUPABASE_URL + '/functions/v1/issue-license', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 401) throw new Error('Logga in igen.');
    if (response.status === 403) {
      const { code } = await response.json().catch(() => ({}));
      if (code === 'account_permanently_banned' ||
          code === 'device_permanently_banned') {
        showPermanentBan(code);
        throw new Error('Åtkomst nekad.');
      }
      throw new Error('Skolmejlen måste vara verifierad, eller logga in med det befintliga administratörskontot.');
    }
    if (response.status === 409) {
      const detail = await response.json().catch(() => ({}));
      if (detail.code === 'certificate_already_issued') {
        const err = new Error('Ditt certifikat är redan utfärdat. Ladda upp din sparade fil eller kontakta administratören.');
        err.alreadyIssued = true;
        throw err;
      }
      throw new Error('Kontot är redan kopplat till en annan Chrome-profil. Kontakta administratören.');
    }
    if (!response.ok) throw new Error('Certifikattjänsten är inte klar eller är tillfälligt otillgänglig.');
    return response.json();
  }

  async function checkFirstCertificateStatus(userId, generation) {
    firstTimeCertificate.hidden = true;
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || !session || session.user.id !== userId) return;
      const device = await loadDevice(userId);
      if (generation !== loginGeneration || activeUserId !== userId) return;
      const status = await requestCertificateIssuance(session, {
        action: 'status', deviceKey: device.publicKey
      });
      if (generation !== loginGeneration || activeUserId !== userId) return;
      // Unknown server response means no issuance option (fail closed).
      firstTimeCertificate.hidden = status?.issued !== false;
    } catch (error) {
      if (generation !== loginGeneration || activeUserId !== userId) return;
      certStatus.hidden = false;
      certStatus.className = 'cert-status bad';
      const reason = String(error?.message || '');
      certStatus.textContent = reason.includes('permanent avstängd')
        ? reason
        : 'Kunde inte kontrollera certifikatstatus. Ladda upp din sparade fil eller försök igen senare.';
    }
  }

  async function issueStudentCertificate(userId, generation) {
    if (firstTimeCertificate.hidden || !activeUserId || privateAppStarted) return;
    issueFirstCertificateBtn.disabled = true;
    certificateIssuance.hidden = false;
    autoCertificateStatus.textContent = 'Skapar ditt första certifikat…';
    try {
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || !session || session.user.id !== userId) throw new Error('Logga in igen.');
      const device = await loadDevice(userId);
      if (generation !== loginGeneration) return;

      const { challenge } = await requestCertificateIssuance(session, {
        action: 'start', deviceKey: device.publicKey
      });
      if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
        throw new Error('Verifieringen misslyckades.');
      }
      const proofText = ['anti-markaryd-enrollment-v1', userId, challenge, device.publicKey].join('\n');
      const signedProof = new Uint8Array(await crypto.subtle.sign(
        DEVICE_SIGN_ALGORITHM, device.privateKey, new TextEncoder().encode(proofText)
      ));
      if (generation !== loginGeneration) return;

      const { certificate } = await requestCertificateIssuance(session, {
        action: 'finish', deviceKey: device.publicKey,
        challenge, signature: encodeBase64Url(signedProof)
      });
      if (generation !== loginGeneration) return;
      if (typeof certificate !== 'string' || new TextEncoder().encode(certificate).length > MAX_CERTIFICATE_BYTES) {
        throw new Error('Certifikattjänsten svarade med ett ogiltigt format.');
      }
      const parsed = JSON.parse(certificate);
      if (parsed.format !== 'am3' || !parsed.claims?.license || !parsed.signature ||
          parsed.claims.sub !== userId || parsed.claims.device !== device.id) {
        throw new Error('Certifikatet innehåller inte rätt uppgifter.');
      }
      certificateDownloadUrl = URL.createObjectURL(new Blob([certificate], {
        type: 'text/plain;charset=utf-8'
      }));
      downloadCertificate.href = certificateDownloadUrl;
      downloadCertificate.hidden = false;
      certificateText.textContent = certificate;
      readCertificate.hidden = false;
      firstTimeCertificate.hidden = true;
      autoCertificateStatus.textContent = 'Certifikatet är klart. Ladda ned och spara filen. Du behöver den vid varje inloggning.';
    } catch (error) {
      if (generation !== loginGeneration) return;
      if (error.alreadyIssued) firstTimeCertificate.hidden = true;
      autoCertificateStatus.textContent = error.message || 'Certifikatet kunde inte skapas.';
    } finally {
      if (generation === loginGeneration) issueFirstCertificateBtn.disabled = false;
    }
  }

  async function requestLicenseVerification(session, body) {
    const response = await fetch(SUPABASE_URL + '/functions/v1/verify-license', {
      method: 'POST',
      cache: 'no-store',
      headers: {
        apikey: SUPABASE_KEY,
        Authorization: 'Bearer ' + session.access_token,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(body)
    });
    if (response.status === 401) throw new Error('Logga in igen.');
    if (response.status === 403) {
      const { code } = await response.json().catch(() => ({}));
      if (code === 'account_permanently_banned' ||
          code === 'device_permanently_banned') {
        showPermanentBan(code);
        throw new Error('Åtkomst nekad.');
      }
      throw new Error('Ogiltigt certifikat.');
    }
    if (response.status === 409) {
      const { code } = await response.json().catch(() => ({}));
      if (code === 'device_mismatch') {
        throw new Error('Certifikatet tillhör en annan Chrome-profil. Kontakta administratören om du har bytt profil.');
      }
      throw new Error('Enheten kunde inte verifieras. Ladda upp certifikatet igen.');
    }
    if (!response.ok) throw new Error('Certifikatet kunde inte verifieras just nu. Försök igen.');
    return response;
  }

  async function verifyUploadedCertificate(certificateOverride = null) {
    const file = typeof certificateOverride === 'string' ? null : certFileInput.files?.[0];
    if ((!file && typeof certificateOverride !== 'string') || !activeUserId || privateAppStarted) return;
    const userId = activeUserId;
    const generation = loginGeneration;
    certFileInput.disabled = true;
    certStatus.hidden = false;
    certStatus.className = 'cert-status';
    certStatus.textContent = 'Verifierar certifikatet…';

    try {
      if (file && file.size > MAX_CERTIFICATE_BYTES) throw new Error('Ogiltigt certifikat.');
      const { data, error } = await supabase.auth.getSession();
      const session = data?.session;
      if (error || session?.user?.id !== userId) throw new Error('Logga in igen.');
      const certificate = (certificateOverride ?? await file.text()).trim();
      try {
        const parsed = JSON.parse(certificate);
        certPreviewText.textContent = JSON.stringify(parsed, null, 2);
        certPreview.hidden = false;
      } catch {
        certPreview.hidden = true;
      }
      if (new TextEncoder().encode(certificate).byteLength > MAX_CERTIFICATE_BYTES) {
        throw new Error('Ogiltigt certifikat.');
      }
      const device = await loadDevice(userId);
      if (loginGeneration !== generation) return;
      const start = await requestLicenseVerification(session, { action: 'start', certificate, deviceKey: device.publicKey });
      const { challenge } = await start.json();
      if (typeof challenge !== 'string' || !/^[A-Za-z0-9_-]{43}$/.test(challenge)) {
        throw new Error('Enheten kunde inte verifieras. Försök igen.');
      }
      const proof = new TextEncoder().encode(`anti-markaryd-device-v1\n${userId}\n${challenge}\n${certificate}`);
      const signature = new Uint8Array(await crypto.subtle.sign(DEVICE_SIGN_ALGORITHM, device.privateKey, proof));
      if (loginGeneration !== generation) return;
      const response = await requestLicenseVerification(session, {
        action: 'finish', certificate, deviceKey: device.publicKey, challenge, signature: encodeBase64Url(signature)
      });
      const receivedAt = performance.now();
      const app = await response.json();
      if (loginGeneration !== generation) return;
      if (typeof app.code !== 'string' || !Number.isSafeInteger(app.expiresInMs) ||
          app.expiresInMs <= performance.now() - receivedAt) {
        throw new Error('Appen kunde inte laddas. Försök igen.');
      }

      if (!app.content || !Array.isArray(app.games) ||
          typeof app.html !== 'string' || !app.html ||
          typeof app.css !== 'string' || !app.css ||
          typeof app.code !== 'string' || !app.code) {
        throw new Error('Appens privata innehåll saknas.');
      }

      // None of these assets appears in the GitHub Pages HTML or CSS.
      // The Edge Function returns them only after successful signed
      // certificate verification and browser-profile key proof.
      const style = document.createElement('style');
      style.id = 'private-app-styles';
      style.textContent = app.css;
      document.getElementById('private-app-styles')?.remove();
      document.head.appendChild(style);
      lockedSite.innerHTML = app.html;
      const initPrivateApp = new Function(app.code + '\n; return initPrivateApp;')();
      await initPrivateApp(session.user, app);
      privateAppStarted = true;
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

  // UI compatibility gate, not a hardware attestation. Browser platform strings can be spoofed.
  function isChromeOSBrowser() {
    const platform = navigator.userAgentData?.platform;
    if (typeof platform === 'string' && platform) {
      return platform === 'Chrome OS' || platform === 'ChromeOS';
    }
    return /\bCrOS\b/.test(navigator.userAgent || '');
  }

  function init() {
    if (!isChromeOSBrowser()) {
      const blockedScreen = document.getElementById('chromebook-only-screen');
      loginScreen.classList.remove('active');
      if (blockedScreen) {
        blockedScreen.hidden = false;
        blockedScreen.classList.add('active');
      }
      return;
    }
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
        setBusy(true, 'Loggar in…');

        const email =
          document.getElementById('email')?.value.trim() || '';

        const password =
          document.getElementById('password')?.value || '';

        if (!email || !password) {
          showLoginError('Fyll i både e-post och lösenord.');
          setBusy(false, 'Logga in');
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
          setBusy(false, 'Logga in');
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

    issueFirstCertificateBtn.addEventListener('click', () => {
      if (activeUserId && !issueFirstCertificateBtn.disabled) {
        void issueStudentCertificate(activeUserId, loginGeneration);
      }
    });
    certFileInput.addEventListener('change', () => verifyUploadedCertificate());

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
