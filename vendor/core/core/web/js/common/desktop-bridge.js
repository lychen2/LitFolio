// Only same-origin pages inside our tab shell inherit the main-frame bridge.
(() => {
  if (window.coreDesktop || window.parent === window) return;
  try {
    const host = window.parent;
    if (host.location.origin !== location.origin || !host.coreTabs || !host.coreDesktop) return;
    window.coreDesktop = Object.fromEntries(
      Object.entries(host.coreDesktop).filter(([key]) => key !== 'onBeforeQuit')
    );
  } catch (_) { /* External frames receive no desktop capabilities. */ }
})();
