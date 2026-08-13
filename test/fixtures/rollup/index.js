const el = document.createElement('div');
el.textContent = 'hello';
document.body.appendChild(el);
el.addEventListener('click', async () => {
  const { lazy } = await import('./lazy-DZpl1WSD.js');
  el.textContent = lazy();
});
