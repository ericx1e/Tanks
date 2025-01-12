function drawDrop(x, y, angle, buff) {
    const size = TILE_SIZE / 4;
    switch (buff) {
        case 'speed':
            noStroke();
            push();
            fill(255, 0, 0);
            translate(size / 2, 0, 0);
            box(size, 0.9 * size, size / 2);
            translate(0, 0, size / 2);
            box(size / 1.8, size / 2, size / 2);
            translate(size / 2.5, 0, 0);
            rotateZ(PI / 2)
            cylinder(size / 10, size / 2.5)
            pop();
            translate(-size / 3, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size * 2 / 3)
            translate(0, -size / 8, 0)
            translate(-size / 4, 0, 0);
            cone(size / 10, size * 1 / 2)
            translate(2 * size / 4, 0, 0);
            cone(size / 10, size * 1 / 2)
            break;
        case 'fireRate':
            noStroke();
            push();
            fill(255, 0, 0);
            push()
            translate(size / 2, 0, -size / 2);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            push()
            translate(-size / 2, size / 3, size / 2);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            push();
            translate(0, -size / 3, 0);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            pop();
            break;
        case 'bulletSpeed':
            noStroke();
            push();
            fill(255, 0, 0);
            translate(size / 2, 0, 0);
            sphere(size / 4);
            translate(-0.6 * size, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, 1.2 * size)
            pop();
            break;
        case 'shield':
            noStroke();
            push();
            fill(255, 0, 0);
            box(size, 0.9 * size, size / 2);
            translate(0, 0, size / 2);
            box(size / 1.8, size / 2, size / 2);
            translate(size / 2.5, 0, 0);
            rotateZ(PI / 2)
            cylinder(size / 10, size / 2.5)
            pop();
            resetMatrix();
            translate(x, y, WALL_HEIGHT / 4)
            fill(0, 0, 255, 100);
            sphere(size);
            break;
        case 'multiShot':
            noStroke();
            fill(255, 0, 0);
            push();
            translate(-size / 2, 0, 0);
            push();
            rotateZ(-PI / 6);
            translate(size / 2, 0, 0);
            push();
            translate(size / 2, 0, -size / 2);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            pop();
            push();
            translate(size / 2, 0, 0);
            translate(size / 2, 0, -size / 2);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            push();
            rotateZ(PI / 6);
            translate(size / 2, 0, 0);
            translate(size / 2, 0, -size / 2);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cone(size / 10, size / 2)
            pop();
            pop();
            break;
        case 'bulletBounces':
            noStroke();
            push();
            push();
            fill(150, 100, 50);
            box(size / 4, size, size);
            fill(255, 0, 0);
            rotate(PI / 4);
            translate(size, 0, 0);
            sphere(size / 4);
            translate(-size / 2, 0, 0);
            rotateZ(PI / 2)
            fill(255, 100);
            cylinder(size / 12, size)
            pop();
            push();
            translate(size, 0, 0)
            rotate(PI / 4);
            translate(-size / 2 * sqrt(2) * 0.8, size / 2, 0);
            fill(255, 100);
            cylinder(size / 12, size / 2)
            pop();
            pop();
            break;
        default:
            noStroke();
            push();
            const cameraPos = createVector(camX, camY, camZ); // Camera position
            const barrelX = x;
            const barrelY = y;
            const barrelZ = WALL_HEIGHT / 2; // Height of the barrel
            const barrelPos = createVector(barrelX, barrelY, barrelZ);
            let viewDirection = p5.Vector.sub(cameraPos, barrelPos).normalize(); // Direction from bullet to camera
            // Offset the outline behind the bullet
            let offset = viewDirection.mult(-4);
            rotateZ(-angle);
            translate(offset.x, offset.y, offset.z); // Apply the offset
            rotateZ(angle);

            fill(0); // Semi-transparent black for the outline
            cylinder(size + 1, size / 2);
            pop();

            fill(255, 255, 0); // Yellow
            let dropText = buff;
            cylinder(size, size / 2);
            push();
            translate(0, size / 4 + 1, 0);
            rotateX(-HALF_PI);
            textSize(size);
            textFont(font);
            textAlign(CENTER, CENTER);
            fill(0);
            text(dropText, 0, 0);
            translate(0, 0, -size / 2 - 2);
            rotateY(PI);
            text(dropText, 0, 0);
            pop();
            break;
    }
}