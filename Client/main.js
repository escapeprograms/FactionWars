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
    constructor(x, y, text) {
        this.x = x;
        this.y = y;
        this.text = text;
    }

    draw() {
        context.fillStyle = "black";
        context.fillText(this.text, this.x, this.y);
    }
}

class ClickBox {
    constructor(x, y, width, height, onClick) {
        this.x = x;
        this.y = y;
        this.width = width;
        this.height = height;
        this.onClick = onClick;
    }

    isInClickZone(event) {
        return this.x <= event.offsetX && event.offsetX <= this.x + this.width &&
               this.y <= event.offsetY && event.offsetY <= this.y + this.height;
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

    isInClickZone(event) {
        return this.elems.some(elem => "isInClickZone" in elem && elem.isInClickZone(event));
    }

    onClick(event) {
        for (const elem of this.elems) {
            if ("isInClickZone" in elem && "onClick" in elem && elem.isInClickZone(event)) {
                elem.onClick(event);
                return;
            }
        }
    }
}

function background(color = "lightgray") {
    return new Rect(0, 0, canvas.width, canvas.height, color);
}

function button(x, y, width, height, text, onClick) {
    const centerX = x + width / 2;
    const centerY = y + height / 2;
    return new Composite([
        new Rect(x, y, width, height),
        new Text(centerX, centerY, text),
        new ClickBox(x, y, width, height, onClick)
    ]);
}

const screen = new Composite([
    background(),
    button(350, 150, 200, 50, "one", () => console.log("one")),
    button(350, 350, 200, 50, "two", () => console.log("two")),
]);

canvas.addEventListener("click", event => {
    if (screen.isInClickZone(event)) {
        screen.onClick(event);
    }
});

screen.draw();

