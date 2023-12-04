import path from "node:path";
import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

import { socketTable, generateClientId } from "./users.js"
import { isValidName } from "../Client/functions.js";
import { createLobby, joinLobby, filterLobby, lobbyTable, verifyLobby } from "./lobby.js";
import { SocketState, Faction, Game, Player } from "./types.js";
import { PlayerInfo, GameState } from "./game.js"

const clientPath = path.resolve("Client")
console.log("Serving static from " + clientPath);

const app = express();
app.use(express.static(clientPath))

const server = http.createServer(app);
const io = new Server(server);

io.on("connection", (socket: Socket) => {
    console.log("New connection: " + socket.id);//
    // Add socket to socketTable
    if (!socket.recovered && (socketTable[socket.id] !== undefined)) {
        // Duplicate socket id
        socket.emit("dup-id");
        socket.disconnect(true);
    } else {
        if (!socketTable[socket.id]) {
            const clientId = generateClientId();
            // Add socket to the table
            socketTable[socket.id] = {
                state: SocketState.Menu,
                clientId: clientId,
                info: undefined
            }
            socket.emit("id", clientId);
        } // else, should be a recovered user already in the table
    }
    // This event is for testing only
    socket.on("test", (data)=> {
        const mkPlayer = () => ({id: 'a', name: 'a', faction: "T" as Faction, team: 0, playerInfo: undefined});
        const a = new GameState([mkPlayer(), mkPlayer(), mkPlayer(), mkPlayer()]);
        console.log(a);
    });
    socket.on("disconnect", (reason)=> {
        console.log(socket.id + " has disconnected.");//
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
                // TODO
                // const {player, game} = sock.info as {game: Game, player: Player};
                // Do other stuff here as appropriate
                // emit "player-left-game", sock.clientId
            } // Else, well, something's weird
            delete socketTable[socket.id];
        } // Else, socket not in table, whatever
    });
    socket.on("create-game", (name) => {
        console.log(socket.id + " is trying to create a game");//
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
            socket.emit("created-lobby", filterLobby(lobby));
            // Not emitting new-join because there shouldn't be anyone else in the lobby
            console.log(socket.id + " has created a new game with id: " + lobby.id);//
        }
        else {
            socket.emit("create-error", "invalid-name");
        }
    });
    socket.on("join-game", (name, lobbyId) => {
        console.log(socket.id + " is trying to join a lobby.");//
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
                socket.emit("lobby-join-result", true, filterLobby(lobby))
                socket.to(lobbyId).emit("new-join", {name:name, clientId:socketTable[socket.id].clientId});
                console.log(socket.id + " has successfully joined lobby " + lobby.id + " as " + name);//
            } else {
                socket.emit("lobby-join-result", false, result.value);
            }
        } else {
            socket.emit("join-error", "invalid-name");
        }
    });
    socket.on("change-team", () => {
        console.log(socket.id + " is trying to change their team.");//
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
        console.log(socket.id + " is trying to change their faction.");//
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
            console.log(socket.id + " has changed their faction to: " + faction);//
        }
    });
    socket.on("start-game", ()=> {
        console.log(socket.id + " is trying to start their game.");//
        const sock = socketTable[socket.id];
        if (!sock || sock.state !== SocketState.Lobby) {
            socket.emit("game-start-error", "invalid-state");
        } else {
            const {player, game} = sock.info!;
            // Verify sender is host (might change or remove this part in the future?)
            if (game.players[0] !== player) {
                socket.emit("game-start-error", "not-host");
            } else if(verifyLobby(game)) {
                // Start the game
                game.players.forEach(p=>{
                    p.playerInfo = new PlayerInfo([-1, -1]) // Coordinates will be changed when GameState is constructed
                    socketTable[p.id].state = SocketState.Game; // socketTable[p.id] should never be undefined
                }); 
                game.gameInfo = new GameState(game.players); // Possibly add arguments later
                game.started = true;
                const socks = io.sockets.sockets;
                // Send specialized GameState to each player
                game.players.forEach(p=>socks.get(p.id)?.emit("game-start", game.gameInfo!.clientCopy(p.playerInfo!.self))) // TODO: Test
                console.log(socket.id + " has started game: " + game.id);//
            } else {
                socket.emit("game-start-error", "invalid-lobby");
            }
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