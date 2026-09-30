/* MUSEDUC : service worker (application installable).

   Règle d'or : ne JAMAIS servir une vieille version quand le réseau répond.
   - la page, la feuille de style et le programme : RÉSEAU D'ABORD ; la copie en
     cache ne sert que hors connexion ;
   - les images et les icônes, qui ne changent pas : cache d'abord ;
   - le reste (Firebase, polices, icônes Phosphor, musiques et sons en streaming)
     n'est pas intercepté : le navigateur s'en charge comme avant.
   Changer CACHE vide les anciennes copies à la prochaine visite. */
const CACHE = "museduc-v3";

self.addEventListener("install", function () { self.skipWaiting(); });
self.addEventListener("activate", function (e) {
  e.waitUntil(caches.keys()
    .then(function (ks) { return Promise.all(ks.filter(function (k) { return k !== CACHE; }).map(function (k) { return caches.delete(k); })); })
    .then(function () { return self.clients.claim(); }));
});

function garder(req, rep) {
  /* seules les réponses complètes (200) se rangent : un morceau (206) ferait échouer put() */
  if (rep && rep.status === 200 && rep.type === "basic") {
    const copie = rep.clone();
    caches.open(CACHE).then(function (c) { return c.put(req, copie); }).catch(function () {});
  }
  return rep;
}

self.addEventListener("fetch", function (e) {
  const r = e.request;
  if (r.method !== "GET" || r.headers.has("range")) return;
  const u = new URL(r.url);
  if (u.origin !== self.location.origin) return;
  if (/\.(mp3|webm|ogg|wav|m4a|mp4)$/i.test(u.pathname)) return;   /* audio : streaming normal */

  if (/\/(images|icons)\//.test(u.pathname)) {
    e.respondWith(caches.match(r).then(function (m) {
      return m || fetch(r).then(function (rep) { return garder(r, rep); });
    }));
    return;
  }
  /* page, style, programme, manifeste : réseau d'abord, en demandant TOUJOURS au
     serveur si le fichier a changé (cache:"no-cache" : une simple vérification,
     sans retéléchargement s'il est identique). Sans cela, un serveur qui n'envoie
     pas d'en-tête de cache laisse le navigateur resservir une ancienne page. */
  const frais = r.mode === "navigate"
    /* redirect "manual" : Cloudflare Pages renvoie museduc7.html vers museduc7
       (redirection 308). Une page de navigation ne peut pas recevoir une réponse
       déjà redirigée par le service worker (erreur réseau) : on rend la
       redirection telle quelle et c'est le navigateur qui la suit. */
    ? new Request(r.url, { cache: "no-cache", credentials: "same-origin", redirect: "manual" })
    : new Request(r, { cache: "no-cache" });
  e.respondWith(fetch(frais).then(function (rep) { return garder(r, rep); }).catch(function () {
    return caches.match(r, { ignoreSearch: true })
      .then(function (m) { return m || (r.mode === "navigate" ? caches.match("museduc7.html", { ignoreSearch: true })
        .then(function (m) { return m || caches.match("museduc7", { ignoreSearch: true }); }) : null); })
      .then(function (m) {
        return m || new Response("MUSEDUC n'est pas joignable : vérifie ta connexion.",
          { status: 503, headers: { "Content-Type": "text/plain; charset=utf-8" } });
      });
  }));
});
