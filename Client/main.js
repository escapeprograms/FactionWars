const canvas = document.getElementById("canvas");
const context = canvas.getContext("2d");

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

