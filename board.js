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

// 0 = Deselected, 1 = Move Stage (.in-move), 2 = Attack Stage (.in-range & .target)
let selectionState = 0; 

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

function buildTerrainLayout(seed = "solo") {
    let hash = 0;
    for (let i = 0; i < seed.length; i++) {
        hash = (hash << 5) - hash + seed.charCodeAt(i);
        hash |= 0;
    }

    const getPseudoRandom = (offset) => {
        const x = Math.sin(hash + offset) * 10000;
        return x - Math.floor(x);
    };

    let fireIndex = Math.floor(getPseudoRandom(1) * 100);
    while (fireIndex < 0 || fireIndex >= 100) {
        fireIndex = Math.floor(getPseudoRandom(1) * 100);
    }
    let waterIndex = Math.floor(getPseudoRandom(2) * 100);
    while (waterIndex === fireIndex) {
        waterIndex = Math.floor(getPseudoRandom(3) * 100);
    }
    let iceIndex = Math.floor(getPseudoRandom(4) * 100);
    while (iceIndex === fireIndex || iceIndex === waterIndex) {
        iceIndex = Math.floor(getPseudoRandom(5) * 100);
    }

    return {
        fire: { x: (fireIndex % 10) + 1, y: Math.floor(fireIndex / 10) + 1 },
        water: { x: (waterIndex % 10) + 1, y: Math.floor(waterIndex / 10) + 1 },
        ice: { x: (iceIndex % 10) + 1, y: Math.floor(iceIndex / 10) + 1 }
    };
}

// ==================== HELPER FUNCTIONS ====================

function getTile(x, y) {
    return document.querySelector(`[data-position="${x},${y}"]`);
}

function getCardFromTile(tile) {
    if (!tile || !tile.dataset.cardId) return null;
    return {
        id: String(tile.dataset.cardId), // Kept as string for named IDs
        name: tile.dataset.cardName,
        icon: tile.dataset.cardIcon,
        health: Number(tile.dataset.cardHealth),
        damage: Number(tile.dataset.cardDamage),
        range: Number(tile.dataset.cardRange || 1),
        move: Number(tile.dataset.cardMove || 1),
        ap: Number(tile.dataset.cardAp ?? 2),
        ability: tile.dataset.cardAbility || "None"
    };
}

function updateCardStats(tile, stats = {}) {
    if (!tile) return;
    if (stats.health !== undefined) tile.dataset.cardHealth = stats.health;
    if (stats.damage !== undefined) tile.dataset.cardDamage = stats.damage;
    if (stats.range !== undefined) tile.dataset.cardRange = stats.range;
    if (stats.move !== undefined) tile.dataset.cardMove = stats.move;
    if (stats.ap !== undefined) tile.dataset.cardAp = stats.ap;
    if (stats.ability !== undefined) tile.dataset.cardAbility = stats.ability;
}

function showTileInfo(tile) {
    if (!tile) return;

    if (tileType) {
        tileType.classList.remove("hidden");
        const typeStr = tile.dataset.type || "grass";
        tileType.textContent = `Tile: ${typeStr.charAt(0).toUpperCase() + typeStr.slice(1)}`;
    }

    if (tilePosition) {
        tilePosition.classList.remove("hidden");
        tilePosition.textContent = `Position: (${tile.dataset.x}, ${tile.dataset.y})`;
    }
}

function hideTileInfo() {
    if (tileType) tileType.classList.add("hidden");
    if (tilePosition) tilePosition.classList.add("hidden");
}

function showCardInfo(card, cardTeam = null) {
    cardIcon.classList.remove("hidden", "team-blue", "team-red");
    cardName.classList.remove("hidden");
    cardDamage.classList.remove("hidden");
    cardHealth.classList.remove("hidden");
    cardRange.classList.remove("hidden");
    cardMove.classList.remove("hidden");
    if (cardAP) cardAP.classList.remove("hidden");
    if (cardAbility) cardAbility.classList.remove("hidden");

    if (cardTeam) {
        cardIcon.classList.add(`team-${cardTeam}`);
    }

    cardIcon.textContent = card.icon;
    cardName.textContent = card.name;
    cardDamage.textContent = `DMG: ${card.damage}`;
    cardHealth.textContent = `HP: ${card.health}`;
    cardRange.textContent = `Range: ${card.range || 1}`;
    cardMove.textContent = `Move: ${card.move || 1}`;
    if (cardAP) cardAP.textContent = `AP: ${card.ap ?? 2}`;
    if (cardAbility) cardAbility.textContent = card.ability || "None";
}

function hideCardInfo() {
    cardIcon.classList.add("hidden");
    cardName.classList.add("hidden");
    cardDamage.classList.add("hidden");
    cardHealth.classList.add("hidden");
    cardRange.classList.add("hidden");
    cardMove.classList.add("hidden");
    if (cardAP) cardAP.classList.add("hidden");
    if (cardAbility) cardAbility.classList.add("hidden");
}

function clearSelectionState() {
    document.querySelectorAll(".tile").forEach(t => {
        t.classList.remove("in-move", "in-range", "target", "targets", "selected");
    });
    selectedBoardCard = null;
    selectedBoardTile = null;
    selectionState = 0;
    hideTileInfo();
}

function getOrthogonalOffsets(distance) {
    const offsets = [];
    for (let d = 1; d <= distance; d++) {
        offsets.push([d, 0], [-d, 0], [0, d], [0, -d]);
    }
    return offsets;
}

function showValidMoves(x, y, moveRange = 1) {
    const offsets = getOrthogonalOffsets(moveRange);
    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile && !targetTile.dataset.cardId) {
            targetTile.classList.add("in-move");
        }
    });
}

function hideValidTiles(x, y, moveRange = 1) {
    const offsets = getOrthogonalOffsets(moveRange);
    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile) {
            targetTile.classList.remove("in-move");
        }
    });
}

function showValidTargets(x, y, attackRange = 1) {
    const offsets = getOrthogonalOffsets(attackRange);
    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile) {
            targetTile.classList.add("in-range");
            if (targetTile.dataset.cardId && targetTile.dataset.team !== myTeam) {
                targetTile.classList.add("target", "targets");
            }
        }
    });
}

function hideValidTargets(x, y, attackRange = 1) {
    const offsets = getOrthogonalOffsets(attackRange);
    offsets.forEach(([xOffset, yOffset]) => {
        const targetTile = getTile(x + xOffset, y + yOffset);
        if (targetTile) {
            targetTile.classList.remove("in-range", "target", "targets");
        }
    });
}

function placeCard(tile, cardData, team) {
    tile.dataset.cardId = cardData.id;
    tile.dataset.cardName = cardData.name;
    tile.dataset.cardIcon = cardData.icon;
    tile.dataset.cardHealth = cardData.health;
    tile.dataset.cardDamage = cardData.damage;
    tile.dataset.cardRange = cardData.range || 1;
    tile.dataset.cardMove = cardData.move || 1;
    tile.dataset.cardAp = cardData.ap ?? 2;
    tile.dataset.cardAbility = cardData.ability || "None";
    tile.dataset.team = team;

    tile.innerHTML = `
        <div class="unit-piece team-${team} pop-up">
            ${cardData.icon}
        </div>
    `;
}

function moveCard(fromTile, toTile) {
    const cardData = getCardFromTile(fromTile);
    const team = fromTile.dataset.team;

    const currentAP = Number(fromTile.dataset.cardAp ?? 2);
    const newAP = Math.max(0, currentAP - 1);
    cardData.ap = newAP;

    delete fromTile.dataset.cardId;
    delete fromTile.dataset.cardName;
    delete fromTile.dataset.cardIcon;
    delete fromTile.dataset.cardHealth;
    delete fromTile.dataset.cardDamage;
    delete fromTile.dataset.cardRange;
    delete fromTile.dataset.cardMove;
    delete fromTile.dataset.cardAp;
    delete fromTile.dataset.cardAbility;
    delete fromTile.dataset.team;
    fromTile.innerHTML = "";

    placeCard(toTile, cardData, team);
}

function attackCard(attackerTile, defenderTile) {
    const attacker = getCardFromTile(attackerTile);
    const defender = getCardFromTile(defenderTile);

    if (!attacker || !defender) return;

    const currentAP = Number(attackerTile.dataset.cardAp ?? 2);
    const newAP = Math.max(0, currentAP - 1);
    updateCardStats(attackerTile, { ap: newAP });

    const newHealth = defender.health - attacker.damage;

    if (newHealth <= 0) {
        delete defenderTile.dataset.cardId;
        delete defenderTile.dataset.cardName;
        delete defenderTile.dataset.cardIcon;
        delete defenderTile.dataset.cardHealth;
        delete defenderTile.dataset.cardDamage;
        delete defenderTile.dataset.cardRange;
        delete defenderTile.dataset.cardMove;
        delete defenderTile.dataset.cardAp;
        delete defenderTile.dataset.cardAbility;
        delete defenderTile.dataset.team;
        defenderTile.innerHTML = "";
    } else {
        updateCardStats(defenderTile, { health: newHealth });
    }
}

// ==================== MULTIPLAYER LOGIC ====================

function updateTurnUI() {
    playerEnergyDisplay.textContent = `Your Energy: ${playerEnergy}`;
    enemyEnergyDisplay.textContent = `Enemy Energy: ${enemyEnergy}`;

    if (!myTeam) {
        turnBanner.textContent = "Waiting for game to start...";
        endTurnBtn.disabled = true;
        return;
    }

    if (currentTurn === myTeam) {
        turnBanner.textContent = "YOUR TURN";
        turnBanner.style.background = myTeam === "blue" ? "var(--blue)" : "var(--red)";
        endTurnBtn.disabled = false;
    } else {
        turnBanner.textContent = "ENEMY TURN";
        turnBanner.style.background = "#4a5568";
        endTurnBtn.disabled = true;
    }
}

function resetUnitAP(team) {
    document.querySelectorAll(`.tile[data-team="${team}"]`).forEach(tile => {
        const card = getCardFromTile(tile);
        if (card) {
            updateCardStats(tile, { ap: 2 });
        }
    });
}

function endTurn() {
    if (currentTurn !== myTeam) return;

    currentTurn = myTeam === "blue" ? "red" : "blue";
    playerEnergy = Math.min(10, playerEnergy + 2);

    resetUnitAP(myTeam);

    updateTurnUI();
    clearSelectionState();
    hideCardInfo();

    emitAction("endTurn", { nextTurn: currentTurn });
}

function emitAction(type, payload = {}) {
    if (!roomChannel) return;

    const actionData = {
        type,
        senderSessionId: sessionId,
        team: myTeam,
        payload
    };

    roomChannel.postMessage(actionData);
    saveRoomState(currentRoom, { lastAction: actionData, turn: currentTurn });
}

function handleRemoteAction(data) {
    if (!data || data.senderSessionId === sessionId) return;

    if (data.type === "place") {
        const targetTile = getTile(data.payload.x, data.payload.y);
        const cardObj = cards.find(c => c.id === data.payload.cardId);
        if (targetTile && cardObj) {
            placeCard(targetTile, cardObj, data.team);
        }
    } else if (data.type === "move") {
        const fromTile = getTile(data.payload.fromX, data.payload.fromY);
        const toTile = getTile(data.payload.toX, data.payload.toY);
        if (fromTile && toTile) {
            moveCard(fromTile, toTile);
        }
    } else if (data.type === "attack") {
        const attackerTile = getTile(data.payload.attackerX, data.payload.attackerY);
        const defenderTile = getTile(data.payload.defenderX, data.payload.defenderY);
        if (attackerTile && defenderTile) {
            attackCard(attackerTile, defenderTile);
        }
    } else if (data.type === "endTurn") {
        currentTurn = data.payload.nextTurn;
        enemyEnergy = Math.min(10, enemyEnergy + 2);
        resetUnitAP(data.team);
        updateTurnUI();
        clearSelectionState();
        hideCardInfo();
    }
}

function getRoomStorageKey(code) {
    return `${ROOM_STORAGE_PREFIX}${code}`;
}

function saveRoomState(code, state) {
    const key = getRoomStorageKey(code);
    const existing = getRoomState(code) || {};
    const updated = {
        ...existing,
        ...state,
        updatedAt: Date.now()
    };
    localStorage.setItem(key, JSON.stringify(updated));
}

function getRoomState(code) {
    const key = getRoomStorageKey(code);
    const raw = localStorage.getItem(key);
    if (!raw) return null;
    try {
        const data = JSON.parse(raw);
        if (Date.now() - data.updatedAt > ROOM_TTL_MS) {
            localStorage.removeItem(key);
            return null;
        }
        return data;
    } catch (e) {
        return null;
    }
}

function initRoomChannel(code) {
    if (roomChannel) roomChannel.close();

    currentRoom = code;
    roomChannel = new BroadcastChannel(`stack-attack-${code}`);

    roomChannel.onmessage = (event) => {
        const data = event.data;
        if (!data) return;

        if (data.type === "join_request" && isRoomHost) {
            opponentSessionId = data.senderSessionId;
            saveRoomState(code, { guestSessionId: opponentSessionId, status: "playing" });

            roomChannel.postMessage({
                type: "join_accept",
                hostSessionId: sessionId,
                terrainLayout
            });

            lobbyModal.classList.add("hidden");
            setLobbyControlsDisabled(false);
        } else if (data.type === "join_accept" && !isRoomHost) {
            clearTimeout(joinTimeoutId);
            terrainLayout = data.terrainLayout || terrainLayout;
            createBoard();

            lobbyModal.classList.add("hidden");
            setLobbyControlsDisabled(false);
            updateTurnUI();
        } else {
            handleRemoteAction(data);
        }
    };
}

function createRoom() {
    if (!supportsLocalMultiplayer) {
        setLobbyStatus("BroadcastChannel not supported in this browser.", "error");
        return;
    }

    const code = Math.floor(1000 + Math.random() * 9000).toString();
    isRoomHost = true;
    myTeam = "blue";
    currentTurn = "blue";

    terrainLayout = buildTerrainLayout(code);
    saveRoomState(code, {
        hostSessionId: sessionId,
        terrainLayout,
        turn: "blue",
        status: "waiting"
    });

    initRoomChannel(code);
    createBoard();
    updateTurnUI();

    setLobbyStatus(`Room created! Share code: ${code}. Waiting for player...`, "info");
    setLobbyControlsDisabled(true);
}

function joinRoom() {
    if (!supportsLocalMultiplayer) {
        setLobbyStatus("BroadcastChannel not supported in this browser.", "error");
        return;
    }

    const code = roomCodeInput.value.trim();
    if (code.length !== 4 || isNaN(code)) {
        setLobbyStatus("Please enter a valid 4-digit numeric code.", "error");
        return;
    }

    const state = getRoomState(code);
    if (!state) {
        setLobbyStatus("Room not found or expired.", "error");
        return;
    }

    isRoomHost = false;
    myTeam = "red";
    currentTurn = state.turn || "blue";

    initRoomChannel(code);

    setLobbyStatus("Connecting to room...", "info");
    setLobbyControlsDisabled(true);

    roomChannel.postMessage({
        type: "join_request",
        senderSessionId: sessionId
    });

    joinTimeoutId = setTimeout(() => {
        setLobbyStatus("Host did not respond. Try again.", "error");
        setLobbyControlsDisabled(false);
    }, 4000);
}

// ==================== BOARD SETUP ====================

function createBoard() {
    board.innerHTML = "";

    for (let y = 1; y <= 10; y++) {
        for (let x = 1; x <= 10; x++) {
            const tile = document.createElement("div");
            tile.className = "tile pop-up";

            let tileType = "grass";
            if (terrainLayout.fire.x === x && terrainLayout.fire.y === y) tileType = "fire";
            if (terrainLayout.water.x === x && terrainLayout.water.y === y) tileType = "water";
            if (terrainLayout.ice.x === x && terrainLayout.ice.y === y) tileType = "ice";

            tile.classList.add(tileType);
            tile.dataset.type = tileType;
            tile.dataset.position = `${x},${y}`;
            tile.dataset.x = x;
            tile.dataset.y = y;

            board.appendChild(tile);

            tile.addEventListener("click", () => {
                showTileInfo(tile);

                // 1. Attack action execution (Stage 2)
                if (selectedBoardTile && (tile.classList.contains("target") || tile.classList.contains("targets"))) {
                    const attacker = getCardFromTile(selectedBoardTile);
                    if (!attacker || attacker.ap <= 0) return;

                    const attackerX = Number(selectedBoardTile.dataset.x);
                    const attackerY = Number(selectedBoardTile.dataset.y);
                    const defenderX = x;
                    const defenderY = y;

                    attackCard(selectedBoardTile, tile);
                    emitAction("attack", { attackerX, attackerY, defenderX, defenderY });

                    clearSelectionState();
                    hideCardInfo();
                    return;
                }

                // 2. Move action execution (Stage 1)
                if (selectedBoardTile && tile.classList.contains("in-move")) {
                    const unit = getCardFromTile(selectedBoardTile);
                    if (!unit || unit.ap <= 0) return;

                    const fromX = Number(selectedBoardTile.dataset.x);
                    const fromY = Number(selectedBoardTile.dataset.y);
                    const toX = x;
                    const toY = y;

                    moveCard(selectedBoardTile, tile);
                    emitAction("move", { fromX, fromY, toX, toY });

                    clearSelectionState();
                    hideCardInfo();
                    return;
                }

                // 3. 3-Stage Selection Cycle for player's own cards
                if (tile.dataset.cardId && tile.dataset.team === myTeam) {
                    const card = getCardFromTile(tile);

                    if (selectedBoardTile === tile) {
                        const unitMove = card.move || 1;
                        const unitRange = card.range || 1;

                        if (selectionState === 1) {
                            hideValidTiles(x, y, unitMove);
                            if (card.ap > 0) {
                                showValidTargets(x, y, unitRange);
                            }
                            selectionState = 2;
                        } else if (selectionState === 2) {
                            clearSelectionState();
                            hideCardInfo();
                        }
                        return;
                    }

                    clearSelectionState();
                    showTileInfo(tile); // Re-trigger tile info after selection clear

                    selectedBoardCard = card;
                    selectedBoardTile = tile;
                    selectionState = 1;

                    showCardInfo(card, tile.dataset.team);

                    if (card.ap > 0) {
                        showValidMoves(x, y, card.move || 1);
                    }
                    return;
                }

                // 4. Inspect enemy card stats when clicked directly
                if (tile.dataset.cardId) {
                    clearSelectionState();
                    showTileInfo(tile);
                    const card = getCardFromTile(tile);
                    showCardInfo(card, tile.dataset.team);
                    return;
                }

                // 5. Shop card placement
                if (selectedCard && !tile.dataset.cardId) {
                    if (playerEnergy < selectedCard.cost) {
                        if (selectedCardElement) {
                            selectedCardElement.classList.add("invalid");
                            setTimeout(() => selectedCardElement.classList.remove("invalid"), 300);
                        }
                        return;
                    }

                    playerEnergy -= selectedCard.cost;
                    updateTurnUI();

                    placeCard(tile, selectedCard, myTeam);
                    emitAction("place", { x, y, cardId: selectedCard.id, team: myTeam });

                    if (selectedCardElement) selectedCardElement.remove();
                    selectedCard = null;
                    selectedCardElement = null;
                }
            });
        }
    }
}

// Event Listeners
createRoomBtn.addEventListener("click", createRoom);
joinRoomBtn.addEventListener("click", joinRoom);
endTurnBtn.addEventListener("click", endTurn);

// Initialize single player / initial board view
createBoard();
updateTurnUI();