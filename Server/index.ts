import { Socket } from "socket.io";

const http = require("http");
const express = require("express");
const socketio = require("socket.io");

const clientPath = __dirname + "/../../Client";
console.log("Serving static from " + clientPath);

const app = express();
app.use(express.static(clientPath))

const server = http.createServer(app);
const io = socketio(server);

io.on("connection", (socket: Socket) => {
    socket.emit("message","You are connected!"); // send a msg to client
    socket.on("card", (data) => {

    }); // when the client sends an event to u
    socket.on("newUnit", (data) => {

    });
    socket.on("test",(data:string) => {
        console.log("string");
    })
})

//server stuff
server.on("error",(e: string)=>{
    console.log("Server error: "+ e);
    server.close();
  });
  
  server.listen(3000, ()=>{
    console.log("HI, starting server...");
  });