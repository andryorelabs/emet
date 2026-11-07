import { createHash } from "node:crypto";

import { THEME_CHANGE_EVENT, THEME_STORAGE_KEY } from "./theme-menu";

const LIGHT_COLOR = "#f4fdf6";
const DARK_COLOR = "#0a100b";

/**
 * The blocking head script of every Website page. It applies the stored choice
 * (`light`, `dark`, `system`) before first paint: a `light` or `dark` class and
 * `data-theme` (the resolved scheme, which Expressive Code and Starlight read)
 * on `<html>`, `data-theme-choice` (the stored choice), both `theme-color`
 * metas and the `color-scheme` meta. With `system` it follows the OS live. It
 * re-applies on `THEME_CHANGE_EVENT` and on `storage` from another tab.
 */
export const THEME_INIT_SCRIPT = `(function(){var root=document.documentElement,head=document.head,key=${JSON.stringify(THEME_STORAGE_KEY)},evt=${JSON.stringify(THEME_CHANGE_EVENT)},dark=matchMedia("(prefers-color-scheme: dark)"),light=${JSON.stringify(LIGHT_COLOR)},night=${JSON.stringify(DARK_COLOR)},choice="system";function valid(v){return v==="light"||v==="dark"||v==="system"}function read(){try{var v=localStorage.getItem(key);return valid(v)?v:"system"}catch(e){return"system"}}function meta(name,media){var m=null,all=head.querySelectorAll("meta");for(var i=0;i<all.length;i++){if(all[i].getAttribute("name")===name&&(all[i].getAttribute("media")||"")===(media||"")){m=all[i];break}}if(!m){m=document.createElement("meta");m.setAttribute("name",name);if(media)m.setAttribute("media",media);head.appendChild(m)}return m}function apply(){var resolved=choice==="system"?dark.matches?"dark":"light":choice;root.classList.remove("light","dark");if(choice!=="system")root.classList.add(choice);root.dataset.theme=resolved;root.dataset.themeChoice=choice;var l=meta("theme-color","(prefers-color-scheme: light)"),d=meta("theme-color","(prefers-color-scheme: dark)");if(choice==="system"){l.content=light;d.content=night}else{l.content=d.content=choice==="dark"?night:light}meta("color-scheme").content=choice==="system"?"light dark":choice}dark.addEventListener("change",function(){if(choice==="system")apply()});addEventListener(evt,function(e){choice=valid(e.detail)?e.detail:read();apply()});addEventListener("storage",function(e){if(e.key===key){choice=read();apply()}});choice=read();apply()})();`;

/**
 * CSP hash source of `THEME_INIT_SCRIPT`, computed from the same string the
 * pages inline, for `script-src` in `astro.config.ts`.
 */
export const THEME_INIT_HASH =
  `sha256-${createHash("sha256").update(THEME_INIT_SCRIPT).digest("base64")}` as const;
