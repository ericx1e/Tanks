const express = require('express');
const http = require('http');
const cors = require('cors');

const app = express();
const server = http.createServer(app);

app.use(cors({ origin: true }));
app.use(express.static('public'));

const io = require('socket.io')(server, {
    cors: {
        origin: true,
        methods: ['GET', 'POST']
    }
});

const players = {}; // Object to store all players

io.on('connection', (socket) => {
    console.log(`Player connected: ${socket.id}`);

    // Add the new player to the players object
    players[socket.id] = {
        id: socket.id,
        x: Math.random() * 800, // Random initial position
        y: Math.random() * 600,
        angle: 0
    };

    // Broadcast the updated players object to all clients
    io.emit('updatePlayers', players);

    console.log('Players after connection:', players);

    // Handle player disconnection
    socket.on('disconnect', () => {
        console.log(`Player disconnected: ${socket.id}`);

        // Remove the player from the players object
        delete players[socket.id];

        // Broadcast the updated players object to all clients
        io.emit('updatePlayers', players);

        console.log('Players after disconnection:', players);
    });

    // Handle player movement updates
    socket.on('playerMove', (data) => {
        if (players[socket.id]) {
            players[socket.id].x = data.x;
            players[socket.id].y = data.y;
            players[socket.id].angle = data.angle;

            // Broadcast the updated players object to all clients
            io.emit('updatePlayers', players);
        }
    });
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
    console.log(`Server is running on port ${PORT}`);
});
