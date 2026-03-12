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
        case 'maxBullets':
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
        case 'visionRange':
            noStroke();
            push();
            fill(150, 220, 255);
            sphere(size / 3);
            for (let i = 0; i < 6; i++) {
                push();
                rotateZ(i * PI / 3);
                translate(size * 0.72, 0, 0);
                rotateZ(HALF_PI);
                fill(150, 220, 255, 150);
                cylinder(size / 14, size * 0.65);
                pop();
            }
            pop();
            break;
        case 'piercing':
            noStroke();
            push();
            fill(160, 160, 160);
            box(size / 5, size * 0.9, size * 0.5);
            fill(255, 50, 50);
            translate(size * 0.42, 0, 0);
            sphere(size / 4);
            translate(-size * 0.38, 0, 0);
            rotateZ(HALF_PI);
            fill(255, 120, 120, 160);
            cone(size / 10, size * 0.85);
            pop();
            break;
        case 'autoTurret':
            noStroke();
            push();
            // Base plate
            fill(100, 70, 30);
            box(size * 0.9, size * 0.9, size * 0.3);
            // Turret body
            translate(0, 0, size * 0.35);
            fill(255, 160, 0);
            box(size * 0.55, size * 0.7, size * 0.5);
            // Barrel pointing out
            translate(0, -size * 0.55, 0);
            fill(200, 120, 0);
            box(size * 0.18, size * 0.6, size * 0.18);
            pop();
            break;
        case 'explosive':
            noStroke();
            // Main bomb body
            fill(40, 40, 40);
            sphere(size * 0.55);
            // Fuse on top
            fill(200, 150, 50);
            push();
            translate(0, 0, size * 0.55);
            cylinder(size * 0.06, size * 0.35);
            pop();
            // Spark burst lines radiating outward
            for (let i = 0; i < 6; i++) {
                push();
                rotateZ(i * PI / 3);
                translate(size * 0.52, 0, 0);
                fill(255, 200, 0);
                sphere(size * 0.13);
                pop();
            }
            break;
        case 'homing':
            noStroke();
            // Outer ring
            fill(255, 50, 50, 180);
            torus(size * 0.62, size * 0.09);
            // Inner ring
            fill(255, 100, 100, 210);
            torus(size * 0.35, size * 0.08);
            // Center crosshair dot
            fill(255, 50, 50);
            sphere(size * 0.13);
            // Two cross lines
            push();
            fill(255, 80, 80, 160);
            box(size * 1.3, size * 0.06, size * 0.06);
            box(size * 0.06, size * 1.3, size * 0.06);
            pop();
            break;
        case 'haste': {
            noStroke();
            rotateY(PI / 5);
            const h = size * 0.55;
            fill(255, 215, 30, 220);
            // Upper cone: base at top (+Z), tip at waist (Z=0)
            push();
            translate(0, 0, h / 2);
            rotateX(-HALF_PI);
            cone(size * 0.5, h);
            pop();
            // Lower cone: base at bottom (-Z), tip at waist (Z=0)
            push();
            translate(0, 0, -h / 2);
            rotateX(HALF_PI);
            cone(size * 0.5, h);
            pop();
            // Waist ring
            fill(255, 245, 120, 230);
            push();
            rotateX(HALF_PI);
            torus(size * 0.08, size * 0.05);
            pop();
            break;
        }
        case 'orbit':
            noStroke();
            // Center core
            fill(140, 255, 180);
            sphere(size * 0.16);
            // Two mini wall panels orbiting (sovereign style)
            for (let i = 0; i < 2; i++) {
                push();
                rotateZ(i * PI);
                translate(size * 0.58, 0, 0);
                rotateZ(HALF_PI);
                fill(80, 220, 140, 70);
                box(size * 0.85, size * 0.2, size * 0.85);
                fill(140, 255, 180, 210);
                stroke(100, 220, 150, 200);
                strokeWeight(1);
                box(size * 0.85, size * 0.1, size * 0.75);
                pop();
            }
            break;
        case 'chain':
            noStroke();
            // Center orb
            fill(255, 180, 0);
            sphere(size * 0.22);
            // Three bullets radiating outward like a chain reaction
            for (let i = 0; i < 3; i++) {
                push();
                rotateZ(i * TWO_PI / 3);
                translate(size * 0.55, 0, 0);
                fill(255, 220, 60);
                sphere(size * 0.16);
                // Small trailing connector
                translate(-size * 0.22, 0, 0);
                fill(255, 200, 0, 160);
                rotateZ(HALF_PI);
                cylinder(size * 0.05, size * 0.38);
                pop();
            }
            break;
        case 'regen':
            noStroke();
            // Blue shield bubble
            fill(80, 160, 255, 140);
            sphere(size * 0.72);
            // White plus sign on top
            fill(255, 255, 255, 230);
            push();
            translate(0, 0, size * 0.05);
            box(size * 0.18, size * 0.65, size * 0.18);
            box(size * 0.65, size * 0.18, size * 0.18);
            pop();
            break;
        case 'nullfield':
            noStroke();
            // Concentric rings suggesting a field
            fill(60, 140, 255, 50);
            torus(size * 0.58, size * 0.13);
            fill(80, 180, 255, 40);
            torus(size * 0.35, size * 0.08);
            // Center core — small glowing orb
            fill(160, 210, 255, 200);
            sphere(size * 0.16);
            // Three tick marks around the outer ring
            for (let k = 0; k < 3; k++) {
                push();
                rotateZ((k / 3) * TWO_PI);
                translate(size * 0.58, 0, 0);
                fill(200, 230, 255, 220);
                box(size * 0.07, size * 0.18, size * 0.07);
                pop();
            }
            break;
        case 'afterimage': {
            noStroke();
            // Three staggered tank silhouettes offset behind each other — motion trail
            const offsets = [0, size * 0.28, size * 0.52];
            const alphas = [200, 120, 55];
            for (let k = 0; k < 3; k++) {
                fill(160, 220, 255, alphas[k]);
                push();
                translate(0, offsets[k], 0);
                box(size * 0.85, size * 0.6, size * 0.3);
                // Turret nub
                translate(0, 0, size * 0.22);
                cylinder(size * 0.18, size * 0.18);
                pop();
            }
            break;
        }
        case 'ghost': {
            noStroke();
            // Tank silhouette — dark body, very faint so it reads as "invisible"
            fill(30, 20, 50, 180);
            push();
            box(size * 0.9, size * 0.65, size * 0.38);
            pop();
            // Turret stub
            fill(20, 15, 40, 160);
            push();
            translate(0, 0, size * 0.28);
            cylinder(size * 0.22, size * 0.22);
            pop();
            // Barrel
            push();
            translate(0, -size * 0.55, size * 0.28);
            rotateX(HALF_PI);
            cylinder(size * 0.07, size * 0.5);
            pop();
            // Ghostly dissolve overlay — wispy translucent rings drifting upward
            for (let k = 0; k < 3; k++) {
                push();
                translate(0, 0, size * (0.1 + k * 0.22));
                fill(180, 140, 255, 55 - k * 15);
                push(); scale(1, 1, 0.15); sphere(size * (0.7 - k * 0.1)); pop();
                pop();
            }
            // Two glowing eyes
            fill(200, 160, 255, 220);
            push(); translate(size * 0.18, -size * 0.2, size * 0.32); sphere(size * 0.08); pop();
            push(); translate(-size * 0.18, -size * 0.2, size * 0.32); sphere(size * 0.08); pop();
            break;
        }
        case 'shockwave':
            noStroke();
            // Outer expanding ring
            fill(60, 200, 255, 60);
            torus(size * 0.55, size * 0.12);
            // Inner shield core
            fill(140, 220, 255, 180);
            sphere(size * 0.28);
            // Three small arrows radiating outward
            for (let k = 0; k < 3; k++) {
                push();
                rotateZ((k / 3) * TWO_PI);
                translate(size * 0.48, 0, 0);
                fill(255, 255, 255, 220);
                cone(size * 0.10, size * 0.22, 6);
                pop();
            }
            break;
        case 'scavenge': {
            noStroke();
            // Chest body — dark wood base
            fill(100, 60, 25, 240);
            push(); translate(0, 0, -size * 0.1); box(size * 1.0, size * 0.72, size * 0.42); pop();
            // Chest lid — slightly wider, raised
            fill(130, 78, 30, 240);
            push(); translate(0, 0, size * 0.18); box(size * 1.04, size * 0.74, size * 0.28); pop();
            // Gold trim band across middle
            fill(220, 175, 40, 255);
            push(); translate(0, 0, size * 0.02); box(size * 1.06, size * 0.76, size * 0.07); pop();
            // Latch — small gold rectangle on front face
            fill(240, 200, 50, 255);
            push(); translate(0, -size * 0.38, size * 0.08); box(size * 0.18, size * 0.06, size * 0.18); pop();
            // Glow from inside — gold light leaking out of the seam
            fill(255, 220, 60, 50);
            push(); translate(0, 0, size * 0.04); box(size * 0.88, size * 0.62, size * 0.06); pop();
            break;
        }
        case null:
        case undefined:
            // Mystery crate — brown box with question mark
            noStroke();
            fill(140, 90, 40);
            box(size * 0.95, size * 0.95, size * 0.75);
            fill(100, 60, 20);
            box(size * 1.0, size * 0.14, size * 0.14);
            box(size * 0.14, size * 1.0, size * 0.14);
            push();
            translate(0, 0, size * 0.45);
            rotateX(atan2(camZ, 0.001));
            fill(255, 220, 50);
            textFont(font);
            textSize(size * 1.1);
            textAlign(CENTER, CENTER);
            text('?', 0, 0);
            pop();
            break;
        default:
            noStroke();
            push();
            const cameraPos = new p5.Vector(camX, camY, camZ);
            const barrelX = x;
            const barrelY = y;
            const barrelZ = WALL_HEIGHT / 2; // Height of the barrel
            const barrelPos = new p5.Vector(barrelX, barrelY, barrelZ);
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