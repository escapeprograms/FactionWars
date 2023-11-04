class Game {
    private players: Player[];
    private turn: Team = 0;
    private id: string;
    private field: Tile[][] = [];

    constructor (lobby: Lobby, fieldSize=50) {
        this.id = lobby.id;
        this.players = lobby.users.map((user: User) => {
            // Modify or simplify later as necessary
            return new Player(user.id, user.name, user.faction, user.team);
        });
        this.setField(fieldSize);
    }

    setField(size: number) {
        // Currently assuming square fields only
        for (let i = 0; i < size; i++) {
            const row: Tile[] = [];
            for (let j = 0; j < size; j++) {
                row.push(new Tile());
            }
            this.field.push(row);
        }
    }

    endTurn() {
        // Activate end of turn effects, as applicable
        this.turn = 1 - this.turn;
        // Start new turn? Activate start of turn effects?
    }
}

class Player {
    private id: string; // Server side, this is socketId; client side, this is clientId
    private name: string;
    private faction: Faction;
    private team: Team;
    private cards: Card[] = [];
    constructor(id: string, name: string, faction: Faction, team: Team) {
        this.id = id;
        this.name = name;
        this.faction = faction;
        this.team = team;
    }
}

class Card {
    private name: string
    private type: CardType
    constructor(name: string, type: CardType) {
        this.name = name;
        this.type = type;
    }
}

class Tile {
    // private terrain; // To be implemented later?
    private building: Building | null = null;
    private unit: Unit | null = null;
    hasBuilding() {return this.building === null;}
    hasUnit() {return this.unit === null;}
    // Or should we just make building and unit public?
    getBuilding() {return this.building;}
    getUnit() {return this.unit;}
}

class Unit {

}

class Building {

}

/*let x = {
    error: true,
    type: "ur bad",
    msg: "please get gud"
}*/