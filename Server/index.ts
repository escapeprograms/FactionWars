import path from "node:path";
import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

import { socketTable, generateClientId } from "./users.js"
import { isValidName } from "../Client/functions.js";
import { createLobby, joinLobby, filterLobby, lobbyTable } from "./lobby.js";
import { SocketState, Faction, Game, Player } from "./types.js";

const clientPath = path.resolve("Client")
console.log("Serving static from " + clientPath);

const app = express();
app.use(express.static(clientPath))

const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket: Socket) => {
    // Add socket to socketTable
    if (!socket.recovered && (socketTable[socket.id] !== undefined)) {
        // Duplicate socket id
        socket.emit("dup-id");
        socket.disconnect(true);
    } else {
        if (!socketTable[socket.id]) {
            // Add socket to the table
            socketTable[socket.id] = {
                state: SocketState.Menu,
                clientId: generateClientId(),
                info: undefined
            }
        } // else, should be a recovered user already in the table
    }
    socket.on("disconnect", (reason)=> {
        // For now, we don't care about the reason
        const sock = socketTable[socket.id];
        if (sock) {
            // if (sock.state === SocketState.Menu) // Nothing to do here
            if (sock.state === SocketState.Lobby) {
                // Remove player from lobby
                const {player, game} = sock.info!;
                game.players = game.players.filter(x => x.id !== socket.id);
                if (game.players.length === 0) {
                    // Close lobby if lobby is empty
                    delete lobbyTable[game.id];
                } else {
                    socket.to(game.id).emit("player-left-lobby", sock.clientId);
                }
            } else if (sock.state === SocketState.Game) {
                // const {player, game} = sock.info as {game: Game, player: Player};
                // Do other stuff here as appropriate
                // emit "player-left-game", sock.clientId
            } // Else, well, something's weird
            delete socketTable[socket.id];
        } // Else, socket not in table, whatever
    });
    socket.on("create-game", (name) => {
        if (isValidName(name)) {
            const player: Player = {
                id: socket.id,
                name: name,
                faction: "T" as Faction,
                team: 0,
                playerInfo: undefined
            };
            const lobby = createLobby(player);
            socketTable[socket.id].state = SocketState.Lobby;
            socketTable[socket.id].info = {player: player, game: lobby};
            socket.join(lobby.id);
            socket.emit("joined-lobby", filterLobby(lobby));
            // Not emitting new-join because there shouldn't be anyone else in the lobby
        }
        else {
            socket.emit("create-error", "invalid-name");
        }
    });
    socket.on("join-game", (name, lobbyId) => {
        if (isValidName(name)) {
            const player: Player = {
                id: socket.id,
                name: name,
                faction: "T",
                team: 0,
                playerInfo: undefined
            }
            const result = joinLobby(player, lobbyId);
            if (result.isSuccessful) {
                const lobby = result.value as Game;
                socketTable[socket.id].state = SocketState.Lobby;
                socketTable[socket.id].info = {player: player, game: lobby};
                socket.join(lobby.id);
                socket.emit("joined-lobby", filterLobby(lobby))
                socket.to(lobbyId).emit("new-join", {name:name, clientId:socketTable[socket.id].clientId});
            } else {
                socket.emit("join-error", result.value);
            }
        } else {
            socket.emit("join-error", "invalid-name");
        }
    });
    socket.on("change-team", () => {
        const sock = socketTable[socket.id];
        if (!sock || sock.state !== SocketState.Lobby) {
            socket.emit("team-change-error", "invalid-state")
        } else {
            const {player, game} = sock.info!;
            player.team = 1 - player.team;
            socket.emit("team-change-success", player.team);
            socket.to(game.id).emit("team-change", { clientId: sock.clientId, team: player.team });
        }
    });
    socket.on("change-faction", (faction) => {
        const sock = socketTable[socket.id];
        if (!sock || sock.state !== SocketState.Lobby) {
            socket.emit("faction-change-error", "invalid-state")
        } else if (!(faction === "T" || faction === "M" || faction === "S" || faction === "A")) {
            socket.emit("faction-change-error", "invalid-faction")
        } else {
            const {player, game} = sock.info!;
            /*
            // Check that the faction is not the same as the current faction
            if (faction !== user.faction) {
                user.faction = faction;
                socket.emit("faction-change-success", faction);
                socket.to(lobby.id).emit("faction-change", { clientId: sock.clientId, faction: user.faction });
            } else {
                socket.emit("faction-change-error", "same-faction");
            }
            */
            // Allow change to same faction
            player.faction = faction;
            socket.emit("faction-change-success", faction);
            socket.to(game.id).emit("faction-change", { clientId: sock.clientId, faction: player.faction });
        }
    });
})

server.on("error", (e: string) => {
    console.log("Server error: " + e);
    server.close();
});
  
server.listen(3000, () => {
    console.log("HI, starting server...");
});