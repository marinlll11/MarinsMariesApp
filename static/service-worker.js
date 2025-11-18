self.addEventListener("install", e => {
    console.log("SW installé");
    self.skipWaiting();
});

self.addEventListener("fetch", e => {

});
