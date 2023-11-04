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

