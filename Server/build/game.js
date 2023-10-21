"use strict";
class Game {
    constructor(lobby) {
        this.players = [];
        this.turn = 0;
        this.field = [];
        //this.id = lobby.id;
        this.id = lobby.id;
        lobby.users.forEach((data) => {
            this.players.push(new Player());
        });
        this.setField();
    }
    setField() {
    }
}
class Player {
}
class Tile {
}
let x = {
    error: true,
    type: "ur bad",
    msg: "please get gud"
};
