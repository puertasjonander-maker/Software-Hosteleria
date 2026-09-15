const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/arranque-CrGmCxpw.js","assets/arranque-CcBc5w5V.css"])))=>i.map(i=>d[i]);
(function(){const s=document.createElement("link").relList;if(s&&s.supports&&s.supports("modulepreload"))return;for(const e of document.querySelectorAll('link[rel="modulepreload"]'))d(e);new MutationObserver(e=>{for(const n of e)if(n.type==="childList")for(const t of n.addedNodes)t.tagName==="LINK"&&t.rel==="modulepreload"&&d(t)}).observe(document,{childList:!0,subtree:!0});function o(e){const n={};return e.integrity&&(n.integrity=e.integrity),e.referrerPolicy&&(n.referrerPolicy=e.referrerPolicy),e.crossOrigin==="use-credentials"?n.credentials="include":e.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function d(e){if(e.ep)return;e.ep=!0;const n=o(e);fetch(e.href,n)}})();const h="modulepreload",b=function(r){return"/"+r},f={},v=function(s,o,d){let e=Promise.resolve();if(o&&o.length>0){document.getElementsByTagName("link");const t=document.querySelector("meta[property=csp-nonce]"),i=(t==null?void 0:t.nonce)||(t==null?void 0:t.getAttribute("nonce"));e=Promise.allSettled(o.map(a=>{if(a=b(a),a in f)return;f[a]=!0;const u=a.endsWith(".css"),m=u?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${a}"]${m}`))return;const c=document.createElement("link");if(c.rel=u?"stylesheet":h,u||(c.as="script"),c.crossOrigin="",c.href=a,i&&c.setAttribute("nonce",i),document.head.appendChild(c),u)return new Promise((g,y)=>{c.addEventListener("load",g),c.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${a}`)))})}))}function n(t){const i=new Event("vite:preloadError",{cancelable:!0});if(i.payload=t,window.dispatchEvent(i),!i.defaultPrevented)throw t}return e.then(t=>{for(const i of t||[])i.status==="rejected"&&n(i.reason);return s().catch(n)})};let l=null;function w(){if(!l)throw new Error("La configuración se pide antes de cargarla");return l}function p(r){return!(!r||typeof r.supabaseUrl!="string"||!r.supabaseUrl.startsWith("https://")||typeof r.supabaseAnonKey!="string"||r.supabaseAnonKey.length<20)}async function E(){try{const s=await fetch("/config.json",{cache:"no-store"});if(s.ok){const o=await s.json();if(p(o))return l={...o,vapidPublicKey:o.vapidPublicKey??""},l}}catch{}const r={supabaseUrl:void 0,supabaseAnonKey:void 0,vapidPublicKey:""};return p(r)?(l=r,l):null}(async()=>await E()?await v(()=>import("./arranque-CrGmCxpw.js").then(r=>r.a),__vite__mapDeps([0,1])):P())();function P(){const r=document.getElementById("raiz");r&&(r.innerHTML=`
    <main style="
      font: 16px/1.5 system-ui, -apple-system, 'Segoe UI', sans-serif;
      color: #1a1614; background: #faf7f2;
      min-height: 100dvh; display: flex; align-items: center; justify-content: center;
      padding: 2rem; margin: 0;
    ">
      <div style="max-width: 30rem">
        <h1 style="font-size: 1.25rem; margin: 0 0 .75rem">Falta configurar Ergobox</h1>
        <p style="margin: 0 0 1rem">
          La aplicación está publicada, pero no sabe a qué base de datos conectarse.
        </p>
        <p style="margin: 0 0 .5rem">
          Junto a <code>index.html</code>, en el servidor, tiene que haber un fichero
          llamado <strong>config.json</strong> con esto dentro:
        </p>
        <pre style="
          background: #fff; border: 1px solid #e6ded2; border-radius: .5rem;
          padding: .75rem; overflow-x: auto; font-size: .875rem; margin: 0 0 1rem
        ">{
  "supabaseUrl": "https://xxxx.supabase.co",
  "supabaseAnonKey": "eyJhbGciOi...",
  "vapidPublicKey": ""
}</pre>
        <p style="margin: 0; color: #6b625a; font-size: .875rem">
          Los dos primeros valores salen del panel de Supabase, en
          Project Settings → API. El tercero puede quedarse vacío: solo hace falta
          para los avisos de revisión.
        </p>
      </div>
    </main>
  `)}export{v as _,w as c};
