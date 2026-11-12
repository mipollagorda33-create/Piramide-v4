const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
    connectionStateRecovery: {
        maxDisconnectionDuration: 2 * 60 * 1000 // 2 minutos de gracia para reconexiones
    }
});

app.use(express.static(path.join(__dirname, 'public')));

// Memoria del servidor
const rooms = {};

io.on('connection', (socket) => {
    console.log('Usuario conectado:', socket.id);

    // 1. Unirse a sala con comprobación de clones
    socket.on('joinRoom', ({ username, roomCode }) => {
        if (!rooms[roomCode]) {
            rooms[roomCode] = { host: socket.id, players: [], phase: 0, hostTimeout: null };
        }
        
        // Evitar nombres duplicados
        const isDuplicate = rooms[roomCode].players.some(p => p.name.toLowerCase() === username.toLowerCase());
        if (isDuplicate) {
            socket.emit('errorMsg', 'Ese apodo ya está en uso en esta sala. Elige otro.');
            return;
        }

        socket.join(roomCode);
        
        // Si es el primero, es el Máster
        const isHost = rooms[roomCode].players.length === 0;
        if (isHost) rooms[roomCode].host = socket.id;

        const player = { id: socket.id, name: username, isHost, drinks: 0, hand: [] };
        rooms[roomCode].players.push(player);

        socket.emit('joined', { roomCode, player, isHost });
        io.to(roomCode).emit('updatePlayers', rooms[roomCode].players);
    });

    // 2. Control de Fases del Máster sincronizado
    socket.on('nextPhase', ({ roomCode }) => {
        if (rooms[roomCode] && rooms[roomCode].host === socket.id) {
            rooms[roomCode].phase++;
            io.to(roomCode).emit('phaseChanged', rooms[roomCode].phase);
        }
    });

    // 3. Resolución de Minijuegos (Lógica en el servidor)
    socket.on('playMinigame', ({ roomCode, gameType, player1, player2 }) => {
        if (gameType === 'coinflip') {
            const winner = Math.random() > 0.5 ? player1 : player2;
            const loser = winner === player1 ? player2 : player1;
            // Sumamos los tragos al perdedor
            const room = rooms[roomCode];
            if(room) {
                const loserData = room.players.find(p => p.name === loser);
                if(loserData) loserData.drinks += 2;
                io.to(roomCode).emit('updatePlayers', room.players);
            }
            io.to(roomCode).emit('minigameResult', { game: 'Coinflip de la Muerte', winner, loser, penalty: 2 });
        }
    });

    // 4. Gestión de desconexiones y traspaso de Host
    socket.on('disconnect', () => {
        console.log('Usuario desconectado:', socket.id);
        for (const roomCode in rooms) {
            const room = rooms[roomCode];
            const playerIndex = room.players.findIndex(p => p.id === socket.id);
            
            if (playerIndex !== -1) {
                const playerName = room.players[playerIndex].name;
                room.players.splice(playerIndex, 1);
                io.to(roomCode).emit('updatePlayers', room.players);

                // Si el host se va, cuenta atrás de 5s para reasignar corona
                if (room.host === socket.id && room.players.length > 0) {
                    io.to(roomCode).emit('serverMsg', `El Máster (${playerName}) se ha desconectado. Reasignando en 5s...`);
                    
                    room.hostTimeout = setTimeout(() => {
                        if(room.players.length > 0) {
                            room.host = room.players[0].id;
                            io.to(room.host).emit('youAreHost');
                            io.to(roomCode).emit('serverMsg', `👑 ${room.players[0].name} es el nuevo Máster.`);
                        }
                    }, 5000);
                }
            }
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Servidor rodando en http://localhost:${PORT}`);
});
