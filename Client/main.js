import { isValidName } from "./functions.js";

const socket = io();

let myId;
socket.on("id", id => myId = id);

const game = document.getElementById("game");
const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

// see https://developer.mozilla.org/en-US/docs/Web/API/CanvasRenderingContext2D
context.font = "20px sans-serif";
context.textAlign = "center";
context.textBaseline = "middle";

// parameters x and y represent top left corner unless specified otherwise

class Rect {
    constructor(x, y, width, height, color = "white") {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.color = color;
    }

    draw() {
        context.fillStyle = this.color;
        context.fillRect(this.x, this.y, this.width, this.height);
    }
}

class Text {
    // x and y represent center
    constructor(x, y, text, fontSize = 20) {
        this.x = x;
        this.y = y;
        this.text = text;
        this.fontSize = fontSize;
    }

    draw() {
        context.fillStyle = "black";
        context.font = this.fontSize + "px sans-serif";
        context.fillText(this.text, this.x, this.y);
    }
}

class HtmlUiElement {
    constructor(element) {
        this.element = element;
        this.drawn = false;
    }

    draw() {
        if (!this.drawn) {
            game.appendChild(this.element);
            this.drawn = true;
        }
    }

    clear() {
        if (this.drawn) {
            game.removeChild(this.element);
            this.drawn = false;
        }
    }
}

class Composite {
    constructor(elems) {
        this.elems = elems;
    }

    draw() {
        for (const elem of this.elems) {
            if ("draw" in elem) {
                elem.draw();
            }
        }
    }

    clear() {
        for (const elem of this.elems) {
            if ("clear" in elem) {
                elem.clear();
            }
        }
    }
}

function background(color = "lightgray") {
    return new Rect(0, 0, canvas.width, canvas.height, color);
}

function button(x, y, width, height, text, callback) {
    const button = document.createElement("button");
    // button.type = "button";
    button.style.position = "absolute";
    button.style.left = x + "px";
    button.style.top = y + "px";
    button.style.width = width + "px";
    button.style.height = height + "px";
    button.style.font = "20px sans-serif";
    button.innerText = text;
    button.addEventListener("click", callback);
    return new HtmlUiElement(button);
}

function textInput(x, y, length, label, callback) {
    const input = document.createElement("input");
    input.style.position = "absolute";
    input.style.left = x + "px";
    input.style.top = y + "px";
    input.style.font = "20px sans-serif";
    input.size = length;
    input.placeholder = label;
    input.addEventListener("keydown", event => {
        if (event.key === "Enter") {
            callback(input.value);
        }
    });
    return new HtmlUiElement(input);
}

function switchTo(newScreen) {
    screen.clear();
    newScreen.draw();
    screen = newScreen;
}

const mainMenu = new Composite([
    background(),
    button(300, 200, 200, 50, "Create", () => switchTo(createPrompt)),
    button(300, 350, 200, 50, "Join", () => switchTo(joinPrompt)),
]);

const createPrompt = new Composite([
    background(),
    textInput(300, 300, 10, "Name", createLobby),
]);

const joinPrompt = (() => {
    const onEnter = () => joinLobby(nameInput.element.value, codeInput.element.value.toUpperCase()); // also a string
    const nameInput = textInput(300, 200, 10, "Name", onEnter);
    const codeInput = textInput(300, 400, 10, "Code", onEnter);
    return new Composite([
        background(),
        nameInput,
        codeInput
    ]);
})();

// for now lobby player list is global so it will persist between lobby screens
let players = [];
const redList = teamList();
const blueList = teamList();

function teamList() {
    const list = document.createElement("ul");
    list.style.font = "20px sans-serif";
    return list;
}

function updateUI() {
    redList.innerHTML = "";
    blueList.innerHTML = "";
    for (const player of players) {
        const list = player.team === 0 ? redList : blueList;
        list.innerHTML += `<li>${player.faction} ${player.name}</li>`;
    }
}

class Player {
    constructor(id, name, faction = "T", team = 0) {
        this.id = id;
        this.name = name;
        this.faction = faction;
        this.team = team;
    }

    changeFaction(faction) {
        this.faction = faction;
        updateUI();
    }

    changeTeam(team) {
        this.team = team;
        updateUI();
    }
}

function teamBox(x, color, list) {
    const box = document.createElement("div");
    box.style.position = "absolute";
    box.style.left = x + "px";
    box.style.top = "130px";
    box.style.width = "385px";
    box.style.height = "400px";
    box.style.border = "solid " + color;
    box.appendChild(list);
    return new HtmlUiElement(box);
}

function switchToLobby(name, lobby, host = false) {
    players = lobby.players.map(player =>
        new Player(player.id, player.name, player.faction, player.team));
    const me = players.find(player => player.id === myId);

    function changeMyFaction(faction) {
        if (me.faction !== faction) {
            me.changeFaction(faction);
            socket.emit("change-faction", faction);
        }
    }

    function changeMyTeam() {
        me.changeTeam(1 - me.team);
        socket.emit("change-team");
    }

    const lobbyScreen = new Composite([
        background(),
        button(10, 10, 50, 50, "T", () => changeMyFaction("T")),
        button(70, 10, 50, 50, "M", () => changeMyFaction("M")),
        button(130, 10, 50, 50, "S", () => changeMyFaction("S")),
        button(190, 10, 50, 50, "A", () => changeMyFaction("A")),
        button(10, 70, 230, 50, "Change Teams", changeMyTeam),
        button(250, 10, 120, 50, "Start Game", () => socket.emit("start-game")),
        new Text(625, 75, lobby.id, 100),
        teamBox(10, "red", redList),
        teamBox(405, "blue", blueList),
    ]);

    switchTo(lobbyScreen);
    updateUI();
}

function createLobby(name) {
    if (!isValidName(name)) {
        console.log("invalid name");
    } else {
        socket.emit("create-game", name);
        socket.once("created-lobby", lobby => {
            console.log(lobby);
            switchToLobby(name, lobby, true);
        });
    }
}

function joinLobby(name, code) {
    if (!isValidName(name)) console.log("invalid name");
    else {
        socket.emit("join-game", name, code);
        socket.once("lobby-join-result", (ok, lobbyOrMessage) => {
            if (!ok) console.log(lobbyOrMessage);
            else {
                console.log(lobbyOrMessage);
                switchToLobby(name, lobbyOrMessage);
            }
        });
    }
}

socket.on("new-join", ({clientId, name, faction, team}) => {
    players.push(new Player(clientId, name, faction, team));
    updateUI();
});

socket.on("game-start", (data) => {
    console.log("Received 'game-start'!");
    console.log(data);
});

socket.on("player-left-lobby", id => {
    const index = players.findIndex(player => player.id === id);
    // Just in case
    if (index < 0) {
        console.log('ERROR!!!: Received "player-left-lobby" but could not find player!');
    }
    players.splice(index, 1);
    updateUI();
});

socket.on("faction-change", ({clientId, faction}) => {
    const player = players.find(p => p.id === clientId);
    if (!player) {
        console.log('ERROR!!!: Received "faction-change" but could not find player!');
    }
    player.changeFaction(faction);
});

socket.on("team-change", ({clientId, team}) => {
    const player = players.find(p => p.id === clientId);
    if (!player) {
        console.log('ERROR!!!: Received "team-change" but could not find player!');
    }    
    player.changeTeam(team);
});

let screen = mainMenu;
screen.draw();