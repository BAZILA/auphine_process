// Appliqué avant l'affichage pour éviter un flash de thème.
(function () {
  try {
    var theme = localStorage.getItem('auphine.theme');
    if (theme === 'light' || theme === 'dark') document.documentElement.dataset.theme = theme;
  } catch (e) { /* stockage indisponible : thème automatique */ }
})();
