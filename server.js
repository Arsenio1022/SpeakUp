const http = require("http");
const fs = require("fs");
const path = require("path");
const WebSocket = require("ws");

const PORT = process.env.PORT || 3000;

const rooms = new Map();


/* =========================================================
   ROOM STRUCTURE
   =========================================================

   room = {
       code,
       host,
       currentRound,
       gameStarted,

       players: {
           player1: {
               id,
               name,
               socket,
               score,
               total,
               position,
               submitted
           },

           player2: {
               id,
               name,
               socket,
               score,
               total,
               position,
               submitted
           }
       }
   }
*/


/* =========================================================
   HTTP SERVER
   ========================================================= */

const server = http.createServer(
    (req, res) => {

        let requestedPath =
            req.url.split("?")[0];

        if (requestedPath === "/") {
            requestedPath = "/index.html";
        }

        const rootDirectory =
            path.resolve(__dirname);

        const filePath =
            path.resolve(
                rootDirectory,
                "." + requestedPath
            );


        /* =================================================
           SECURITY
           ================================================= */

        if (
            filePath !== rootDirectory &&
            !filePath.startsWith(
                rootDirectory + path.sep
            )
        ) {

            res.writeHead(403);

            res.end("Forbidden");

            return;
        }


        /* =================================================
           READ FILE
           ================================================= */

        fs.readFile(
            filePath,
            (error, data) => {

                if (error) {

                    res.writeHead(
                        404,
                        {
                            "Content-Type":
                                "text/plain"
                        }
                    );

                    res.end(
                        "File not found."
                    );

                    return;
                }


                /* =========================================
                   CONTENT TYPE
                   ========================================= */

                let contentType =
                    "text/plain";


                if (
                    filePath.endsWith(".html")
                ) {

                    contentType =
                        "text/html; charset=utf-8";
                }

                else if (
                    filePath.endsWith(".css")
                ) {

                    contentType =
                        "text/css; charset=utf-8";
                }

                else if (
                    filePath.endsWith(".js")
                ) {

                    contentType =
                        "application/javascript; charset=utf-8";
                }

                else if (
                    filePath.endsWith(".json")
                ) {

                    contentType =
                        "application/json; charset=utf-8";
                }

                else if (
                    filePath.endsWith(".png")
                ) {

                    contentType =
                        "image/png";
                }

                else if (
                    filePath.endsWith(".jpg") ||
                    filePath.endsWith(".jpeg")
                ) {

                    contentType =
                        "image/jpeg";
                }

                else if (
                    filePath.endsWith(".svg")
                ) {

                    contentType =
                        "image/svg+xml";
                }


                /* =========================================
                   SEND FILE
                   ========================================= */

                res.writeHead(
                    200,
                    {
                        "Content-Type":
                            contentType
                    }
                );

                res.end(data);
            }
        );
    }
);


/* =========================================================
   WEBSOCKET SERVER
   ========================================================= */

const wss =
    new WebSocket.Server({
        server
    });


/* =========================================================
   UTILITY FUNCTIONS
   ========================================================= */

function send(socket, data) {

    if (
        socket &&
        socket.readyState ===
            WebSocket.OPEN
    ) {

        socket.send(
            JSON.stringify(data)
        );
    }
}


function broadcastRoom(room, data) {

    if (!room) {
        return;
    }


    send(
        room.host,
        data
    );


    send(
        room.players.player1?.socket,
        data
    );


    send(
        room.players.player2?.socket,
        data
    );
}


function generateRoomCode() {

    const characters =
        "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

    let code;


    do {

        code = "";


        for (
            let i = 0;
            i < 4;
            i++
        ) {

            code +=
                characters[
                    Math.floor(
                        Math.random() *
                        characters.length
                    )
                ];
        }


    } while (
        rooms.has(code)
    );


    return code;
}


function generatePlayerId() {

    return (
        "player_" +
        Date.now() +
        "_" +
        Math.random()
            .toString(36)
            .substring(2, 9)
    );
}


function getPublicPlayer(player) {

    if (!player) {
        return null;
    }


    return {

        id:
            player.id,

        name:
            player.name,

        score:
            player.score,

        total:
            player.total,

        position:
            player.position,

        submitted:
            player.submitted
    };
}


function getPublicRoomState(room) {

    return {

        roomCode:
            room.code,

        currentRound:
            room.currentRound,

        gameStarted:
            room.gameStarted,

        players: {

            player1:
                getPublicPlayer(
                    room.players.player1
                ),

            player2:
                getPublicPlayer(
                    room.players.player2
                )
        }
    };
}


function calculateMovement(score) {

    if (score >= 90) {
        return 70;
    }


    if (score >= 80) {
        return 50;
    }


    if (score >= 70) {
        return 30;
    }


    if (score >= 60) {
        return 15;
    }


    return 5;
}


/* =========================================================
   WEBSOCKET CONNECTION
   ========================================================= */

wss.on(
    "connection",
    (socket) => {

        console.log(
            "Client connected."
        );


        socket.roomCode = null;

        socket.role = null;

        socket.playerId = null;

        socket.playerSlot = null;


        /* =================================================
           MESSAGE HANDLER
           ================================================= */

        socket.on(
            "message",
            (rawMessage) => {

                let message;


                /* =========================================
                   PARSE MESSAGE
                   ========================================= */

                try {

                    message =
                        JSON.parse(
                            rawMessage.toString()
                        );

                }

                catch (error) {

                    send(
                        socket,
                        {
                            type:
                                "ERROR",

                            message:
                                "Invalid message received."
                        }
                    );

                    return;
                }


                /* =================================================
                   CREATE ROOM
                   ================================================= */

                if (
                    message.type ===
                    "CREATE_ROOM"
                ) {

                    const name =
                        String(
                            message.name || ""
                        ).trim();


                    if (!name) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "Host name is required."
                            }
                        );

                        return;
                    }


                    if (
                        socket.roomCode
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "You are already inside a room."
                            }
                        );

                        return;
                    }


                    const roomCode =
                        generateRoomCode();


                    const room = {

                        code:
                            roomCode,

                        host:
                            socket,

                        currentRound:
                            0,

                        gameStarted:
                            false,

                        players: {

                            player1:
                                null,

                            player2:
                                null
                        }
                    };


                    rooms.set(
                        roomCode,
                        room
                    );


                    socket.roomCode =
                        roomCode;

                    socket.role =
                        "host";

                    socket.hostName =
                        name;


                    console.log(
                        `Room ${roomCode} created by ${name}`
                    );


                    send(
                        socket,
                        {
                            type:
                                "ROOM_CREATED",

                            roomCode:
                                roomCode,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    return;
                }


                /* =================================================
                   JOIN ROOM
                   ================================================= */

                if (
                    message.type ===
                    "JOIN_ROOM"
                ) {

                    const roomCode =
                        String(
                            message.roomCode || ""
                        )
                        .trim()
                        .toUpperCase();


                    const name =
                        String(
                            message.name || ""
                        ).trim();


                    if (
                        !roomCode ||
                        !name
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "Name and game code are required."
                            }
                        );

                        return;
                    }


                    if (
                        socket.roomCode
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "You are already inside a room."
                            }
                        );

                        return;
                    }


                    const room =
                        rooms.get(
                            roomCode
                        );


                    if (!room) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "Game room not found."
                            }
                        );

                        return;
                    }


                    if (
                        room.gameStarted
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "This game has already started."
                            }
                        );

                        return;
                    }


                    if (
                        room.players.player1 &&
                        room.players.player2
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "This game already has two participants."
                            }
                        );

                        return;
                    }


                    const playerId =
                        generatePlayerId();


                    let slot;


                    if (
                        !room.players.player1
                    ) {

                        slot =
                            "player1";

                    }

                    else {

                        slot =
                            "player2";
                    }


                    room.players[slot] = {

                        id:
                            playerId,

                        name:
                            name,

                        socket:
                            socket,

                        score:
                            0,

                        total:
                            0,

                        position:
                            0,

                        submitted:
                            false
                    };


                    socket.roomCode =
                        roomCode;

                    socket.role =
                        "participant";

                    socket.playerId =
                        playerId;

                    socket.playerSlot =
                        slot;


                    console.log(
                        `${name} joined room ${roomCode} as ${slot}`
                    );


                    send(
                        socket,
                        {
                            type:
                                "JOINED_ROOM",

                            roomCode:
                                roomCode,

                            playerId:
                                playerId,

                            playerSlot:
                                slot,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    broadcastRoom(
                        room,
                        {
                            type:
                                "ROOM_UPDATED",

                            roomCode:
                                roomCode,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    return;
                }


                /* =================================================
                   HOST START GAME
                   ================================================= */

                if (
                    message.type ===
                    "START_GAME"
                ) {

                    const room =
                        rooms.get(
                            socket.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    if (
                        socket.role !==
                        "host"
                    ) {
                        return;
                    }


                    if (
                        !room.players.player1 ||
                        !room.players.player2
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "Two participants are required."
                            }
                        );

                        return;
                    }


                    room.currentRound =
                        1;

                    room.gameStarted =
                        true;


                    room.players.player1.score =
                        0;

                    room.players.player1.total =
                        0;

                    room.players.player1.position =
                        0;

                    room.players.player1.submitted =
                        false;


                    room.players.player2.score =
                        0;

                    room.players.player2.total =
                        0;

                    room.players.player2.position =
                        0;

                    room.players.player2.submitted =
                        false;


                    broadcastRoom(
                        room,
                        {
                            type:
                                "GAME_STARTED",

                            round:
                                1,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    console.log(
                        `Room ${room.code} started.`
                    );


                    return;
                }


                /* =================================================
                   PLAYER SUBMITS ANSWER
                   ================================================= */

                if (
                    message.type ===
                    "ANSWER_SUBMITTED"
                ) {

                    const room =
                        rooms.get(
                            socket.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    if (
                        socket.role !==
                        "participant"
                    ) {
                        return;
                    }


                    const player =
                        room.players[
                            socket.playerSlot
                        ];


                    if (!player) {
                        return;
                    }


                    if (
                        player.submitted
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "You already submitted this round."
                            }
                        );

                        return;
                    }


                    let score =
                        Number(
                            message.score
                        );


                    if (
                        !Number.isFinite(
                            score
                        )
                    ) {

                        score =
                            0;
                    }


                    score =
                        Math.round(
                            Math.max(
                                0,
                                Math.min(
                                    100,
                                    score
                                )
                            )
                        );


                    const movement =
                        calculateMovement(
                            score
                        );


                    player.score =
                        score;

                    player.total +=
                        score;

                    player.position +=
                        movement;

                    player.submitted =
                        true;


                    console.log(
                        `${player.name} scored ${score}/100 in room ${room.code}`
                    );


                    broadcastRoom(
                        room,
                        {
                            type:
                                "SCORE_UPDATE",

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    return;
                }


                /* =================================================
                   HOST STARTS NEXT ROUND
                   ================================================= */

                if (
                    message.type ===
                    "NEXT_ROUND"
                ) {

                    const room =
                        rooms.get(
                            socket.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    if (
                        socket.role !==
                        "host"
                    ) {
                        return;
                    }


                    if (
                        !room.gameStarted
                    ) {
                        return;
                    }


                    if (
                        !room.players.player1 ||
                        !room.players.player2
                    ) {
                        return;
                    }


                    if (
                        !room.players.player1.submitted ||
                        !room.players.player2.submitted
                    ) {

                        send(
                            socket,
                            {
                                type:
                                    "ERROR",

                                message:
                                    "Both participants must submit their answers first."
                            }
                        );

                        return;
                    }


                    const requestedRound =
                        Number(
                            message.round
                        );


                    if (
                        !Number.isInteger(
                            requestedRound
                        ) ||
                        requestedRound < 1 ||
                        requestedRound > 20
                    ) {

                        return;
                    }


                    if (
                        requestedRound !==
                        room.currentRound + 1
                    ) {

                        return;
                    }


                    room.currentRound =
                        requestedRound;


                    room.players.player1.score =
                        0;

                    room.players.player1.submitted =
                        false;


                    room.players.player2.score =
                        0;

                    room.players.player2.submitted =
                        false;


                    broadcastRoom(
                        room,
                        {
                            type:
                                "NEXT_ROUND",

                            round:
                                room.currentRound,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    console.log(
                        `Room ${room.code} moved to round ${room.currentRound}.`
                    );


                    return;
                }


                /* =================================================
                   GAME FINISHED
                   ================================================= */

                if (
                    message.type ===
                    "GAME_FINISHED"
                ) {

                    const room =
                        rooms.get(
                            socket.roomCode
                        );


                    if (!room) {
                        return;
                    }


                    if (
                        socket.role !==
                        "host"
                    ) {
                        return;
                    }


                    room.gameStarted =
                        false;


                    broadcastRoom(
                        room,
                        {
                            type:
                                "GAME_FINISHED",

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );


                    console.log(
                        `Room ${room.code} finished.`
                    );


                    return;
                }


                /* =================================================
                   PING
                   ================================================= */

                if (
                    message.type ===
                    "PING"
                ) {

                    send(
                        socket,
                        {
                            type:
                                "PONG"
                        }
                    );

                    return;
                }

            }
        );


        /* =====================================================
           DISCONNECT
           ===================================================== */

        socket.on(
            "close",
            () => {

                console.log(
                    "Client disconnected."
                );


                const roomCode =
                    socket.roomCode;


                if (!roomCode) {
                    return;
                }


                const room =
                    rooms.get(
                        roomCode
                    );


                if (!room) {
                    return;
                }


                /* =============================================
                   HOST LEFT
                   ============================================= */

                if (
                    socket.role ===
                    "host"
                ) {

                    broadcastRoom(
                        room,
                        {
                            type:
                                "HOST_DISCONNECTED"
                        }
                    );


                    rooms.delete(
                        roomCode
                    );


                    console.log(
                        `Room ${roomCode} closed because host left.`
                    );


                    return;
                }


                /* =============================================
                   PARTICIPANT LEFT
                   ============================================= */

                if (
                    socket.role ===
                        "participant" &&
                    socket.playerSlot
                ) {

                    const player =
                        room.players[
                            socket.playerSlot
                        ];


                    if (player) {

                        console.log(
                            `${player.name} left room ${roomCode}.`
                        );
                    }


                    room.players[
                        socket.playerSlot
                    ] = null;


                    broadcastRoom(
                        room,
                        {
                            type:
                                "PLAYER_DISCONNECTED",

                            playerId:
                                socket.playerId,

                            playerSlot:
                                socket.playerSlot,

                            state:
                                getPublicRoomState(
                                    room
                                )
                        }
                    );
                }

            }
        );

    }
);


/* =========================================================
   START SERVER
   ========================================================= */

server.listen(
    PORT,
    "0.0.0.0",
    () => {

        console.log("");

        console.log(
            "================================="
        );

        console.log(
            "          SPEAKUP SERVER"
        );

        console.log(
            "================================="
        );

        console.log("");

        console.log(
            `Local:   http://localhost:${PORT}`
        );

        console.log("");

        console.log(
            "Public access:"
        );

        console.log(
            "Use Cloudflare Tunnel:"
        );

        console.log("");

        console.log(
            "cloudflared tunnel --url http://localhost:3000"
        );

        console.log("");

        console.log(
            "================================="
        );

        console.log("");
    }
);