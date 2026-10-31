const HOST = import.meta.env.VITE_PLAUSIBLE_HOST;

if (HOST) {
  window.plausible = window.plausible || function () { (window.plausible.q = window.plausible.q || []).push(arguments); };
  const script = document.createElement("script");
  script.defer = true;
  script.dataset.domain = location.hostname;
  script.src = `${HOST}/js/script.js`;
  document.head.appendChild(script);
}

export function track(name, props) {
  if (!HOST) return;
  try { window.plausible(name, { props }); } catch { /* never break the page */ }
}

export const lengthBucket = (s) => (s < 10 ? "<10 s" : s < 60 ? "10-60 s" : s < 300 ? "1-5 min" : ">5 min");

export const speedBucket = (r) => (r < 0.5 ? "<0.5" : r < 1 ? "0.5-1" : r < 2 ? "1-2" : r < 5 ? "2-5" : ">5");
