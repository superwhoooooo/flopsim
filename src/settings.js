// Player settings that must be known before the world is built.
// Graphics style: 'classic' (the original look, default) or 'realistic' (detailed facades with glass reflections,
// sky reflections, ambient occlusion, haze, fuller trees). Switching reloads the page so the city is rebuilt in that style.
const KEY = 'flopsim-graphics';
export const REALISTIC = (() => { try { return localStorage.getItem(KEY) === 'realistic'; } catch (e) { return false; } })();
export function setRealistic(on) { try { localStorage.setItem(KEY, on ? 'realistic' : 'classic'); } catch (e) { /* private mode: stays classic */ } }
