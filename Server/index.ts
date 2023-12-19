import path from "node:path";
import http from "http";
import express from "express";
import { Server, Socket } from "socket.io";

import { socketTable, generateClientId } from "./users.js"
import { isValidName } from "../Client/functions.js";
import { TURN_LENGTH } from "../Client/constants.js";
import { createLobby, joinLobby, filterLobby, lobbyTable, verifyLobby } from "./lobby.js";
import { SocketState, Faction, Lobby, Player, SocketInfo, GameState, PlayerInfo, PlayerArr, SocketEvent } from "./types.js";
import { isCoord, doubleIt } from "./utility.js";

const clientPath = path.resolve("Client")
console.log("Serving static from " + clientPath);

const app = express();
app.use(express.static(clientPath))

const server = http.createServer(app);
const io = new Server(server);
const sockets = io.sockets.sockets; // Maps socketids to sockets

io.on("connection", (socket: Socket) => {
    function checkState(sock: SocketInfo, state: SocketState): boolean {
        if (!sock) return false;
        if (sock.state !== state) {
            socket.emit("state-error"); // If needed, can specify the needed state
            return false;
        }
        return true;
    }

    function sendEvents(events: PlayerArr<SocketEvent[]>, game: GameState) {
        // Assumes 2 teams and 2 players per team
        doubleIt((i, j) => {
            const s = sockets.get(game.players[i][j].id);
            events[i][j].forEach(e => s?.emit(e.event, e.params));
        }, 0, 2, 0, 2);
    }

    function startTurn(game: GameState) {
        const events = game.startTurn();
        game.timerID = setTimeout(() => endTurn(game), TURN_LENGTH);
        sendEvents(events, game);
    }

    function endTurn(game: GameState) {
        clearTimeout(game.timerID);
        const events = game.endTurn();
        sendEvents(events, game);
        startTurn(game);
    }


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
                const {player, lobby} = sock.info!;
                lobby.players = lobby.players.filter(x => x.id !== socket.id);
                if (lobby.players.length === 0) {
                    // Close lobby if lobby is empty
                    delete lobbyTable[lobby.id];
                } else {
                    socket.to(lobby.id).emit("player-left-lobby", sock.clientId);
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
        const sock = socketTable[socket.id];
        if (!checkState(sock, SocketState.Menu)) return;
        if (isValidName(name)) {
            const player: Player = {
                id: socket.id,
                name: name,
                faction: "T" as Faction,
                team: 0,
                playerInfo: undefined
            };
            const lobby = createLobby(player);
            sock.state = SocketState.Lobby;
            sock.info = {player: player, lobby: lobby};
            socket.join(lobby.id);
            socket.emit("created-lobby", filterLobby(lobby));
            // Not emitting new-join because there shouldn't be anyone else in the lobby
            console.log(socket.id + " has created a new game with id: " + lobby.id);//
        }
        else {
            // This should not happen from a regular client, as the client should have filtered already
            socket.emit("create-error", "invalid-name");
        }
    });
    socket.on("join-game", (name, lobbyId) => {
        console.log(socket.id + " is trying to join a lobby.");//
        const sock = socketTable[socket.id];
        if (!checkState(sock, SocketState.Menu)) return;
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
                const lobby = result.value as Lobby;
                socketTable[socket.id].state = SocketState.Lobby;
                socketTable[socket.id].info = {player: player, lobby: lobby};
                socket.join(lobby.id);
                socket.emit("lobby-join-result", true, filterLobby(lobby))
                socket.to(lobbyId).emit("new-join", {name:name, clientId:socketTable[socket.id].clientId});
                console.log(socket.id + " has successfully joined lobby " + lobby.id + " as " + name);//
            } else {
                socket.emit("lobby-join-result", false, result.value);
            }
        } else {
            // This should not happen from a regular client, as the client should have filtered already
            socket.emit("join-error", "invalid-name");
        }
    });
    socket.on("change-team", () => {
        console.log(socket.id + " is trying to change their team.");//
        const sock = socketTable[socket.id];
        if(checkState(sock, SocketState.Lobby)) {
            const {player, lobby} = sock.info!;
            player.team = 1 - player.team;
            socket.emit("team-change-success", player.team);
            socket.to(lobby.id).emit("team-change", { clientId: sock.clientId, team: player.team });
        }
    });
    socket.on("change-faction", (faction) => {
        console.log(socket.id + " is trying to change their faction.");//
        const sock = socketTable[socket.id];
        if (!checkState(sock, SocketState.Lobby)) {
            return;
        } if (!(faction === "T" || faction === "M" || faction === "S" || faction === "A")) {
            // This should not happen from a regular client, as the client should have filtered already
            socket.emit("faction-change-error", "invalid-faction")
        } else {
            const {player, lobby} = sock.info!;
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
            socket.to(lobby.id).emit("faction-change", { clientId: sock.clientId, faction: player.faction });
            console.log(socket.id + " has changed their faction to: " + faction);//
        }
    });
    socket.on("start-game", ()=> {
        console.log(socket.id + " is trying to start their game.");//
        const sock = socketTable[socket.id];
        if(checkState(sock, SocketState.Lobby)) {
            const {player, lobby} = sock.info!;
            // Verify sender is host (might change or remove this part in the future?)
            if (lobby.players[0] !== player) {
                socket.emit("game-start-error", "not-host"); // Should implement client to check for this first
            } else if(verifyLobby(lobby)) {
                // Start the game
                lobby.players.forEach(p=>{
                    p.playerInfo = new PlayerInfo([-1, -1]) // Coordinates will be changed when GameState is constructed
                    socketTable[p.id].state = SocketState.Game; // socketTable[p.id] should never be undefined
                }); 
                lobby.gameInfo = new GameState(lobby.players); // Possibly add arguments later
                lobby.started = true;
                // Send specialized GameState to each player
                lobby.players.forEach(p=>sockets.get(p.id)?.emit("game-start", lobby.gameInfo!.clientCopy(p.playerInfo!.self)));
                console.log(socket.id + " has started game: " + lobby.id);//
                startTurn(lobby.gameInfo);
            } else {
                // Should we have the client filter this first?
                socket.emit("game-start-error", "invalid-lobby");
            }
        }
    });
    socket.on("end-turn", () => {
        console.log(socket.id + " is trying to end their turn.");//
        const sock = socketTable[socket.id];
        if (checkState(sock, SocketState.Game)) {
            const game = sock.info!.lobby.gameInfo!;
            if (game.end(sock.info!.player.playerInfo!.self)) endTurn(game);
        }
    });
    socket.on("move-unit", (unit, steps) => {
        const sock = socketTable[socket.id];
        if (checkState(sock, SocketState.Game)) {
            // Validate unit and steps types (further verification performed in game.move())
            if (!(isCoord(unit) && Array.isArray(steps) && steps.every(isCoord))) return; // Invalid types
            
            const info = sock.info!;
            const game = info.lobby.gameInfo!;
            const events = game.move(info.player.playerInfo!.self, unit, steps);
            
            // Broadcast events
            doubleIt((i, j) => {
                const s = sockets.get(game.players[i][j].id);
                events[i][j].forEach(e => s?.emit(e.event, e.params));
            }, 0, 2, 0, 2);
        }
    });
    // TODO: Handle attack, play card, special actions, end turn
})

server.on("error", (e: string) => {
    console.log("Server error: " + e);
    server.close();
});
  
server.listen(3000, () => {
    console.log("HI, starting server...");
});