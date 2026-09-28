// What are we running on? The same game adapts: phones get tilt and touch
// controls, Macs and other computers get keyboard (or gamepad, or a phone
// used as a wheel), a UI scaled for a big screen and the Max graphics tier.

const nav = typeof navigator !== 'undefined' ? navigator : {};
const ua = nav.userAgent || '';
const mm = (q) => typeof matchMedia === 'function' && matchMedia(q).matches;

// iPadOS reports itself as a Mac, but has a touch screen.
export const isIOS = /iPhone|iPad|iPod/.test(ua) || (nav.platform === 'MacIntel' && nav.maxTouchPoints > 1);
export const isTouch = mm('(pointer: coarse)') || isIOS;
export const isMac = !isIOS && (/Mac/.test(nav.platform || '') || /Macintosh/.test(ua));
export const isDesktop = !isTouch;
export const platformName = isMac ? 'Mac' : isDesktop ? 'computer' : isIOS ? 'iPhone' : 'phone';

// Ask WebGL which GPU we have (Chrome says "Apple M3", Safari just "Apple GPU").
export function gpuName(gl) {
  try {
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    return String(ext ? gl.getParameter(ext.UNMASKED_RENDERER_WEBGL) : gl.getParameter(gl.RENDERER));
  } catch (e) {
    return '';
  }
}
