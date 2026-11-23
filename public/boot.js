// Sets the theme before first paint. External so CSP can stay script-src 'self'.
(function () {
  var pref = null;
  try { pref = localStorage.getItem('hrms.theme'); } catch (e) { /* storage may be blocked */ }
  var dark = pref === 'dark' || (pref !== 'light' && window.matchMedia('(prefers-color-scheme: dark)').matches);
  document.documentElement.setAttribute('data-theme', dark ? 'dark' : 'light');
})();
