import { Socket } from "socket.io";

const http = require("http");
const express = require("express");
const socketio = require("socket.io");
const isValidName = require("../Client/functions.js");

const clientPath = __dirname + "/../../Client";
console.log("Serving static from " + clientPath);

const app = express();
app.use(express.static(clientPath))

const server = http.createServer(app);
const io = socketio(server);

io.on("connection", (socket: Socket) => {
  socket.on("create-game", (name) => {
    if (isValidName(name)) {
      const user: User = {
        id: socket.id,
        name: name,
        faction: "T" as Faction,
        team: 0
      };
      const lobby = createLobby(user);
      socketTable[socket.id] = {
        state:SocketState.Lobby,
        clientId: generateClientId(),
        info: {user: user, lobby: lobby}
      }
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
      const user: User = {
        id: socket.id,
        name: name,
        faction: "T",
        team: 0
      }
      const result = joinLobby(user, lobbyId);
      if (result.isSuccessful) {
        const lobby = result.value as Lobby;
        socketTable[socket.id] = {
          state: SocketState.Lobby,
          clientId: generateClientId(),
          info: {user: user, lobby: lobby}
        }
        socket.join(lobby.id);
        socket.emit("joined-lobby", filterLobby(lobby))
        socket.to(lobbyId).emit("new-join", name);
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
      const {user, lobby} = sock.info as { user: User, lobby: Lobby };
      user.team = 1 - user.team;
      socket.emit("team-change-success", user.team);
      socket.to(lobby.id).emit("team-change", { clientId: sock.clientId, team: user.team });
    }
  });
  socket.on("change-faction", (faction) => {
    const sock = socketTable[socket.id];
    if (!sock || sock.state !== SocketState.Lobby) {
      socket.emit("faction-change-error", "invalid-state")
    } else if (!(faction === "T" || faction === "M" || faction === "S" || faction === "A")) {
        socket.emit("faction-change-error", "invalid-faction")
    } else {
        const {user, lobby} = sock.info as { user: User, lobby: Lobby };
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
        user.faction = faction;
        socket.emit("faction-change-success", faction);
        socket.to(lobby.id).emit("faction-change", { clientId: sock.clientId, faction: user.faction });
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