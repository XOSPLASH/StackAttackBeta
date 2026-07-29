const ROOM_STORAGE_PREFIX = "stack-attack-room-";
const ROOM_TTL_MS = 30 * 60 * 1000;
const supportsLocalMultiplayer = typeof BroadcastChannel !== "undefined";
const sessionId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;

let myTeam = null;
let currentTurn = null;
let currentRoom = null;
let roomChannel = null;
let isRoomHost = false;
let opponentSessionId = null;
let joinTimeoutId = null;

// DOM Elements
const board = document.getElementById("board");
const playerEnergyDisplay = document.getElementById("playerEnergy");
const enemyEnergyDisplay = document.getElementById("enemyEnergy");
const endTurnBtn = document.getElementById("endTurnBtn");
const turnBanner = document.getElementById("turnBanner");

// Lobby Elements
const lobbyModal = document.getElementById("lobbyModal");
const createRoomBtn = document.getElementById("createRoomBtn");
const joinRoomBtn = document.getElementById("joinRoomBtn");
const roomCodeInput = document.getElementById("roomCodeInput");
const lobbyStatus = document.getElementById("lobbyStatus");

let terrainLayout = buildTerrainLayout("solo");

let selectedBoardCard = null;
let selectedBoardTile = null;

let playerEnergy = 10;
let enemyEnergy = 10;

function setLobbyStatus(message, tone = "info") {
    lobbyStatus.textContent = message;
    lobbyStatus.classList.remove("info", "success", "error");
    lobbyStatus.classList.add(tone);
}

function setLobbyControlsDisabled(disabled) {
    createRoomBtn.disabled = disabled;
    joinRoomBtn.disabled = disabled;
    roomCodeInput.disabled = disabled;
}

function sanitizeRoomCode(code) {
    return code.replace(/\D/g, "").slice(0, 4);
}

function buildSeededRandom(seedText) {
    let hash = 2166136261;

    for (const char of seedText) {
        hash ^= char.charCodeAt(0);
        hash = Math.imul(hash, 16777619);
    }

    return function seededRandom() {
        hash += 0x6D2B79F5;
        let value = Math.imul(hash ^ (hash >>> 15), 1 | hash);
        value ^= value + Math.imul(value ^ (value >>> 7), 61 | value);
        return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
    };
}

function buildTerrainLayout(seedText) {
    const random = buildSeededRandom(seedText);
    const occupiedTiles = new Set();
    const terrainTypes = ["fire", "water", "ice"];

    return terrainTypes.reduce((layout, type) => {
        let x;
        let y;
        let tileKey;

        do {
            x = Math.floor(random() * 10) + 1;
            y = Math.floor(random() * 10) + 1;
            tileKey = `${x},${y}`;
        } while (occupiedTiles.has(tileKey));

        occupiedTiles.add(tileKey);
        layout[type] = { x, y };
        return layout;
    }, {});
}

function syncTerrain(seedText) {
    terrainLayout = buildTerrainLayout(seedText || "solo");
    createBoard();
}

function clearSelectionState() {
    if (selectedBoardTile && selectedBoardCard) {
        const x = Number(selectedBoardTile.dataset.x);
        const y = Number(selectedBoardTile.dataset.y);
        hideValidMoves(x, y, selectedBoardCard.move || 1);
        hideValidTargets(x, y, selectedBoardCard.range || 1);
    }

    selectedBoardCard = null;
    selectedBoardTile = null;
}

function resetEnergy() {
    playerEnergy = 10;
    enemyEnergy = 10;
}

function getRoomStorageKey(roomCode) {
    return `${ROOM_STORAGE_PREFIX}${roomCode}`;
}

function readRoomRecord(roomCode) {
    const rawValue = localStorage.getItem(getRoomStorageKey(roomCode));
    if (!rawValue) return null;

    try {
        const record = JSON.parse(rawValue);
        if (!record.createdAt || Date.now() - record.createdAt > ROOM_TTL_MS) {
            localStorage.removeItem(getRoomStorageKey(roomCode));
            return null;
        }
        return record;
    } catch {
        localStorage.removeItem(getRoomStorageKey(roomCode));
        return null;
    }
}

function writeRoomRecord(roomCode, record) {
    localStorage.setItem(getRoomStorageKey(roomCode), JSON.stringify(record));
}

function removeRoomRecord(roomCode) {
    localStorage.removeItem(getRoomStorageKey(roomCode));
}

function generateRoomCode() {
    let roomCode;

    do {
        roomCode = Math.floor(1000 + Math.random() * 9000).toString();
    } while (readRoomRecord(roomCode));

    return roomCode;
}

function closeRoomChannel() {
    if (roomChannel) {
        roomChannel.close();
        roomChannel = null;
    }
}

function openRoomChannel(roomCode) {
    closeRoomChannel();
    roomChannel = new BroadcastChannel(`stack-attack-${roomCode}`);
    roomChannel.addEventListener("message", handleRoomMessage);
}

function startJoinTimeout(roomCode) {
    clearJoinTimeout();
    joinTimeoutId = window.setTimeout(() => {
        if (currentRoom === roomCode && currentTurn === null && myTeam === "red") {
            const record = readRoomRecord(roomCode);
            if (record && record.guestSessionId === sessionId) {
                delete record.guestSessionId;
                writeRoomRecord(roomCode, record);
            }
            leaveRoom(false);
            setLobbyStatus("That room is not responding. Ask the host to keep their tab open and create a fresh code.", "error");
        }
    }, 3000);
}

function clearJoinTimeout() {
    if (joinTimeoutId) {
        clearTimeout(joinTimeoutId);
        joinTimeoutId = null;
    }
}

function handleOpponentLeft(message) {
    leaveRoom(false);
    setLobbyStatus(message, "error");
}

function leaveRoom(notifyOpponent = true) {
    clearJoinTimeout();

    if (roomChannel && notifyOpponent && currentRoom) {
        roomChannel.postMessage({
            type: "opponentLeft",
            roomCode: currentRoom,
            senderId: sessionId,
            message: "Your opponent left. Create a new room to play again."
        });
    }

    if (currentRoom) {
        const record = readRoomRecord(currentRoom);
        if (record) {
            if (isRoomHost || record.hostSessionId === sessionId) {
                removeRoomRecord(currentRoom);
            } else if (record.guestSessionId === sessionId) {
                delete record.guestSessionId;
                writeRoomRecord(currentRoom, record);
            }
        }
    }

    closeRoomChannel();
    currentRoom = null;
    currentTurn = null;
    myTeam = null;
    isRoomHost = false;
    opponentSessionId = null;
    roomCodeInput.value = "";
    clearSelectionState();
    resetEnergy();
    syncTerrain("solo");
    setLobbyControlsDisabled(false);
    lobbyModal.classList.remove("hidden");
    updateTurnUI();
}

function startGame(turn) {
    clearJoinTimeout();
    currentTurn = turn;
    lobbyModal.classList.add("hidden");
    updateTurnUI();
}

function handleRoomMessage(event) {
    const message = event.data;
    if (!message || message.senderId === sessionId || message.roomCode !== currentRoom) return;

    if (message.type === "joinRequest" && isRoomHost) {
        const record = readRoomRecord(currentRoom);
        if (!record || record.guestSessionId !== message.senderId) return;

        opponentSessionId = message.senderId;
        roomChannel.postMessage({
            type: "opponentJoined",
            roomCode: currentRoom,
            senderId: sessionId
        });
        roomChannel.postMessage({
            type: "gameStart",
            roomCode: currentRoom,
            currentTurn: "blue",
            senderId: sessionId
        });
        startGame("blue");
        return;
    }

    if (message.type === "opponentJoined") {
        opponentSessionId = message.senderId;
        setLobbyStatus("Player 2 joined. Starting match...", "success");
        return;
    }

    if (message.type === "gameStart") {
        opponentSessionId = message.senderId;
        startGame(message.currentTurn);
        return;
    }

    if (message.type === "turnChanged") {
        currentTurn = message.currentTurn;
        resetTeamAP(currentTurn); // Sync AP reset on receiving turn change
        updateTurnUI();
        return;
    }

    if (message.type === "gameActionDone") {
        handleRemoteAction(message.actionType, message.payload);
        return;
    }

    if (message.type === "opponentLeft") {
        handleOpponentLeft(message.message);
    }
}

function postRoomMessage(message) {
    if (!roomChannel || !currentRoom) return;
    roomChannel.postMessage({
        ...message,
        roomCode: currentRoom,
        senderId: sessionId
    });
}

roomCodeInput.addEventListener("input", () => {
    roomCodeInput.value = sanitizeRoomCode(roomCodeInput.value);
});

roomCodeInput.addEventListener("keydown", (event) => {
    if (event.key === "Enter" && !joinRoomBtn.disabled) {
        joinRoomBtn.click();
    }
});

if (supportsLocalMultiplayer) {
    setLobbyControlsDisabled(false);
    setLobbyStatus("Create or Join a room.", "success");

    createRoomBtn.addEventListener("click", () => {
        const roomCode = generateRoomCode();
        currentRoom = roomCode;
        myTeam = "blue";
        currentTurn = null;
        isRoomHost = true;
        opponentSessionId = null;
        resetEnergy();
        roomCodeInput.value = roomCode;
        syncTerrain(roomCode);
        openRoomChannel(roomCode);
        writeRoomRecord(roomCode, {
            hostSessionId: sessionId,
            createdAt: Date.now()
        });
        setLobbyControlsDisabled(true);
        setLobbyStatus(`Room ${roomCode} created. Open another Live Server tab and join it.`, "success");
        updateTurnUI();
    });

    joinRoomBtn.addEventListener("click", () => {
        const roomCode = sanitizeRoomCode(roomCodeInput.value.trim());

        if (roomCode.length !== 4) {
            setLobbyStatus("Please enter a 4-digit room code.", "error");
            return;
        }

        const record = readRoomRecord(roomCode);
        if (!record) {
            setLobbyStatus("Room not found. Make sure the host created it in another Live Server tab first.", "error");
            return;
        }

        if (record.hostSessionId === sessionId) {
            setLobbyStatus("Open a second Live Server tab or window to join your own room.", "error");
            return;
        }

        if (record.guestSessionId && record.guestSessionId !== sessionId) {
            setLobbyStatus("That room is already full.", "error");
            return;
        }

        record.guestSessionId = sessionId;
        writeRoomRecord(roomCode, record);

        currentRoom = roomCode;
        myTeam = "red";
        currentTurn = null;
        isRoomHost = false;
        opponentSessionId = record.hostSessionId;
        resetEnergy();
        roomCodeInput.value = roomCode;
        syncTerrain(roomCode);
        openRoomChannel(roomCode);
        setLobbyControlsDisabled(true);
        setLobbyStatus(`Joined room ${roomCode}. Waiting for the host to start...`, "success");
        postRoomMessage({ type: "joinRequest" });
        startJoinTimeout(roomCode);
        updateTurnUI();
    });
} else {
    setLobbyControlsDisabled(true);
    setLobbyStatus("This browser does not support local multiplayer. Try a recent version of Chrome or Edge.", "error");
}

window.addEventListener("beforeunload", () => {
    if (currentRoom) {
        leaveRoom(true);
    }
});

endTurnBtn.addEventListener("click", () => {
    if (myTeam === currentTurn && currentRoom) {
        currentTurn = currentTurn === "blue" ? "red" : "blue";
        resetTeamAP(currentTurn); // Reset AP for the player starting their turn
        updateTurnUI();
        postRoomMessage({
            type: "turnChanged",
            currentTurn
        });
    }
});

function updateTurnUI() {
    const isMyTurn = myTeam && currentTurn && myTeam === currentTurn;
    endTurnBtn.disabled = !isMyTurn;

    if (!isMyTurn) {
        clearSelectionState();
    }

    if (!myTeam || !currentTurn) {
        turnBanner.textContent = "Waiting for players...";
        turnBanner.style.color = "#ffd700";
    } else if (isMyTurn) {
        turnBanner.textContent = `YOUR TURN (${myTeam.toUpperCase()})`;
        turnBanner.style.color = "#4bbdffff";
    } else {
        turnBanner.textContent = `ENEMY'S TURN (${currentTurn.toUpperCase()})`;
        turnBanner.style.color = "#ff4d4f";
    }

    if (playerEnergyDisplay) playerEnergyDisplay.textContent = `Your Energy: ${playerEnergy}`;
    if (enemyEnergyDisplay) enemyEnergyDisplay.textContent = `Enemy Energy: ${enemyEnergy}`;
}

function getTile(x, y) {
    return document.querySelector(`[data-position="${x},${y}"]`);
}

function hideLabel(label) { if (label) label.classList.add("hidden"); }
function showLabel(label) { if (label) label.classList.remove("hidden"); }

function hideCardInfo() {
    hideLabel(cardIcon);
    hideLabel(cardName);
    hideLabel(cardDamage);
    hideLabel(cardHealth);
    hideLabel(cardRange);
    hideLabel(cardMove);
    hideLabel(cardAP);
    hideLabel(cardAbility);

    // Clear any active team border classes on the card icon
    if (cardIcon) {
        cardIcon.classList.remove("team-blue", "team-red");
    }
}

function showCardInfo(card, team = null) {
    showLabel(cardIcon);
    showLabel(cardAP);
    showLabel(cardName);
    showLabel(cardDamage);
    showLabel(cardHealth);
    showLabel(cardRange);
    showLabel(cardMove);
    showLabel(cardAP);
    showLabel(cardAbility);

    cardIcon.textContent = card.icon;
    cardName.textContent = card.name;
    cardDamage.textContent = `DMG: ${card.damage}`;
    cardHealth.textContent = `HP: ${card.health}`;
    cardRange.textContent = `Range: ${card.range}`;
    cardMove.textContent = `Move: ${card.move}`;
    cardAP.textContent = `AP: ${card.ap}`;
    cardAbility.textContent = card.ability;

    // Apply the team border if a team is provided
    if (cardIcon) {
        cardIcon.classList.remove("team-blue", "team-red");
        if (team === "blue") cardIcon.classList.add("team-blue");
        if (team === "red") cardIcon.classList.add("team-red");
    }
}

function showTileInfo(tile, x, y) {
    tilePosition.classList.remove("hidden");
    tileType.classList.remove("hidden");
    tilePosition.textContent = `Position: (${x}, ${y})`;
    tileType.textContent = `Tile: ${tile.dataset.type}`;
}

function getCardFromTile(tile) {
    const baseCard = cards.find(card => card.id == tile.dataset.cardId);
    if (!baseCard) return null;

    return {
        ...baseCard,
        ap: Number(tile.dataset.cardAp ?? baseCard.ap),
        ability: tile.dataset.cardAbility ?? baseCard.ability,
        health: Number(tile.dataset.cardHealth ?? baseCard.health),
        damage: Number(tile.dataset.cardDamage ?? baseCard.damage),
        range: Number(tile.dataset.cardRange ?? baseCard.range),
        move: Number(tile.dataset.cardMove ?? baseCard.move)
    };
}

function createUnitPieceHTML(icon) {
    return `<div class="unit-piece">${icon}</div>`;
}

function updateCardStats(tile, statsToUpdate = {}) {
    if (!tile || !tile.dataset.cardId) return;

    if (statsToUpdate.range !== undefined) tile.dataset.cardRange = statsToUpdate.range;
    if (statsToUpdate.move !== undefined) tile.dataset.cardMove = statsToUpdate.move;
    if (statsToUpdate.ability !== undefined) tile.dataset.cardAbility = statsToUpdate.ability;
    if (statsToUpdate.health !== undefined) tile.dataset.cardHealth = statsToUpdate.health;
    if (statsToUpdate.range !== undefined) tile.dataset.cardRange = statsToUpdate.range;
    if (statsToUpdate.move !== undefined) tile.dataset.cardMove = statsToUpdate.move;
    if (statsToUpdate.damage !== undefined) tile.dataset.cardDamage = statsToUpdate.damage;
    if (statsToUpdate.ap !== undefined) tile.dataset.cardAp = statsToUpdate.ap;

    if (selectedBoardTile === tile && selectedBoardCard) {
        if (statsToUpdate.health !== undefined) {
            selectedBoardCard.health = statsToUpdate.health;
            if (typeof cardHealth !== "undefined") cardHealth.textContent = `HP: ${statsToUpdate.health}`;
        }
        if (statsToUpdate.damage !== undefined) {
            selectedBoardCard.damage = statsToUpdate.damage;
            if (typeof cardDamage !== "undefined") cardDamage.textContent = `DMG: ${statsToUpdate.damage}`;
        }
    }
}

// Resets AP for all units on the board matching a specific team (or all units)
function resetTeamAP(team) {
    const tiles = document.querySelectorAll(".tile[data-card-id]");
    tiles.forEach(tile => {
        if (!team || tile.dataset.team === team) {
            const baseCard = cards.find(c => c.id == tile.dataset.cardId);
            if (baseCard) {
                updateCardStats(tile, { ap: baseCard.ap });
            }
        }
    });
}

function clearTile(tile) {
    if (!tile) return;
    tile.innerHTML = "";
    delete tile.dataset.cardId;
    delete tile.dataset.cardHealth;
    delete tile.dataset.cardDamage;
    delete tile.dataset.cardRange;
    delete tile.dataset.cardMove;
    delete tile.dataset.team;
    delete tile.dataset.cardAP;
    delete tile.dataset.cardAbility;
}

function showValidMoves(x, y, move = 1) {
    const offsets = getOrthogonalOffsets(move); // or getDiamondOffsets(move)

    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile && !targetTile.dataset.cardId) {
            targetTile.classList.add("selected");
        }
    });
}

function hideValidMoves(x, y, move = 1) {
    const offsets = getOrthogonalOffsets(move); // or getDiamondOffsets(move)

    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile) targetTile.classList.remove("selected");
    });
}

function getOrthogonalOffsets(maxDistance) {
    const offsets = [];
    for (let step = 1; step <= maxDistance; step++) {
        offsets.push([-step, 0], [step, 0], [0, step], [0, -step]);
    }
    return offsets;
}

function showValidTargets(x, y, range = 1) {
    const offsets = getOrthogonalOffsets(range);

    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile && targetTile.dataset.cardId && targetTile.dataset.team !== myTeam) {
            targetTile.classList.add("target");
        }
    });
}

function hideValidTargets(x, y, range = 1) {
    const offsets = getOrthogonalOffsets(range);

    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile) targetTile.classList.remove("target");
    });
}

function placeCard(tile, card, team) {
    tile.innerHTML = createUnitPieceHTML(card.icon);
    tile.dataset.cardId = card.id;
    tile.dataset.cardAbility = card.ability;
    tile.dataset.cardRange = card.range;
    tile.dataset.cardMove = card.move;
    tile.dataset.cardAP = card.ap;
    tile.dataset.team = team;

    updateCardStats(tile, {
        health: card.health,
        damage: card.damage,
        range: card.range,
        move: card.move,
        ap: card.ap,
    });
}

function moveCard(fromTile, toTile) {
    const card = getCardFromTile(fromTile);
    const team = fromTile.dataset.team;

    clearTile(fromTile);
    placeCard(toTile, card, team);
}

function attackCard(attackerTile, defenderTile) {
    const attackerDmg = Number(attackerTile.dataset.cardDamage);
    const currentDefenderHp = Number(defenderTile.dataset.cardHealth);
    const newDefenderHp = currentDefenderHp - attackerDmg;

    if (newDefenderHp <= 0) {
        clearTile(defenderTile);
    } else {
        updateCardStats(defenderTile, { health: newDefenderHp });
    }
}

function handleRemoteAction(actionType, payload) {
    if (actionType === "place") {
        const targetTile = getTile(payload.x, payload.y);
        const card = cards.find(c => c.id === payload.cardId);
        if (!targetTile || !card) return;
        placeCard(targetTile, card, payload.team);
        if (payload.team !== myTeam) {
            enemyEnergy = Math.max(0, enemyEnergy - card.cost);
            updateTurnUI();
        }
    } else if (actionType === "move") {
        const fromTile = getTile(payload.fromX, payload.fromY);
        const toTile = getTile(payload.toX, payload.toY);
        if (!fromTile || !toTile) return;
        moveCard(fromTile, toTile);

        // Deduct AP on the moved unit for the remote view
        const movedCard = getCardFromTile(toTile);
        if (movedCard) {
            updateCardStats(toTile, { ap: Math.max(0, movedCard.ap - 1) });
        }
    } else if (actionType === "attack") {
        const attackerTile = getTile(payload.attX, payload.attY);
        const defenderTile = getTile(payload.defX, payload.defY);
        if (!attackerTile || !defenderTile) return;

        // Perform attack
        attackCard(attackerTile, defenderTile);

        // Deduct AP on the attacking unit
        const attackerCard = getCardFromTile(attackerTile);
        if (attackerCard) {
            updateCardStats(attackerTile, { ap: Math.max(0, attackerCard.ap - 1) });
        }
    }
}

function emitAction(actionType, payload) {
    if (!currentRoom) return;
    postRoomMessage({
        type: "gameActionDone",
        actionType,
        payload
    });
}

function createBoard() {
    board.innerHTML = "";

    for (let y = 10; y >= 1; y--) {
        for (let x = 1; x <= 10; x++) {
            const tile = document.createElement("div");

            tile.className = "tile grass";
            tile.dataset.position = `${x},${y}`;
            tile.dataset.x = x;
            tile.dataset.y = y;
            tile.dataset.type = "Grass";

            if (x === terrainLayout.fire.x && y === terrainLayout.fire.y) { tile.className = "tile fire"; tile.dataset.type = "Fire"; }
            if (x === terrainLayout.water.x && y === terrainLayout.water.y) { tile.className = "tile water"; tile.dataset.type = "Water"; }
            if (x === terrainLayout.ice.x && y === terrainLayout.ice.y) { tile.className = "tile ice"; tile.dataset.type = "Ice"; }

            board.appendChild(tile);

            tile.addEventListener("click", function() {
                showTileInfo(tile, x, y);
                if (tile.dataset.cardId) {
                    showCardInfo(getCardFromTile(tile), tile.dataset.team);
                } else if (!selectedCard) {
                    hideCardInfo();
                }

                const canAct = myTeam && currentTurn && currentTurn === myTeam;
                if (!canAct) return;

                if (selectedBoardCard && tile.classList.contains("target") && tile.dataset.cardId) {
                    // Check if unit has enough AP to attack
                    if (selectedBoardCard.ap <= 0) {
                        return;
                    }

                    const attX = Number(selectedBoardTile.dataset.x);
                    const attY = Number(selectedBoardTile.dataset.y);

                    attackCard(selectedBoardTile, tile);

                    // Deduct 1 AP from the attacking unit
                    const newAp = Math.max(0, selectedBoardCard.ap - 1);
                    updateCardStats(selectedBoardTile, { ap: newAp });

                    emitAction("attack", { attX, attY, defX: x, defY: y });
                    clearSelectionState();
                    return;
                }
                
                // Move card to a valid tile //
                if (selectedBoardCard && tile.classList.contains("selected") && !tile.dataset.cardId) {
                    const fromX = Number(selectedBoardTile.dataset.x);
                    const fromY = Number(selectedBoardTile.dataset.y);

                    if (selectedBoardCard.ap <= 0) {
                        return;
                    }

                    moveCard(selectedBoardTile, tile);

                    // Get reference to the newly moved tile and update its AP
                    const movedCard = getCardFromTile(tile);
                    const newAp = Math.max(0, movedCard.ap - 1);
                    updateCardStats(tile, { ap: newAp });

                    emitAction("move", { fromX, fromY, toX: x, toY: y });
                    clearSelectionState();
                    return;
                }

                if (selectedBoardTile === tile) {
                    clearSelectionState();
                    return;
                }

                if (tile.dataset.cardId && tile.dataset.team === myTeam) {
                    const card = getCardFromTile(tile);
                    showCardInfo(card, tile.dataset.team);

                    if (selectedBoardTile) {
                        const oldx = Number(selectedBoardTile.dataset.x);
                        const oldy = Number(selectedBoardTile.dataset.y);
                        hideValidMoves(oldx, oldy, selectedBoardCard.move || 1);
                        hideValidTargets(oldx, oldy, selectedBoardCard.range || 1);
                    }

                    selectedBoardCard = card;
                    selectedBoardTile = tile;
                    showValidMoves(x, y, card.move || 1);
                    showValidTargets(x, y, card.range || 1);
                    return;
                }

                if (selectedCard && !tile.dataset.cardId) {
                    if (playerEnergy < selectedCard.cost) {
                        if (selectedCardElement) {
                            // Trigger the red outline / shake animation
                            selectedCardElement.classList.add("invalid");

                            // Optional: Remove 'invalid' class after animation finishes so it can trigger again on next click
                            setTimeout(() => selectedCardElement.classList.remove("invalid"), 300);
                        }
                        return;
                    }

                    // 2. Deduct energy & place card
                    playerEnergy -= selectedCard.cost;
                    updateTurnUI();

                    placeCard(tile, selectedCard, myTeam);
                    emitAction("place", { x, y, cardId: selectedCard.id, team: myTeam });

                    // 3. Cleanup shop selection
                    if (selectedCardElement) selectedCardElement.remove();
                    selectedCard = null;
                    selectedCardElement = null;
                }
            });
        }
    }
}

createBoard();
updateTurnUI();
