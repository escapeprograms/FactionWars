class Game {
    private players: Player[] = [];
    private turn: Team = 0;
    private id: string;
    private field: Tile[] = [];

    constructor (lobby: Lobby) {
        //this.id = lobby.id;
        this.id = lobby.id;
        lobby.users.forEach((data: User) => {
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
}