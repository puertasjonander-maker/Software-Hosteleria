const __vite__mapDeps=(i,m=__vite__mapDeps,d=(m.f||(m.f=["assets/arranque-CpXNdOgX.js","assets/arranque-CRXVIdXv.css"])))=>i.map(i=>d[i]);
(function(){const o=document.createElement("link").relList;if(o&&o.supports&&o.supports("modulepreload"))return;for(const r of document.querySelectorAll('link[rel="modulepreload"]'))d(r);new MutationObserver(r=>{for(const n of r)if(n.type==="childList")for(const t of n.addedNodes)t.tagName==="LINK"&&t.rel==="modulepreload"&&d(t)}).observe(document,{childList:!0,subtree:!0});function i(r){const n={};return r.integrity&&(n.integrity=r.integrity),r.referrerPolicy&&(n.referrerPolicy=r.referrerPolicy),r.crossOrigin==="use-credentials"?n.credentials="include":r.crossOrigin==="anonymous"?n.credentials="omit":n.credentials="same-origin",n}function d(r){if(r.ep)return;r.ep=!0;const n=i(r);fetch(r.href,n)}})();const h="modulepreload",b=function(e){return"/"+e},f={},v=function(o,i,d){let r=Promise.resolve();if(i&&i.length>0){document.getElementsByTagName("link");const t=document.querySelector("meta[property=csp-nonce]"),s=(t==null?void 0:t.nonce)||(t==null?void 0:t.getAttribute("nonce"));r=Promise.allSettled(i.map(a=>{if(a=b(a),a in f)return;f[a]=!0;const u=a.endsWith(".css"),m=u?'[rel="stylesheet"]':"";if(document.querySelector(`link[href="${a}"]${m}`))return;const c=document.createElement("link");if(c.rel=u?"stylesheet":h,u||(c.as="script"),c.crossOrigin="",c.href=a,s&&c.setAttribute("nonce",s),document.head.appendChild(c),u)return new Promise((g,y)=>{c.addEventListener("load",g),c.addEventListener("error",()=>y(new Error(`Unable to preload CSS for ${a}`)))})}))}function n(t){const s=new Event("vite:preloadError",{cancelable:!0});if(s.payload=t,window.dispatchEvent(s),!s.defaultPrevented)throw t}return r.then(t=>{for(const s of t||[])s.status==="rejected"&&n(s.reason);return o().catch(n)})};let l=null;function x(){if(!l)throw new Error("La configuración se pide antes de cargarla");return l}function p(e){return!(!e||typeof e.supabaseUrl!="string"||!e.supabaseUrl.startsWith("https://")||typeof e.supabaseAnonKey!="string"||e.supabaseAnonKey.length<20)}async function w(){try{const o=await fetch("/config.json",{cache:"no-store"});if(o.ok){const i=await o.json();if(p(i))return l={...i,vapidPublicKey:i.vapidPublicKey??""},l}}catch{}const e={supabaseUrl:void 0,supabaseAnonKey:void 0,vapidPublicKey:""};return p(e)?(l=e,l):null}(async()=>{try{await w()?await v(()=>import("./arranque-CpXNdOgX.js").then(e=>e.a),__vite__mapDeps([0,1])):P()}catch{E()}})();function E(){var o;const e=window;(o=e.__ergoboxAvisoDeArranque)==null||o.call(e)}function P(){const e=document.getElementById("raiz");e&&(e.innerHTML=`
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
  `)}export{v as _,x as c};
