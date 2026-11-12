const socket = io({ reconnectionAttempts: Infinity, reconnectionDelay: 1000 });
let misDatos = {};
let isMaster = false;

function showScreen(id) {
    document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
    document.getElementById(id).classList.add('active');
}

/* =========================================
   MODO 1: LA SETA EXPRESS (Local)
========================================= */
let mazoSeta = [];
let contadorAses = 1;

const reglasSeta = {
    1: "¡AS! Trago Incremental: Te toca beber X trago(s).",
    2: "¡DOS! Tú y los lados: Bebes tú y los dos que tienes al lado.",
    3: "¡TRES! Chicos: Todos los chicos de la mesa beben.",
    4: "¡CUATRO! Chicas: Todas las chicas de la mesa beben.",
    5: "¡CINCO! Yo nunca: Di un «Yo nunca...», quien lo haya hecho bebe.",
    6: "¡SEIS! Categorías: Elige un tema. El primero que falle bebe.",
    7: "¡SIETE! Tocar la nariz: ¡El último que se toque la nariz bebe 2!",
    8: "¡OCHO! Rimadero: Di una palabra. Rima en círculo hasta que alguien falle.",
    9: "¡NUEVE! Compañero: Elige a alguien. Cuando bebas, él bebe.",
    10: "¡CASCADA! Todos empiezan a beber a la vez. No paras hasta que pare el de tu derecha.",
    11: "¡SOTA (Poder del guiño)! Guárdala. Si guiñas a alguien y no te pillan, bebe. Si te pillan, bebes tú.",
    12: "¡CABALLO (Esclavo)! Elige a alguien. Le puedes mandar beber tus tragos hasta el próximo caballo.",
    13: "¡REY (Poner norma)! Inventa una norma global. El que la rompa, bebe.",
    "SETA": "¡TE HA CAÍDO LA SETA! 🍄 BÉBETE EL VASO DEL CENTRO A FONDO BLANCO."
};

function iniciarSeta() {
    showScreen('seta-screen');
    mazoSeta = [];
    contadorAses = 1;
    for (let palo = 0; palo < 4; palo++) {
        for (let num = 1; num <= 13; num++) { mazoSeta.push(num); }
    }
    mazoSeta.push("SETA");
    for (let i = mazoSeta.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [mazoSeta[i], mazoSeta[j]] = [mazoSeta[j], mazoSeta[i]];
    }
    document.getElementById('seta-counter').innerText = `Cartas restantes: ${mazoSeta.length}`;
    prepararSiguienteSeta();
}

function sacarCartaSeta() {
    if (mazoSeta.length === 0) return;
    const cartaObj = document.getElementById('seta-deck');
    const carta = mazoSeta.pop();
    
    if (carta === "SETA") {
        cartaObj.innerHTML = `<div class="card-seta-boom">🍄 BOOM</div>`;
        document.body.style.background = "#ff0000";
    } else {
        cartaObj.innerHTML = `<div class="card-front">${carta}</div>`;
    }

    let textoRegla = reglasSeta[carta];
    if (carta === 1) {
        textoRegla = textoRegla.replace("X", contadorAses);
        contadorAses++;
        if (contadorAses > 16) contadorAses = 1;
    }

    document.getElementById('seta-card-title').innerText = carta === "SETA" ? "¡FIN DEL JUEGO!" : `CARTA: ${carta}`;
    document.getElementById('seta-card-rule').innerText = textoRegla;
    document.getElementById('seta-chivato').classList.remove('hidden');
    document.getElementById('btn-next-seta').classList.remove('hidden');
    cartaObj.onclick = null;
    document.getElementById('seta-counter').innerText = `Cartas restantes: ${mazoSeta.length}`;
}

function prepararSiguienteSeta() {
    const cartaObj = document.getElementById('seta-deck');
    cartaObj.innerHTML = `<div class="card-back">TAP PARA ROBAR</div>`;
    cartaObj.onclick = sacarCartaSeta;
    document.getElementById('seta-chivato').classList.add('hidden');
    document.getElementById('btn-next-seta').classList.add('hidden');
    document.body.style.background = "#1a1a2e";
}

/* =========================================
   MODO 2: LA PIRÁMIDE (Multijugador)
========================================= */
function joinPiramide() {
    const user = document.getElementById('username').value.trim();
    const room = document.getElementById('roomCode').value.toUpperCase().trim();
    if (user && room) {
        document.getElementById('btn-join').disabled = true; // Bloqueo táctil
        socket.emit('joinRoom', { username: user, roomCode: room });
    }
}

// Errores (Ej: Clon detectado)
socket.on('errorMsg', (msg) => {
    document.getElementById('login-error').innerText = msg;
    document.getElementById('btn-join').disabled = false;
});

// Mensajes del servidor (Ej: Reasignación Host)
socket.on('serverMsg', (msg) => {
    const noti = document.getElementById('server-notification');
    noti.innerText = msg;
    noti.classList.remove('hidden');
    setTimeout(() => noti.classList.add('hidden'), 4000);
});

socket.on('joined', ({ roomCode, player, isHost }) => {
    misDatos = player;
    isMaster = isHost;
    document.getElementById('display-room').innerText = roomCode;
    showScreen('piramide-game');
    
    if (isMaster) {
        document.getElementById('master-btn').classList.remove('hidden');
    }
});

// Traspaso de Host automático
socket.on('youAreHost', () => {
    isMaster = true;
    document.getElementById('master-btn').classList.remove('hidden');
});

socket.on('updatePlayers', (players) => {
    const list = document.getElementById('players-list');
    list.innerHTML = '';
    
    // Actualizar mis tragos si he perdido un minijuego
    const yo = players.find(p => p.id === socket.id);
    if(yo) document.getElementById('mis-tragos').innerText = yo.drinks;

    players.forEach(p => {
        list.innerHTML += `<div class="player-tag">${p.name} 🍺 ${p.drinks}</div>`;
    });
});

/* =========================================
   CONTROLES MÁSTER Y FASES
========================================= */
function toggleMasterPanel() {
    document.getElementById('master-panel').classList.toggle('hidden');
}

function masterNextPhase() {
    const btn = document.getElementById('btn-master-action');
    btn.disabled = true; // Anti doble tap (Debounce)
    btn.innerText = "⏳ Cargando...";
    
    socket.emit('nextPhase', { roomCode: document.getElementById('roomCode').value.toUpperCase() });
    
    setTimeout(() => {
        btn.disabled = false;
        btn.innerText = "Siguiente Fase";
    }, 1500);
}

// ¡AQUÍ ESTÁ LA SOLUCIÓN DEL BLOQUEO DE FASE!
socket.on('phaseChanged', (nuevaFase) => {
    const mesa = document.getElementById('mesa-central');
    switch(nuevaFase) {
        case 1:
            mesa.innerHTML = `<h3>Fase 1: Cartas de la Pirámide</h3><p>¡El Máster está destapando las cartas!</p>`;
            break;
        case 2:
            mesa.innerHTML = `<h3>Fase 2: ¡Subasta en Vivo!</h3><p>Preparando la puja...</p>`;
            break;
        case 3:
            mesa.innerHTML = `<h3>Fase 3: ¡Evento de Cefa!</h3><p>Atentos a la norma superior.</p>`;
            break;
        default:
            mesa.innerHTML = `<h3>Siguiente ronda... Fase ${nuevaFase}</h3>`;
            break;
    }
});

/* =========================================
   MENÚ DE PAUSA & MINIJUEGOS
========================================= */
function togglePauseMenu() {
    document.getElementById('pause-modal').classList.toggle('hidden');
}

function launchMinigame(gameType) {
    // Simulamos que juegas contra Pablitou para testear el Coinflip
    const rival = prompt("¿Contra quién quieres apostar 2 tragos? Escribe su nombre:");
    if(rival) {
        const btns = document.querySelectorAll('.btn-minigame');
        btns.forEach(b => b.disabled = true); // Debounce
        
        socket.emit('playMinigame', { 
            roomCode: document.getElementById('roomCode').value.toUpperCase(),
            gameType: gameType,
            player1: misDatos.name,
            player2: rival
        });

        setTimeout(() => btns.forEach(b => b.disabled = false), 2000);
    }
}

socket.on('minigameResult', ({ game, winner, loser, penalty }) => {
    document.getElementById('pause-modal').classList.add('hidden');
    
    const modal = document.getElementById('result-modal');
    document.getElementById('result-title').innerText = `🏆 ${game} 🏆`;
    document.getElementById('result-winner').innerText = `${winner} GANA`;
    document.getElementById('result-loser').innerText = `${loser} se bebe ${penalty} tragos.`;
    
    modal.classList.remove('hidden');
});

function closeResultModal() {
    document.getElementById('result-modal').classList.add('hidden');
}
