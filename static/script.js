let userId = localStorage.getItem("user_id");
if (!userId) {
    userId = crypto.randomUUID();
    localStorage.setItem("user_id", userId);
    console.log("Nouvel utilisateur :", userId);
} else {
    console.log("Utilisateur existant :", userId);
}

let pseudo = localStorage.getItem("pseudo");
if (!pseudo) {
    pseudo = prompt("Choisis ton pseudo :");
    if (!pseudo || pseudo.trim() === "") pseudo = "Anonyme";
    localStorage.setItem("pseudo", pseudo);
}

fetch("/register_user", {
    method: "POST",
    headers: {"Content-Type": "application/json"},
    body: JSON.stringify({ user_id: userId, pseudo: pseudo })
})

let carte = L.map('carte').setView([45.0, 6.0], 12);

let modeSelectionne = null;

let lastPopupTime = 0;

let marqueurUtilisateur = null;

let zones = [];
let zonesAffichage = [];
let layersZones = [];

let popupAidesOuverte = false; 

let dernierNombreAides = 0;

let chatActif = null;
let messages = {};
let currentChatUser = null;

let popupOuverte = false;

async function checkSanctions() {
    const r = await fetch("/sanction/" + userId);
    const data = await r.json();
    
    console.log(data.banni)

    if (data.banni) {
        alert("Vous êtes banni de la plateforme.");
        document.body.innerHTML = "<h1>Accès refusé - banni</h1>";
        return;
    }

    if (data.expulse) {
        alert("Vous êtes temporairement expulsé jusqu'à " + data.fin);
        document.body.innerHTML = "<h1>Accès temporairement refusé - expulsé temporairement</h1>";
    }
}

document.getElementById("btn-compte").onclick = () => {
    document.getElementById("popup-compte").classList.remove("hidden");
    document.getElementById("input-pseudo").value = pseudo || "";
};

document.getElementById("btn-save-pseudo").onclick = async () => {
    const p = document.getElementById("input-pseudo").value.trim();
    if (!p) return alert("Pseudo vide");

    const res = await fetch("/set_pseudo", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ user_id: userId, pseudo: p })
    });

    const j = await res.json();
    if (j.ok) {
        document.getElementById("btn-compte").innerHTML = `Accès de ${j.pseudo}`;
        pseudo = j.pseudo;
        localStorage.setItem("pseudo", pseudo);
        document.getElementById("popup-compte").classList.add("hidden");
        chargerTrajets();
    }
}

async function verifierAdmin() {
    const res = await fetch(`/is_admin/${userId}`);
    const data = await res.json();

    if (data.admin === true) {
        document.getElementById("btn-admin").classList.remove("hidden");
    }
}

document.getElementById("btn-admin").onclick = async () => {
    const r = await fetch(`/admin/signalements?uid=${userId}`);
    const d = await r.json();

    ouvrirAdmin();
}

setInterval(() => {
    if (!document.getElementById("popup-admin").classList.contains("hidden")) {
        ouvrirAdmin();
    }
}, 5000)

async function ouvrirAdmin() {
    const r = await fetch("/signalements/all");
    const data = await r.json();

    let html = "";

    data.signalements.forEach(s => {
        html += `
            <div class="bloc-sign">
                <b>${s.signale_par_pseudo} (${s.signale_par})</b> a signalé <b>${s.pseudo_signale} (${s.signale_id})</b><br>
                <i>${s.message}</i><br>
            </div>
        `;
    });

    document.getElementById("admin-signalements").innerHTML = html;
    document.getElementById("popup-admin").classList.remove("hidden");
}

async function ajouterAdmin() {
    const newId = prompt("ID de l'utilisateur à promouvoir admin :");

    if (!newId) return;

    const res = await fetch("/admin/add", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ admin: userId, new_admin: newId})
    })

    const j = await res.json();
    if (j.ok) {
        alert("Nouvel admin ajouté !");
    }
}

async function ajouterBan() {
    const newId = prompt("ID de l'utilisateur à bannir :");

    if (!newId) return;

    const res = await fetch("/admin/ban", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ admin: userId, user: newId})
    })

    const j = await res.json();
    if (j.ok) {
        alert(`Utilisateur expulsé pendant ${heures}h !`);
    }
}

async function ajouterExpulsion() {
    const userToExpulse = prompt("ID de l'utilisateur à expulser :");

    const heures = prompt("Pour combien d'heures expulser ?");

    const res = await fetch("/admin/expulse", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ admin: userId, user: userToExpulse, heures: Number(heures)})
    })

    const j = await res.json();
    if (j.ok) {
        alert("Utilisateur expulsé !");
    }
}

function fermerAdmin() {
    document.getElementById("popup-admin").classList.add("hidden")
    document.getElementById("popup-compte").classList.remove("hidden")
}

document.getElementById("btn-open-aides").onclick = async () => {
    document.getElementById("popup-compte").classList.add("hidden");
    await ouvrirPopupAides();
}

setInterval(async () => {
    if (!popupAidesOuverte) return;

    const res = await fetch(`/aide/recues/${userId}`)
    const data = await res.json();

    let htmlRecues = "";
    let htmlAcc = "";

    if (data.recues.length === 0 && data.acceptees.length === 0) {
        htmlRecues = "<p>Aucune aide reçue pour le moment.</p>";
        htmlAcc = "<p>Aucune aide reçue pour le moment.</p>";
    } else {
    data.recues.forEach(item => {
        const tr = item.trajet;
        const a = item.aide;
        htmlRecues += `
            <div class="aide-header">
                <h4>Demande ${tr.nom}</h4>
                <b>${a.prenom} - ${a.pseudo}</b> - à ${a.heure}<br>
                Envoyée le : ${new Date(a.heure_envoi).toLocaleString()}<br>
                Sexe : ${a.sexe}<br>
                Message : ${wrapText(a.message)}<br><br>

                ${
                    a.etat === "en_attente" ?
                    `<button onclick="accepterAide('${tr.trajet_id}', '${a.id_aide}')">Accepter</button>
                        <button onclick="refuserAide('${tr.trajet_id}', '${a.id_aide}')">Refuser</button>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                    : a.etat === "refusee" ?
                    `<i>Refusée</i>
                    <button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer quand même en contact</button>
                    <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>
                    `
                    : a.etat === "acceptee" ?
                    `<i>Acceptée</i>
                    <button class="btn-signaler" onclick="signalerAideur('${tr.id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                    : a.etat === "refusee_final" ?
                    `<i>Acceptée</i>
                    <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                    : ""
                    }
                </div>
            `;
        });

        data.acceptees.forEach(item => {
            const tr = item.trajet;
            const a = item.aide;
            htmlAcc += `
                <div class="aide-header">
                    <h4>Demande ${tr.nom}</h4>
                    <b>${a.prenom} - ${a.pseudo}</b> - à ${a.heure}<br>
                    Envoyée le : ${new Date(a.heure_envoi).toLocaleString()}<br>
                    Sexe : ${a.sexe}<br>
                    Message : ${wrapText(a.message)}<br><br>

                    ${
                        a.etat === "acceptee" ?
                        `<button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer en contact</button>
                            <button onclick="refuserFinal('${tr.trajet_id}', '${a.id_aide}')">Refuser au final</button>
                            <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                        :
                        `<i>Refusé au final</i>
                        <button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer quand même en contact</button>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                    }
                </div>
            `;
        });
        }
        document.getElementById("liste-aides").innerHTML = htmlRecues;
        document.getElementById("liste-acceptees").innerHTML = htmlAcc; 
    }, 5000);

async function ouvrirPopupAides() {
    const res = await fetch(`/aide/recues/${userId}`);
    const trajetUser = window.trajetsLoaded?.find(t => t.user_id === userId);
    window.trajetUserId = trajetUser?.id || null;
    const data = await res.json();

    let htmlRecues = "";
    let htmlAcc = "";

    if (data.recues.length === 0 && data.acceptees.length === 0) {
        htmlRecues = "<p>Aucune aide reçue pour le moment.</p>";
        htmlAcc = "<p>Aucune aide reçue pour le moment.</p>";
    } 
    else {
        data.recues.forEach(item => {
            const tr = item.trajet;
            const a = item.aide;
            htmlRecues += `
                <div class="aide-header">
                    <h4>Demande ${tr.nom}</h4>
                    <b>${a.prenom} - ${a.pseudo}</b> - à ${a.heure}<br>
                    Envoyée le : ${new Date(a.heure_envoi).toLocaleString()}<br>
                    Sexe : ${a.sexe}<br>
                    Message : ${wrapText(a.message)}<br><br>

                    ${
                        a.etat === "en_attente" ?
                        `<button onclick="accepterAide('${tr.trajet_id}', '${a.id_aide}')">Accepter</button>
                            <button onclick="refuserAide('${tr.trajet_id}', '${a.id_aide}')">Refuser</button>
                            <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                        : a.etat === "refusee" ?
                        `<i>Refusée</i>
                        <button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer quand même en contact</button>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>
                        `
                        : a.etat === "acceptee" ?
                        `<i>Acceptée</i>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                        : a.etat === "refusee_final" ?
                        `<i>Acceptée</i>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                        : ""
                    }
                </div>
            `;
        });

        data.acceptees.forEach(item => {
            const tr = item.trajet;
            const a = item.aide;
            htmlAcc += `
                <div class="aide-header">
                    <h4>Demande ${tr.nom}</h4>
                    <b>${a.prenom} - ${a.pseudo}</b> - à ${a.heure}<br>
                    Envoyée le : ${new Date(a.heure_envoi).toLocaleString()}<br>
                    Sexe : ${a.sexe}<br>
                    Message : ${wrapText(a.message)}<br><br>

                    ${
                        a.etat === "acceptee" ?
                        `<button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer en contact</button>
                            <button onclick="refuserFinal('${tr.trajet_id}', '${a.id_aide}')">Refuser au final</button>
                            <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                        :
                        `<i>Refusé au final</i>
                        <button onclick="entrerContact('${tr.trajet_id}', '${a.id_aide}')">Entrer quand même en contact</button>
                        <button class="btn-signaler" onclick="signalerAideur('${tr.trajet_id}', '${a.id_aide}', '${a.pseudo}')">Signaler l'aidant</button>`
                    }
                </div>
            `;
            });
        };
    document.getElementById("liste-aides").innerHTML = htmlRecues;
    document.getElementById("liste-acceptees").innerHTML = htmlAcc;
    document.getElementById("popup-aides").classList.remove("hidden");
    popupAidesOuverte = true;
}

async function accepterAide(trajetId, aideId) {
    await fetch("/aide/accepter", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ user_id:userId, trajet_id:trajetId, aide_id:aideId })
    });
    ouvrirPopupAides();
}

async function signalerAideur(trajetId, aideId, pseudo) {
    const motif = prompt(`Signaler ${pseudo} :\n\nExplique brièvement le problème`);
    
    const aide = window.trajetsLoaded
        .find(t => t.id === trajetId)
        .aides.find(a => a.id_aide === aideId);

    const aideurId = aide.user_id;
    await fetch("/signalement", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ 
            signale_par: userId,
            trajet_id: trajetId,
            aide_id: aideId,
            pseudo: pseudo,
            signale_id: aideurId,
            message: motif 
         })
    });

    alert("Merci. Votre signalement a été envoyé à l'équipe.")
}

async function refuserAide(trajetId, aideId) {
    await fetch("/aide/refuser", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ user_id:userId, trajet_id:trajetId, aide_id:aideId })
    });
    const aide = window.trajetsLoaded
        .find(t => t.id === trajetId)
        .aides.find(x => x.id_aide === aideId)
    const aideur_id = aide.user_id
    ouvrirPopupAides();
}

async function refuserFinal(trajetId, aideId) {
    await fetch("/aide/refuser_final", {
        method:"POST",
        headers:{"Content-Type":"application/json"},
        body:JSON.stringify({ user_id:userId, trajet_id:trajetId, aide_id:aideId })
    });
    const aide = window.trajetsLoaded
        .find(t => t.id === trajetId)
        .aides.find(x => x.id_aide === aideId)
    const aideur_id = aide.user_id
    ouvrirPopupAides();
}

async function entrerContact(trajetId, aideId) {
    const trajet = window.trajetsLoaded.find(t => t.id === trajetId);
    const aide = trajet.aides.find(a => a.id_aide === aideId); 
    const r = await fetch(`/aide/telephone/${trajetId}/${aideId}`);
    const data = await r.json();

    const numero = data.telephone;

    const html = `
        <div id="popup-contact" class="popup">
            <h3>Contacter ${aide.pseudo}</h3>
            <p>Téléphone : <b>${numero}</b></p>
            <button onclick="lancerAppelInterne('${aide.user_id}')">
                Appel via l'application
            </button>
            <button onclick="fermerContact()">Fermer</button>
        </div>
    `;
    const old = document.getElementById("popup-contact");
    if (old) old.remove();
    document.body.insertAdjacentHTML("beforeend", html)
}

async function lancerAppelInterne(otherId) {
    const pc = new RTCPeerConnection();

    const stream = await navigator.mediaDevices.getUserMedia({ audio:true });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);

    await fetch("/call/send_offer", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
            caller: userId,
            receiver: otherId,
            offer: offer
        })
    });

    pollAnswer(pc, otherId)
}

async function pollAnswer(pc, otherId) {
    const interval = setInterval(async () => {
        const r = await fetch(`/call/poll/${userId}`);
        const data = await r.json();

        if (data.type === "answer") {
            clearInterval(interval);
            await pc.setRemoteDescription(new RTCSessionDescription(data.answer));
        }
    }, 2000); 
}

async function checkIncomingCalls() {
    const r = await fetch(`/call/poll/${userId}`);
    const d = await r.json();

    if (d.type === "offer") {
        afficherPopupAppelEntrant(d.from, d.offer)
    }

    if (d.type === "end_call") {
        document.getElementById("popup-appel")?.remove();
        document.getElementById("popup-en-appel")?.remove();

        if (window.localStream) {
            window.localStream.getTracks().forEach(t => t.stop());
        }

        if (window.currentPC) {
            window.currentPC.close();
        }

        alert("Appel terminé.");

    }
}
setInterval(checkIncomingCalls, 2000)

function afficherPopupAppelEntrant(fromId, offer) {
    const old = document.getElementById("popup-appel");
    if (old) old.remove();

    const html = `
    <div id="popup-appel" class="popup">
        <h3>${fromId} vous appelle</h3>
        <button onclick="accepterAppel('${fromId}', JSON.stringify(${JSON.stringify(offer)}))">
            Accepter
        </button>
        <button onclick="refuserAppel('${fromId}')">
            Refuser
        </button>
    </div>`;

    document.body.insertAdjacentHTML("beforeend", html)
}

async function accepterAppel(fromId, offerString) {
    const offer = JSON.parse(offerString);

    document.getElementById("popup-appel")?.remove();

    const pc = new RTCPeerConnection();

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    stream.getTracks().forEach(track => pc.addTrack(track, stream));

    pc.ontrack = (event) => {
        const audio = new Audio();
        audio.srcObject = event.streams[0];
        audio.play();
    };

    await pc.setRemoteDescription(new RTCSessionDescription(offer));

    const answer = await pc.createAnswer();
    await pc.setLocalDescription(answer);

    await fetch("/call/send_answer", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
            caller: userId,
            receiver: fromId,
            answer: answer
        })
    });

    afficherPopupEnAppel(fromId);
}

async function refuserAppel(fromId) {
    document.getElementById("popup-appel")?.remove();
    
    await fetch("/call/end", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
            from: userId,
            to: fromId
        })
    });
}

function afficherPopupEnAppel(otherId) {
    document.getElementById("popup-en-appel")?.remove();

    const div = document.createElement("div");
    div.id = "popup-en-appel";
    div.className = "popup";
    div.innerHTML = `
        <h3>En appel</h3>
        <p>Avec : ${otherId}</p>
        <button onclick="raccrocher('${otherId}')">Raccrocher</button>
    `;
    document.body.appendChild(div); 
}

async function raccrocher(otherId) {
    document.getElementById("popup-en-appel")?.remove();

    if (window.localStream) {
        window.localStream.getTracks().forEach(t => t.stop());
    }

    if (window.currentPC) {
        window.currentPC.close();
    }

    await fetch("/call/end", {
        method: "POST",
        headers: { "Content-Type": "application/json"},
        body: JSON.stringify({
            from: userId,
            to: otherId
        })
    });
}

function fermerContact() {
    const popup = document.getElementById("popup-contact");
    if (popup) popup.remove();
}

function fermerAides() {
    document.getElementById("popup-aides").classList.add("hidden")
    document.getElementById("popup-compte").classList.remove("hidden")
    popupAidesOuverte = false;
}

document.getElementById("btn-close-compte").onclick = () => {
    document.getElementById("popup-compte").classList.add("hidden");
};

L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
    maxZoom: 19
}).addTo(carte);

const iconeMoi = L.icon({
    iconUrl: "icon/moi.png",
    iconSize: [50, 50]
});

const iconeMarcheur = L.icon({
    iconUrl: "icon/marcheur.png",
    iconSize: [32, 32]
});

const iconeConducteur = L.icon({
    iconUrl: "icon/conducteur.png",
    iconSize: [32, 32]
});

const iconeCompagnon = L.icon({
    iconUrl: "icon/compagnon.png",
    iconSize: [32, 32]
});

if (navigator.geolocation) {
    navigator.geolocation.getCurrentPosition(
        pos => {
            console.log("GPS OK :", pos);
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        carte.setView([lat, lon], 14);

        marqueurUtilisateur = L.marker([lat, lon]).addTo(carte)
            .bindPopup("Vous êtes ici")
            .openPopup();

        L.circle([lat, lon], {
            radius: 200,
            color: "blue",
            fillOpacity: 0.1
        }).addTo(carte);
        },
        err => {
            console.error("GPS ERROR :", err);
            alert(err.message);
        }
    )};

navigator.geolocation.watchPosition(
    pos => {
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;

        marqueurUtilisateur.setLatLng([lat, lon])
    },
    err => console.log("GPS error:", err),
    { enableHighAccuracy: true }
)

async function chargerZones() {
    const res = await fetch("/zones");
    const data = await res.json();

    zones = Object.values(data).map(z => ({
        nom: z.nom,
        polygon: z.geometry.coordinates[0].map(p => [p[0], p[1]])
    }));

    layersZones.forEach(l => carte.removeLayer(l));
    layersZones = [];

    zones.forEach(z => {
        const poly = L.polygon(
            z.polygon.map(p => [p[1], p[0]]),
        {
            color: "red",
            weight: 3,
            fillColor: "red",
            fillOpacity: 0.30
        }).addTo(carte);

        layersZones.push(poly);
    });
}

setInterval(chargerTrajets, 15000)

async function chargerTrajets() {
    const res = await fetch("/trajets");
    const trajets = await res.json();

    if (window.markersTrajets) {
        window.markersTrajets.forEach(layer => {
            carte.removeLayer(layer);
        });
    }
    window.markersTrajets = [];
    trajets.forEach(t => {
        const [lat, lon] = t.position;

        let icone =
            t.type === "marcheur" ?    iconeMarcheur :
            t. type === "conducteur" ? iconeConducteur :
                                       iconeCompagnon;
        
        if (t.user_id === userId) {
            const moiIcon = L.marker([lat, lon], {
                icon: iconeMoi,
                zIndexOffset: -1000
            }).addTo(carte);
            
            window.markersTrajets.push(moiIcon)
        }

        const heure = new Date(t.heure2);
        const expire = new Date(heure.getTime() + 3 * 3600 * 1000);

        const heureExpire = expire.toLocaleDateString("fr-FR", {
            hour: "2-digit",
            minute: "2-digit"
        })
        const estMoi = (t.user_id === userId)
        const marker = L.marker([lat, lon], { 
            icon: icone,
            draggable: estMoi })
            .addTo(carte)
            .bindPopup(`
                <b>${t.nom}</b><br>
                Type : ${t.type}<br>
                Par : ${t.pseudo}<br>
                Heure : ${t.heure || "?"}<br>
                Expire : <span style="color:red">${heureExpire}</span><br>
                Genre autorisé : ${t.genre_autorise || "Tous"}<br>
                Heure souhaitée : ${t.heure_souhaitee || "Non précisé"}<br>
                Message : ${wrapText(t.message_trajet) || "-"}<br>
                <button onclick="proposerAide('${t.id}')">Proposer mon aide</button>
                <button onclick="supprimerTrajet('${t.id}')">Supprimer</button>
            `);
        let popupStartTimes = {};
        marker.on("popupopen", () => {
            popupStartTimes[t.id] = Date.now();
            fetch("/trajet/open_popup", {
                method: "POST",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify({
                    trajet_id: t.id,
                    user_id: userId,
                    event: "open"
                })
            });
        });
        marker.on("popupclose", () => {
            const start = popupStartTimes[(t.id)];
            if (!start) return;
            const duree = Date.now() - start;
            fetch("/trajet/open_popup", {
                method: "POST",
                headers: { "Content-Type": "application/json"},
                body: JSON.stringify({
                    trajet_id: t.id,
                    user_id: userId,
                    event: "close",
                    duree: duree
                })
            });
        });
        const circle = L.circle([lat, lon], {
            radius: 200,
            color: "blue",
            fillOpacity: 0.1
        }).addTo(carte)
        if (estMoi) {
            marker.on("dragend", async (e) => {
                const newPos = e.target.getLatLng();
                const newLat = newPos.lat;
                const newLon = newPos.lng;
                if(!clicDansZones(newLat, newLon)) {
                    alert("Vous devez rester dans une zone autorisée !");
                    marker.setLatLng([lat, lon]);
                    circle.setLatLng([lat, lon]);
                    return;
                }
                await fetch("/update_position", {
                    method: "POST",
                    headers: { "Content-Type": "application/json"},
                    body: JSON.stringify({
                        id: t.id,
                        user_id: userId,
                        position: [newPos.lat, newPos.lng]
                    })
                });
                chargerTrajets();
            });
            marker.on("drag", (e) => {
                const newPos = e.target.getLatLng();
                circle.setLatLng(newPos);
            });
        }
        window.markersTrajets.push(marker);
        window.markersTrajets.push(circle);
    })
    window.trajetsLoaded = trajets;
}

document.getElementById("btn-center").onclick = () => {
    const pos = marqueurUtilisateur.getLatLng();
    carte.setView(pos, 14)
}

document.getElementById("btn-save-pos").onclick = ()=> {
    const center = carte.getCenter();
    localStorage.setItem("saved_pos", JSON.stringify([center.lat, center.lng]));
}

document.getElementById("btn-go-saved").onclick = () => {
    const saved = localStorage.getItem("saved_pos");
    if (!saved) {
        return;
    }
    const [lat, lon] = JSON.parse(saved);
    carte.setView([lat, lon], 14)
}

function popupRefresh() {
    const now = Date.now();
    if (now - lastPopupTime < 20000) {
        return;
    }
    lastPopupTime = now;

    const popup = L.popup()
        .setLatLng(carte.getCenter())
        .setContent("<b>Carte mise à jour mais déjà (bien) avant</b>")
        .openOn(carte)
    setTimeout(() => {
        carte.closePopup(popup);
    }, 1200);
}

document.querySelectorAll("#map-buttons button").forEach(btn => {
    btn.addEventListener("click", e => {
        e.stopPropagation();
    });
});

document.getElementById("btn-refresh").onclick = () => {
    chargerTrajets();
    popupRefresh();
}

document.querySelectorAll(".btn-type").forEach(btn => {
    btn.onclick = () => {
        document.querySelectorAll(".btn-type").forEach(b => b.classList.remove("active"));
        btn.classList.add("active");
        modeSelectionne = btn.dataset.type;
    };
});

function pointDansPolygone(lat, lon, polygon) {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][1], yi = polygon[i][0];
        const xj = polygon[j][1], yj = polygon[j][0];

        const intersect = ((yi > lon) !== (yj > lon)) &&
            (lat < (xj - xi) * (lon - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;  
    }
    return inside;
}

function clicDansZones(lat, lon) {
    return zones.some(z => pointDansPolygone(lat, lon, z.polygon))
} 

function wrapText(str, maxLen = 45) {
    if (!str) return "";
    str = String(str);

    const words = str.split(" ");
    const lines = [];
    let current = "";

    for (let w of words) {
        while (w.length > maxLen) {
            const chunk = w.slice(0, maxLen);
            w = w.slice(maxLen);

            if (current) {
                lines.push(current);
                current = "";
            }
            lines.push(chunk);
        }
        if ((current + (current ? " " : "") + w).length > maxLen) {
            if (current) lines.push(current);
            current = w;  
        } else {
            current += (current ? " " : "") + w;
        }
    }
    if (current) lines.push(current);

    return lines.join("<br>")
}

async function envoyer(endpoint, data) {
    data.user_id = userId;
    data.pseudo = pseudo;
    const res = await fetch(endpoint, {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify(data)
    });

    await res.json();

    chargerTrajets();
}

carte.on("click", async (e) => {
    const type = modeSelectionne;
    const lat = e.latlng.lat;
    const lon = e.latlng.lng;
    
    if (!clicDansZones(lat, lon)) {
        alert("Vous devez créer un trajet dans une zone autorisée !")
        return;
    }

    if (!modeSelectionne) {
        alert("Choisis un type de départ avant de cliquer sur la carte !")
        return;
    }

    const nom = prompt("Nom du trajet ?");
    const genreAutorise = prompt(
        "Qui peut te contacter ? (Homme / Femme / Non binaire / Trans / Tous) en sachant qu'il peut y avoir plusieurs personnes dans l'aide en question"
    ) || "Tous";
    let heureSouhaitee = prompt("A quelle heure veux-tu être aidé ? (ex : 18h30)");
    const messageTrajet = prompt("Message à afficher pour ton trajet :") || "";

    await envoyer(
        type === "marcheur" ? "/demande_retour" :
        type === "conducteur" ? "/propose_retour" :
        type === "compagnon_demande" ? "/compagnon" :
        "/compagnon_proposition",
        {
            type: type,
            position: [lat, lon],
            nom: nom || "Trajet sans nom",
            genre_autorise: genreAutorise,
            heure_souhaitee: heureSouhaitee,
            message_trajet: messageTrajet
        }
    );
    document.querySelectorAll(".btn-type").forEach(b => b.classList.remove("active"));
    modeSelectionne = null; 
    chargerTrajets();
})

async function supprimerTrajet(id) {
    await fetch("/supprimer", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({ id: id, user_id: userId })
    });
    
    chargerTrajets();
}

async function proposerAide(trajetId) {
    const start = Date.now()
    const trajet = window.trajetsLoaded?.find(t => t.id === trajetId);
    if (trajet && trajet.user_id === userId) {
        alert("Impossible d'aider ton propre trajet !");
        return;
    }
    const prenom = prompt("Ton prénom ?"); 
    const sexe = prompt("Votre genre (Homme/Femme/Non binaire/Trans) ?");
    const heureArrivee = prompt("A quelle heure pouvez-vous aider ? (exemple : 18:45)");
    const message = prompt("Message pour la personne :");
    const telephone = prompt("Ton numéro de téléphone ? (Uniquement pour être contacté ensuite)");
    const end = Date.now()
    fetch("/trajet/form_time", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            trajet_id: trajetId,
            user_id: userId,
            duree: end - start
        })
    });
    const resp = await fetch("/aide/proposer", {
        method: "POST",
        headers: {"Content-Type": "application/json"},
        body: JSON.stringify({
            trajet_id: trajetId,
            user_id: userId,
            pseudo: pseudo,
            prenom: prenom,
            sexe: sexe,
            heure: heureArrivee,
            message: message,
            tel: telephone
        })
    });

    const resultat = await resp.json();
    console.log(resultat)

    if (!resp.ok) {
        alert(resultat.error);
        return;
    }

    alert("Proposition envoyée !")
}

window.onload = () => {
    checkSanctions();
    chargerZones();
    chargerTrajets();
    document.getElementById("btn-compte").innerHTML = `Accès de ${pseudo}`;
    verifierAdmin();
    checkReponseAdmin();
    startPolling();
    checkAlertes();
}