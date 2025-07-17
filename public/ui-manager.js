// Simplified UI Manager for Tank Game
class UIManager {
    constructor() {
        this.currentScreen = 'menu';
        this.buttons = [];
        this.inputFields = [];
        this.notifications = [];
        this.playerName = localStorage.getItem('tankGamePlayerName') || '';
        this.lobbyCode = '';
        this.font = null;
        this.initialized = false;

        // Simple color scheme
        this.colors = {
            primary: [30, 60, 114],
            secondary: [42, 82, 152],
            accent: [255, 193, 7],
            success: [40, 167, 69],
            danger: [220, 53, 69],
            white: [255, 255, 255],
            black: [0, 0, 0],
            gray: [128, 128, 128]
        };
    }

    initialize() {
        if (this.initialized) return;
        this.createMenuElements();
        this.initialized = true;
    }

    setFont(font) {
        this.font = font;
    }

    createButton(x, y, width, height, text, callback) {
        const button = {
            x, y, width, height, text, callback,
            isHovered: false,
            enabled: true
        };
        this.buttons.push(button);
        return button;
    }

    createInputField(x, y, width, height, placeholder, defaultValue = '') {
        const input = {
            x, y, width, height, placeholder,
            value: defaultValue,
            isFocused: false,
            maxLength: 20
        };
        this.inputFields.push(input);
        return input;
    }

    createMenuElements() {
        this.clearUIElements();

        const centerX = 0;
        const startY = -60;
        const buttonWidth = 200;
        const buttonHeight = 40;
        const spacing = 60;

        // Player name input
        this.nameInput = this.createInputField(
            centerX - buttonWidth / 2, startY - 50,
            buttonWidth, 35,
            "Enter your name",
            this.playerName
        );

        // Create lobby button
        this.createButton(
            centerX - buttonWidth / 2, startY + 10,
            buttonWidth, buttonHeight,
            "CREATE LOBBY",
            () => this.createLobby()
        );

        // Lobby code input
        this.lobbyInput = this.createInputField(
            centerX - buttonWidth / 2, startY + spacing,
            buttonWidth, 35,
            "Enter lobby code"
        );

        // Join lobby button
        this.createButton(
            centerX - buttonWidth / 2, startY + spacing + 50,
            buttonWidth, buttonHeight,
            "JOIN LOBBY",
            () => this.joinLobby()
        );
    }

    clearUIElements() {
        this.buttons = [];
        this.inputFields = [];
    }

    addNotification(message, type = 'info', duration = 3000) {
        const notification = {
            message,
            type,
            startTime: millis(),
            duration,
            alpha: 255
        };
        this.notifications.push(notification);
    }

    drawMenuScreen() {
        // Simple background
        fill(0, 0, 0, 150);
        noStroke();
        rect(-width / 2, -height / 2, width, height);

        // Title
        this.drawTitle();

        // Draw UI elements
        this.drawInputFields();
        this.drawButtons();

        // Draw notifications
        this.drawNotifications();
    }

    drawTitle() {
        textAlign(CENTER, CENTER);
        textFont(this.font);
        textSize(36);
        fill(...this.colors.accent);
        text("MULTIPLAYER TANKS", 0, -height / 3);

        textSize(14);
        fill(...this.colors.white);
        text("Battle against AI tanks and other players", 0, -height / 3 + 50);
    }

    drawInputFields() {
        this.inputFields.forEach(input => {
            // Background
            if (input.isFocused) {
                fill(255, 255, 255, 240);
                stroke(...this.colors.accent);
                strokeWeight(2);
            } else {
                fill(255);
                stroke(...this.colors.gray);
                strokeWeight(1);
            }
            rect(input.x, input.y, input.width, input.height, 5);

            // Text
            const displayText = input.value || input.placeholder;
            fill(input.value ? 0 : 128);
            noStroke();
            textAlign(LEFT, CENTER);
            textFont(this.font);
            textSize(14);
            text(displayText, input.x + 10, input.y + input.height / 2);

            // Simple cursor
            if (input.isFocused && frameCount % 60 < 30) {
                const textW = textWidth(input.value);
                stroke(0);
                strokeWeight(1);
                line(input.x + 10 + textW + 2, input.y + 5,
                    input.x + 10 + textW + 2, input.y + input.height - 5);
            }
        });
    }

    drawButtons() {
        this.buttons.forEach(button => {
            // Button background
            if (button.isHovered) {
                fill(...this.colors.secondary);
            } else {
                fill(...this.colors.primary);
            }
            noStroke();
            rect(button.x, button.y, button.width, button.height, 5);

            // Button text
            fill(...this.colors.white);
            textAlign(CENTER, CENTER);
            textFont(this.font);
            textSize(16);
            text(button.text,
                button.x + button.width / 2,
                button.y + button.height / 2);
        });
    }

    drawGameUI() {
        push();
        resetMatrix();
        camera(0, 0, 630, 0, 0, 0);

        // Simple top-left info
        this.drawTopPanel();

        // Simple top-right player info  
        this.drawPlayerStatus();

        // Draw notifications
        this.drawNotifications();

        pop();
    }

    drawTopPanel() {
        // Use actual screen coordinates, not centered coordinates
        const panelX = 20;  // 20px from left edge
        const panelY = 20;  // 20px from top edge

        // Simple background
        fill(0, 0, 0, 180);
        noStroke();
        rect(panelX - width / 2, panelY - height / 2, 200, 80, 5);

        // Text content
        fill(255);
        textAlign(LEFT, TOP);
        textFont(this.font);
        textSize(12);

        let y = panelY - height / 2 + 10;
        const x = panelX - width / 2 + 10;

        if (lobbyCode) {
            fill(255, 193, 7);
            text(`Lobby: ${lobbyCode}`, x, y);
            y += 16;
        }

        fill(255);
        text(`Ping: ${Math.round(ping)} ms`, x, y);
        y += 16;
        text(`Mode: ${gameMode}`, x, y);
        y += 16;

        if (levelNumber >= 0) {
            text(`Level: ${levelNumber + 1}`, x, y);
        }
    }

    drawPlayerStatus() {
        if (!myTank) return;

        // Use actual screen coordinates
        const panelX = width - 180;  // 180px from right edge (panel width 160 + margin)
        const panelY = 20;           // 20px from top edge

        // Simple background
        fill(0, 0, 0, 180);
        noStroke();
        rect(panelX - width / 2, panelY - height / 2, 160, 80, 5);

        // Text content
        fill(255);
        textAlign(LEFT, TOP);
        textFont(this.font);
        textSize(12);

        let y = panelY - height / 2 + 10;
        const x = panelX - width / 2 + 10;

        // Player name
        const name = (myTank.name || 'Player').substring(0, 12);
        text(`${name}`, x, y);
        y += 16;

        // Status
        if (myTank.isDead) {
            fill(255, 100, 100);
            text("DEAD", x, y);
        } else {
            fill(100, 255, 100);
            text(myTank.shield ? "SHIELDED" : "ALIVE", x, y);
        }
        y += 16;

        // Simple controls
        fill(150);
        textSize(10);
        text("WASD + Mouse", x, y);
    }

    drawNotifications() {
        // Clean up old notifications
        const currentTime = millis();
        this.notifications = this.notifications.filter(notif => {
            const elapsed = currentTime - notif.startTime;
            return elapsed < notif.duration;
        });

        let y = -height / 2 + 120;

        for (let i = 0; i < this.notifications.length; i++) {
            const notif = this.notifications[i];

            // Simple notification
            let bgColor;
            switch (notif.type) {
                case 'success': bgColor = [0, 150, 0]; break;
                case 'error': bgColor = [150, 0, 0]; break;
                default: bgColor = [0, 100, 150]; break;
            }

            // Background
            fill(...bgColor, 200);
            noStroke();
            rect(-150, y, 300, 25, 5);

            // Text
            fill(255);
            textAlign(CENTER, CENTER);
            textFont(this.font);
            textSize(11);
            text(notif.message.substring(0, 40), 0, y + 12);

            y += 35;
        }
    }

    handleMousePressed() {
        const mouseXCentered = mouseX - width / 2;
        const mouseYCentered = mouseY - height / 2;

        // Check button clicks
        this.buttons.forEach(button => {
            if (this.isPointInRect(mouseXCentered, mouseYCentered, button)) {
                if (button.callback) {
                    button.callback();
                }
            }
        });

        // Check input field focus
        this.inputFields.forEach(input => {
            input.isFocused = this.isPointInRect(mouseXCentered, mouseYCentered, input);
        });
    }

    handleMouseMoved() {
        const mouseXCentered = mouseX - width / 2;
        const mouseYCentered = mouseY - height / 2;

        // Update button hover states
        this.buttons.forEach(button => {
            button.isHovered = this.isPointInRect(mouseXCentered, mouseYCentered, button);
        });
    }

    handleMouseReleased() {
        // Simple mouse release handler - no action needed for now
        // This prevents the error when mouseReleased is called
    }

    handleKeyPressed() {
        const focusedInput = this.inputFields.find(input => input.isFocused);
        if (focusedInput) {
            if (keyCode === 8) { // BACKSPACE
                focusedInput.value = focusedInput.value.slice(0, -1);
            } else if (keyCode === 13) { // ENTER
                focusedInput.isFocused = false;
                if (focusedInput === this.nameInput) {
                    this.setPlayerName();
                } else if (focusedInput === this.lobbyInput) {
                    this.joinLobby();
                }
            } else if (key && key.length === 1 && focusedInput.value.length < focusedInput.maxLength) {
                // Only add printable characters
                if (key >= ' ' && key <= '~') {
                    focusedInput.value += key;
                }
            }
            return false; // Prevent default key handling
        }
        return true; // Allow other key handling
    }

    isPointInRect(x, y, rect) {
        return x >= rect.x && x <= rect.x + rect.width &&
            y >= rect.y && y <= rect.y + rect.height;
    }

    // Game actions
    createLobby() {
        if (!this.nameInput.value.trim()) {
            this.addNotification('Please enter your name first', 'error');
            return;
        }

        this.setPlayerName();
        socket.emit('createLobby');
        this.addNotification('Creating lobby...', 'info');
    }

    joinLobby() {
        if (!this.nameInput.value.trim()) {
            this.addNotification('Please enter your name first', 'error');
            return;
        }

        if (!this.lobbyInput.value.trim()) {
            this.addNotification('Please enter a lobby code', 'error');
            return;
        }

        this.setPlayerName();
        const code = this.lobbyInput.value.trim().toUpperCase();
        socket.emit('joinLobby', code);
        this.addNotification(`Joining lobby ${code}...`, 'info');
    }

    setPlayerName() {
        const name = this.nameInput.value.trim();
        if (name) {
            this.playerName = name;
            localStorage.setItem('tankGamePlayerName', name);
            socket.emit('setName', name);
        }
    }

    // Socket event handlers
    onLobbyCreated(data) {
        this.lobbyCode = data.lobbyCode;
        this.currentScreen = 'game';
        this.addNotification(`Lobby ${data.lobbyCode} created!`, 'success');
        hideLoadingScreen();
    }

    onLobbyJoined(data) {
        this.lobbyCode = data.lobbyCode;
        this.currentScreen = 'game';
        this.addNotification(`Joined lobby ${data.lobbyCode}!`, 'success');
        hideLoadingScreen();
    }

    onError(err) {
        this.addNotification(err.message, 'error');
    }

    onGameModeChanged(mode) {
        this.addNotification(`Game mode: ${mode.toUpperCase()}`, 'info');
    }

    onPlayerDeath() {
        this.addNotification('You died! Spectating...', 'error');
    }

    onLevelComplete(data) {
        this.addNotification(`Level ${data.levelNumber + 1} complete!`, 'success');
    }

    onVictory() {
        this.addNotification('Victory! Well done!', 'success');
    }

    onGameOver() {
        this.addNotification('Game Over', 'error');
    }

    // Simple update method
    update() {
        // Just clean up notifications, no redrawing here
        const currentTime = millis();
        this.notifications = this.notifications.filter(notif => {
            const elapsed = currentTime - notif.startTime;
            return elapsed < notif.duration;
        });
    }

    isInMenu() {
        return this.currentScreen === 'menu';
    }

    isInGame() {
        return this.currentScreen === 'game';
    }
}