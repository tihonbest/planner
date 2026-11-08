
/* Применяем тему и цвет до отрисовки страницы, чтобы не было мигания */
try {
  var st = JSON.parse(localStorage.getItem('schedule-settings-v1')), root = document.documentElement;
  if (st) {
    if (st.theme === 'light' || st.theme === 'dark') { root.setAttribute('data-theme', st.theme); root.style.colorScheme = st.theme; }
    if (['blue', 'teal', 'green', 'orange', 'pink', 'purple', 'indigo', 'graphite'].indexOf(st.accent) > -1) root.setAttribute('data-accent', st.accent);
    if (st.compact === true) root.setAttribute('data-compact', '');
  }
} catch (e) {}
