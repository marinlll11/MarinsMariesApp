from cryptography.fernet import Fernet
from datetime import datetime, timedelta
from flask import Flask, request, jsonify
import json, os, uuid

app = Flask(__name__)

KEY_FILE = "static/secret.key"

if not os.path.exists(KEY_FILE):
    key = Fernet.generate_key()
    with open(KEY_FILE, "wb") as f:
        f.write(key)
else:
    with open(KEY_FILE, "rb") as f:
        KEY = f.read()

fernet = Fernet(KEY)

def chiffre(texte):
    return fernet.encrypt(texte.encode()).decode()

def dechiffre(texte_chiffre):
    try:
        return fernet.decrypt(texte_chiffre.encode()).decode()
    except:
        None

signaling = {}

DATA_ZONES = "data/zones.json"
DATA_SIGNALEMENTS = "data/signalements.json" 
DATA_TRAJETS = "data/trajets.json"
DATA_UTILISATEURS = "data/utilisateurs.json"

def charger_zones():
    with open(DATA_ZONES, "r", encoding="utf-8") as f:
        return json.load(f)
    
def charger_signalements():
    with open(DATA_SIGNALEMENTS, "r", encoding="utf-8") as f:
        return json.load(f)

def charger_trajets():
    with open(DATA_TRAJETS, "r", encoding="utf-8") as f:
        return json.load(f)

def charger_users():
    with open(DATA_UTILISATEURS, "r", encoding="utf-8") as f:
        return json.load(f)
    
def sauvegarder_signalements(data):
    with open(DATA_SIGNALEMENTS, "w", encoding="utf-8") as f:
        json.dump(data, f, indent=2, ensure_ascii=False)

def sauvegarder_trajets(trajets):
    with open(DATA_TRAJETS, "w", encoding="utf-8") as f:
        json.dump(trajets, f, indent=2, ensure_ascii=False)

def sauvegarder_users(users):
    with open(DATA_UTILISATEURS, "w", encoding="utf-8") as f:
        json.dump(users, f, indent=2, ensure_ascii=False)

@app.route("/")
def accueil():
    return "API de covoiturage marcheurs opérationnelle !"

@app.route("/admin/users")
def get_users():
    users = charger_users()

    return jsonify(users)

@app.route("/register_user", methods=["POST"])
def register_user():
    data = request.get_json()
    user_id = data["user_id"]
    pseudo = data["pseudo"]

    users = charger_users()

    if user_id not in users:
        users[user_id] = {
            "pseudo": pseudo,
            "admin": False,
            "banni": False,
            "expulsion_fin": False
        }
        sauvegarder_users(users)

    return jsonify({"ok": True})

@app.route("/sanction/<user_id>")
def sanction(user_id):
    users = charger_users()

    u = users.get(user_id)
    if u.get("banni"):
        return jsonify({"banni": True, "expulse": False})
    
    fin = u.get("expulsion_fin")
    if fin:
        fin_dt = datetime.fromisoformat(fin)
        if datetime.now() < fin_dt:
            return jsonify({
                "banni": False,
                "expulse": True,
                "fin": fin_dt.strftime("%d/%m %H/%M")
            })
        
    return jsonify({"banni": False, "expulse": False})

@app.route("/zones", methods=["GET"])
def get_zones():
    return jsonify(charger_zones())

@app.route("/is_admin/<uid>")
def is_admint(uid):
    users = charger_users()
    if uid in users and users[uid].get("admin"):
        return jsonify({"admin": True})
    return jsonify({"admin": False})

@app.route("/admin/signalements")
def voir_signalements():
    users = charger_users()
    uid = request.args.get("uid")

    if uid not in users or not users[uid].get("admin"):
        return jsonify({"error":"Accès interdit"}), 403
    
    sig = charger_signalements()
    return jsonify(sig)

@app.route("/signalements/all")
def signalements_all():
    sig = charger_signalements()
    return jsonify({"signalements": sig})

@app.route("/admin/add", methods=["POST"])
def admin_add():
    data = request.get_json()

    admin = data["admin"]
    new_admin = data["new_admin"]

    users = charger_users()

    if not users.get(admin, {}).get("proprioowner"):
        return jsonify({"error": "Seuls les propriétaires de l'application peut ajouter un nouvel admin."})

    if not users.get(admin, {}).get("admin"):
        return jsonify({"error": "Accès interdit"}), 403
    
    users[new_admin]["admin"] = True
    sauvegarder_users(users)

    return jsonify({"ok": True})

@app.route("/admin/ban", methods=["POST"])
def admin_ban():
    data = request.get_json()
    admin_id = data["admin"]
    user_id = data["user"]

    users = charger_users()

    if not users.get(admin_id, {}).get("admin"):
        return jsonify({"error": "Accès refusé"}), 403
    
    users[user_id]["banni"] = True
    
    sauvegarder_users(users)
    return jsonify({"ok": True})

@app.route("/admin/expulse", methods=["POST"])
def admin_expulse():
    data = request.get_json()
    admin_id = data["admin"]
    user_id = data["user"]
    heures = data["heures"] 

    users = charger_users()

    if not users.get(admin_id, {}).get("admin"):
        return jsonify({"error": "Accès refusé"}), 403
    
    fin = datetime.now() + timedelta(hours=heures)

    users[user_id]["expulsion_fin"] = fin.isoformat()
    
    sauvegarder_users(users)
    return jsonify({"ok": True})

@app.route("/aide/recues/<user_id>", methods=["GET"])
def aides_recues(user_id):
    print("Route appelée")
    trajets = charger_trajets()

    recues = []
    acceptees = []
    for t in trajets:
        if t["user_id"] != user_id:
            continue
        if len(t["aides"]) == 0:
            continue

        infos_trajet = {
            "trajet_id": t["id"],
            "nom": t.get("nom", "Trajet sans nom")
        } 
        
        for a in t["aides"]:
            recues.append({
                "trajet": infos_trajet,
                "aide": a
            })
            if a["etat"] in ["acceptee", "refusee_final"]:
                acceptees.append({
                    "trajet": infos_trajet,
                    "aide": a
                })

    return jsonify({
        "recues": recues,
        "acceptees": acceptees
    })

@app.route("/aide/accepter", methods=["POST"])
def aide_accepter():
    trajets = charger_trajets()
    d = request.get_json()

    for t in trajets:
        if t["id"] == d["trajet_id"] and t["user_id"] == d["user_id"]:
            for a in t["aides"]:
                if a["id_aide"] == d["aide_id"]:
                    a["etat"] = "acceptee"
                    sauvegarder_trajets(trajets)
                    return jsonify({'ok': True})
    
    return jsonify({"ok": False}), 404

@app.route("/aide/refuser", methods=["POST"])
def refuser_aide():
    trajets = charger_trajets()
    d = request.get_json()

    for t in trajets:
        if t["id"] == d["trajet_id"] and t["user_id"] == d["user_id"]:
            for a in t["aides"]:
                if a["id_aide"] == d["aide_id"]:
                    a["etat"] = "refusee"
                    sauvegarder_trajets(trajets)
                    return jsonify({"ok": True})
    
    return jsonify({"ok": False}), 

@app.route("/aide/refuser_final", methods=["POST"])
def refuser_final():
    trajets = charger_trajets()
    d = request.get_json()

    for t in trajets:
        if t["id"] == d["trajet_id"] and t["user_id"] == d["user_id"]:
            for a in t["aides"]:
                if a["id_aide"] == d["aide_id"]:
                    a["etat"] = "refusee_final"
                    sauvegarder_trajets(trajets)
                    return jsonify({"ok": True})
    
    return jsonify({"ok": False}), 

@app.route("/aide/telephone/<trajet_id>/<aide_id>")
def get_tel(trajet_id, aide_id):
    trajets = charger_trajets()

    for t in trajets:
        if t["id"] == trajet_id:
            for a in t["aides"]:
                if a["id_aide"] == aide_id:
                    tel_chiffre = a.get("tel")
                    return jsonify({
                        "ok": True,
                        "telephone": dechiffre(tel_chiffre)
                    })
    return jsonify({"ok": False}), 404

@app.route("/call/send_offer", methods=["POST"])
def send_offer():
    data = request.get_json()
    caller = data["caller"]
    receiver = data["receiver"]
    offer = data["offer"]

    signaling[receiver] = {"type":"offer", "from":caller, "offer":offer}

    return jsonify({"ok": True})

@app.route("/call/send_answer", methods=["POST"])
def send_answer():
    data = request.get_json()
    caller = data["caller"]
    receiver = data["receiver"]
    answer = data["answer"]

    signaling[receiver] = {"type":"answer", "from":caller, "answer":answer}

    return jsonify({"ok": True})

@app.route("/call/poll/<user_id>")
def poll(user_id):
    if user_id in signaling:
        data = signaling.pop(user_id)
        return jsonify(data)
    return jsonify({"none": True})

@app.route("/call/end", methods=["POST"])
def end_call():
    data = request.get_json()
    caller = data["from"]
    receiver = data["to"]

    signaling[receiver] = {"type": "end_call", "from": caller}
    return jsonify({"ok": True})

@app.route("/signalement", methods=["POST"])
def signalement():
    data = request.get_json()

    users = charger_users()

    pseudo_signale_par = users.get(data["signale_par"], {}).get("pseudo", "Inconnu")

    with open("projet/data/signalements.json", "r", encoding= "utf-8") as f:
        s = json.load(f)

    s.append({
        "id": str(uuid.uuid4()),
        "trajet_id": data.get("trajet_id"),
        "aide_id": data.get("aide_id"),
        "signale_par": data.get("signale_par"),
        "signale_par_pseudo": pseudo_signale_par,
        "alerte_envoyee": False,
        "signale_id": data.get("signale_id"),
        "pseudo_signale": data.get("pseudo"),
        "message": data.get("message"),
        "timestamp": datetime.now().isoformat()
    })

    with open("projet/data/signalements.json", "w", encoding= "utf-8") as f:
        json.dump(s, f, indent=4, ensure_ascii=False)

    return jsonify(ok=True)

@app.route("/trajets", methods=["GET"])
def get_trajets():
    trajets = charger_trajets()
    maintenant = datetime.now()
    nouveaux = []
    for t in trajets:
        try:
            h = datetime.fromisoformat(t["heure"])
            if maintenant - h < timedelta(seconds=10800):
                nouveaux.append(t)
            else:
                pass
        except:
            pass
    if len(nouveaux) != len(trajets):
        sauvegarder_trajets(nouveaux)
    return jsonify(nouveaux)

@app.route("/set_pseudo", methods=["POST"])
def set_pseudo():
    users = charger_users()
    data = request.get_json()

    user_id = data.get("user_id")
    pseudo = data.get("pseudo", "").strip()

    if user_id not in users:
        users[user_id] = {
            "pseudo": pseudo,
            "admin": False,
            "banni": False,
            "expulsion_fin": None
        }
    else:
        users[user_id]["pseudo"] = pseudo
    sauvegarder_users(users)

    trajets = charger_trajets()
    for t in trajets:
        if t["user_id"] == user_id:
            t["pseudo"] = pseudo
    sauvegarder_trajets(trajets)

    return jsonify({"ok": True, "pseudo": pseudo})

@app.route("/demande_retour", methods=["POST"])
def demande_retour():
    trajets = charger_trajets()
    data = request.get_json()
    user_id = data.get("user_id")
    for t in trajets:
        if t["user_id"] == user_id and t["type"] == "marcheur":
            return jsonify({"ok": False, "error": "Vous avez déjà une demande de ce type, active"}), 403
    data["type"] = "marcheur"
    data["heure"] = str(datetime.now())
    data["id"] = str(uuid.uuid4())
    data["heure2"] = datetime.now().isoformat()
    data["user_id"] = data.get("user_id")
    data["pseudo"] = data.get("pseudo")
    data["sexe"] = data.get("sexe")
    data["delai_souhaite"] = data.get("delai")
    data["commentaire"] = data.get("commentaire", "")
    data["etat_aide"] = "none"
    data["aides"] = []
    data["nom"] = data.get("nom", "Trajet sans nom")
    data["genre_autorise"] = data.get("genre_autorise", "Tous")
    data["heure_souhaitee"] = data.get("heure_souhaitee")
    data["message_trajet"] = data.get("message_trajet", "")
    data["stats"] = {
        "open_count": 0,
        "aides_acceptees": 0,
        "open_times": [],
        "form_times": []
    }
    trajets.append(data)
    sauvegarder_trajets(trajets)
    return jsonify({"ok": True, "reçu": data})

@app.route("/propose_retour", methods=["POST"])
def propose_retour():
    trajets = charger_trajets()
    data = request.get_json()
    user_id = data.get("user_id")
    for t in trajets:
        if t["user_id"] == user_id and t["type"] == "conducteur":
            return jsonify({"ok": False, "error": "Vous avez déjà une demande de ce type, active"}), 403
    data["type"] = "conducteur"
    data["heure"] = str(datetime.now())
    data["id"] = str(uuid.uuid4())
    data["heure2"] = datetime.now().isoformat()
    data["user_id"] = data.get("user_id")
    data["pseudo"] = data.get("pseudo")
    data["sexe"] = data.get("sexe")
    data["delai_souhaite"] = data.get("delai")
    data["commentaire"] = data.get("commentaire", "")
    data["etat_aide"] = "none"
    data["aides"] = []
    data["nom"] = data.get("nom", "Trajet sans nom")
    data["genre_autorise"] = data.get("genre_autorise", "Tous")
    data["heure_souhaitee"] = data.get("heure_souhaitee")
    data["message_trajet"] = data.get("message_trajet", "")
    trajets.append(data)
    sauvegarder_trajets(trajets)
    return jsonify({"ok": True, "reçu": data})

@app.route("/compagnon", methods=["POST"])
def compagnon():
    trajets = charger_trajets()
    data = request.get_json()
    user_id = data.get("user_id")
    for t in trajets:
        if t["user_id"] == user_id and t["type"] == "compagnon":
            return jsonify({"ok": False, "error": "Vous avez déjà une demande de ce type, active"}), 403
    data["type"] = "compagnon"
    data["heure"] = str(datetime.now())
    data["id"] = str(uuid.uuid4())
    data["heure2"] = datetime.now().isoformat()
    data["user_id"] = data.get("user_id")
    data["pseudo"] = data.get("pseudo")
    data["sexe"] = data.get("sexe")
    data["delai_souhaite"] = data.get("delai")
    data["commentaire"] = data.get("commentaire", "")
    data["etat_aide"] = "none"
    data["aides"] = []
    data["nom"] = data.get("nom", "Trajet sans nom")
    data["genre_autorise"] = data.get("genre_autorise", "Tous")
    data["heure_souhaitee"] = data.get("heure_souhaitee")
    data["message_trajet"] = data.get("message_trajet", "")
    trajets.append(data)
    sauvegarder_trajets(trajets)
    return jsonify({"ok": True, "reçu": data})

@app.route("/compagnon_proposition", methods=["POST"])
def compagnon_proposition():
    trajets = charger_trajets()
    data = request.get_json()
    user_id = data.get("user_id")
    for t in trajets:
        if t["user_id"] == user_id and t["type"] == "compagnon_proposition":
            return jsonify({"ok": False, "error": "Vous avez déjà une demande de ce type, active"}), 403
    data["type"] = "compagnon_proposition"
    data["heure"] = str(datetime.now())
    data["id"] = str(uuid.uuid4())
    data["heure2"] = datetime.now().isoformat()
    data["user_id"] = data.get("user_id")
    data["pseudo"] = data.get("pseudo")
    data["sexe"] = data.get("sexe")
    data["delai_souhaite"] = data.get("delai")
    data["commentaire"] = data.get("commentaire", "")
    data["etat_aide"] = "none"
    data["aides"] = []
    data["nom"] = data.get("nom", "Trajet sans nom")
    data["genre_autorise"] = data.get("genre_autorise", "Tous")
    data["heure_souhaitee"] = data.get("heure_souhaitee")
    data["message_trajet"] = data.get("message_trajet", "")
    trajets.append(data)
    sauvegarder_trajets(trajets)
    return jsonify({"ok": True, "reçu": data})

@app.route("/update_position", methods=["POST"])
def update_position():
    trajets = charger_trajets()
    data = request.get_json()

    id_modif = data.get("id")
    user_id = data.get("user_id")
    new_pos = data.get("position")

    trouve = False
    for t in trajets:
        if t["id"] == id_modif:
            if t["user_id"] != user_id:
                return jsonify({"ok": False, "error": "Not your trajet"}), 403
            t["position"] = new_pos
            trouve = True

    if not trouve:
        return jsonify({"ok": False, "error": "Trajet introuvable"}), 404
    
    sauvegarder_trajets(trajets)
    return jsonify({"ok": True})

@app.route("/supprimer", methods=["POST"])
def supprimer():
    trajets = charger_trajets()
    data = request.get_json()
    id_a_supprimer = data.get("id")
    user_request = data.get("user_id")

    nouveaux = []
    for t in trajets:
        if t["id"] == id_a_supprimer and t["user_id"] != user_request:
            return jsonify({"ok": False, "error": "Not your trajet"}), 403
        
        if t["id"] != id_a_supprimer:
            nouveaux.append(t)

    sauvegarder_trajets(nouveaux)
    return jsonify({"ok": True})

@app.route("/aide/proposer", methods=["POST"])
def proposer_aide():
    trajets = charger_trajets()
    data = request.get_json()
    numero = data.get("tel")
    tel_chiffre = chiffre(numero) if numero else None

    id_trajet = data["trajet_id"]

    for t in trajets:
        if t["id"] == id_trajet:
            if t["etat_aide"] in ["closed"]:
                return jsonify({"ok": False, "error": "Aide impossible"}), 403
            nb_aides_user = sum(1 for a in t["aides"] if a["user_id"] == data["user_id"])
            if nb_aides_user >= 3:
                return jsonify({"ok": False, "error": "Tu as déjà envoyé 3 propositions d'aide pour ce trajet"}), 403
            if t["user_id"] == data["user_id"]:
                return jsonify({"ok": False, "error": "Impossible d'aider ton propre trajet"}), 403
            if not t.get("besoin_aide", True):
                return jsonify({"ok": False, "error": "Cette personne n'a actuellement plus besoin d'aide"}), 403
            prenom = data.get("prenom", "").strip() or "Sans prénom"
            pseudo = data.get("pseudo", "").strip() or "Anonyme"
            aide = {
                "id_aide": str(uuid.uuid4()),
                "user_id": data["user_id"],
                "pseudo": pseudo,
                "heure": data.get("heure"),
                "message": data.get("message", "")[:500],
                "prenom": prenom,
                "sexe": data.get("sexe"),
                "etat": "en_attente",
                "heure_envoi": datetime.now().isoformat(),
                "tel": tel_chiffre
            }

            t["aides"].append(aide)
            t["etat_aide"] = "waiting"

            sauvegarder_trajets(trajets)
            return jsonify({"ok": True})
    
    return jsonify({"ok": False, "error": "trajet introuvable"}), 404

if __name__ == "__main__":
    app.run(host="0.0.0.0", debug=True)
