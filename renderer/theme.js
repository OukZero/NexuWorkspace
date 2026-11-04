// Tema día/noche/sistema + perfil. Se carga en <head> para aplicar el tema antes del primer pintado.
(function () {
  const mq = matchMedia('(prefers-color-scheme: light)');
  const read = (k, d) => { try { return localStorage.getItem(k) || d; } catch { return d; } };
  const write = (k, v) => { try { localStorage.setItem(k, v); } catch { /* sin storage */ } };
  const apply = () => {
    const m = read('theme', 'system');
    document.documentElement.dataset.theme = m === 'system' ? (mq.matches ? 'light' : 'dark') : m;
  };
  window.Theme = {
    mode: () => read('theme', 'system'),
    set(m) { write('theme', m); apply(); },
    name: () => read('userName', ''),
    setName(n) { write('userName', n); },
  };
  mq.addEventListener('change', apply);
  addEventListener('storage', apply); // sincroniza la ventana mini
  apply();
})();
