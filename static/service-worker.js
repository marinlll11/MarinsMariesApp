self.addEventListener("install", e => {
    console.log("SW installé");
    self.skipWaiting();
});

self.addEventListener("activate", e => {
    console.log("SW actif");
});

self.addEventListener("fetch", e => {

});