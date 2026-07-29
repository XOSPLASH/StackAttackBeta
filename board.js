// Board setup
const board = document.getElementById("board");
const playerEnergyDisplay = document.getElementById("playerEnergy");
const enemyEnergyDisplay = document.getElementById("enemyEnergy");

const fireRow = Math.floor(Math.random() * 10) + 1;
const fireColumn = Math.floor(Math.random() * 10) + 1;
const waterRow = Math.floor(Math.random() * 10) + 1;
const waterColumn = Math.floor(Math.random() * 10) + 1;
const iceRow = Math.floor(Math.random() * 10) + 1;
const iceColumn = Math.floor(Math.random() * 10) + 1;

let selectedBoardCard = null;
let selectedBoardTile = null;

let playerEnergy = 10;
let enemyEnergy = 10;

// ==================== HELPER FUNCTIONS ====================

// Returns any tile at a specific position
function getTile(row, column) {
    return document.querySelector(`[data-position="${row},${column}"]`);
}

// Hides an element
function hideLabel(label) {
    if (label) label.classList.add("hidden");
}

// Shows an element
function showLabel(label) {
    if (label) label.classList.remove("hidden");
}

// Hides card information
function hideCardInfo() {
    hideLabel(cardIcon);
    hideLabel(cardName);
    hideLabel(cardDamage);
    hideLabel(cardHealth);
}

// Shows card information
function showCardInfo(card) {
    showLabel(cardIcon);
    showLabel(cardName);
    showLabel(cardDamage);
    showLabel(cardHealth);

    cardName.textContent = card.name;
    cardDamage.textContent = `DMG: ${card.damage}`;
    cardHealth.textContent = `HP: ${card.health}`;
}

// Shows tile information
function showTileInfo(tile, row, column) {
    tilePosition.textContent = `Position: (${row}, ${column})`;
    tileType.textContent = `Tile: ${tile.dataset.type}`;
}

// Gets the card definition stored on a tile, synced with current tile dataset stats
function getCardFromTile(tile) {
    const baseCard = cards.find(card => card.id == tile.dataset.cardId);
    if (!baseCard) return null;

    return {
        ...baseCard,
        health: Number(tile.dataset.cardHealth ?? baseCard.health),
        damage: Number(tile.dataset.cardDamage ?? baseCard.damage)
    };
}

// Creates the 3D unit wrapper HTML for board rendering
function createUnitPieceHTML(icon) {
    return `<div class="unit-piece">${icon}</div>`;
}

// Refreshes energy UI text
function updateEnergyDisplay() {
    if (playerEnergyDisplay) playerEnergyDisplay.textContent = `Player Energy: ${playerEnergy}`;
    if (enemyEnergyDisplay) enemyEnergyDisplay.textContent = `Enemy Energy: ${enemyEnergy}`;
}

// Initial call to set UI on load
updateEnergyDisplay();

// Updates dataset stats on a tile and syncs active UI labels if selected
function updateCardStats(tile, statsToUpdate = {}) {
    if (!tile || !tile.dataset.cardId) return;

    if (statsToUpdate.health !== undefined) {
        tile.dataset.cardHealth = statsToUpdate.health;
    }
    if (statsToUpdate.damage !== undefined) {
        tile.dataset.cardDamage = statsToUpdate.damage;
    }

    // Sync selected card UI panel if this tile is active
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

// Clears unit piece content and card dataset attributes from a tile
function clearTile(tile) {
    if (!tile) return;
    tile.innerHTML = "";
    delete tile.dataset.cardId;
    delete tile.dataset.cardHealth;
    delete tile.dataset.cardDamage;
}

// Retrieves all tile DOM elements that currently hold a unit
function getAllTilesWithCards() {
    return Array.from(document.querySelectorAll('.tile[data-card-id]'));
}

// Filters placed board cards according to a callback condition
function findCardsOnBoard(predicate) {
    return getAllTilesWithCards().filter(tile => {
        const cardData = {
            id: tile.dataset.cardId,
            health: Number(tile.dataset.cardHealth),
            damage: Number(tile.dataset.cardDamage),
            row: Number(tile.dataset.row),
            column: Number(tile.dataset.column)
        };
        return predicate(cardData, tile);
    });
}

// ==================== MOVEMENT & TARGET HIGHLIGHTING ====================

// Shows valid movement tiles based on move range (1 or 2)
function showValidTiles(row, column, move = 1) {
    const offsets = move === 2 
        ? [[-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1], [0, 2], [0, -1], [0, -2]]
        : [[-1, 0], [1, 0], [0, 1], [0, -1]];

    offsets.forEach(([rOffset, cOffset]) => {
        const targetTile = getTile(row + rOffset, column + cOffset);
        if (targetTile && !targetTile.dataset.cardId) {
            targetTile.classList.add("selected");
        }
    });
}

// Hides movement highlights
function hideValidTiles(row, column, move = 1) {
    const offsets = move === 2 
        ? [[-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1], [0, 2], [0, -1], [0, -2]]
        : [[-1, 0], [1, 0], [0, 1], [0, -1]];

    offsets.forEach(([rOffset, cOffset]) => {
        const targetTile = getTile(row + rOffset, column + cOffset);
        if (targetTile) {
            targetTile.classList.remove("selected");
        }
    });
}

// Shows valid attack targets based on attack range (1 or 2)
function showValidTargets(row, column, range = 1) {
    const offsets = range === 2 
        ? [[-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1], [0, 2], [0, -1], [0, -2]]
        : [[-1, 0], [1, 0], [0, 1], [0, -1]];

    offsets.forEach(([rOffset, cOffset]) => {
        const targetTile = getTile(row + rOffset, column + cOffset);
        if (targetTile && targetTile.dataset.cardId) {
            targetTile.classList.add("target");
        }
    });
}

// Hides attack target highlights
function hideValidTargets(row, column, range = 1) {
    const offsets = range === 2 
        ? [[-1, 0], [-2, 0], [1, 0], [2, 0], [0, 1], [0, 2], [0, -1], [0, -2]]
        : [[-1, 0], [1, 0], [0, 1], [0, -1]];

    offsets.forEach(([rOffset, cOffset]) => {
        const targetTile = getTile(row + rOffset, column + cOffset);
        if (targetTile) {
            targetTile.classList.remove("target");
        }
    });
}

// ==================== CARD MOVEMENT & PLACEMENT ====================

function moveCard(tile) {
    const oldRow = Number(selectedBoardTile.dataset.row);
    const oldColumn = Number(selectedBoardTile.dataset.column);
    const moveRange = selectedBoardCard.move || 1;
    const attackRange = selectedBoardCard.range || 1;

    // 1. Deduct 10 health directly from unit
    const newHealth = selectedBoardCard.health - 10;

    // Check if unit dies from moving
    if (newHealth <= 0) {
        clearTile(selectedBoardTile);
        hideValidTiles(oldRow, oldColumn, moveRange);
        hideValidTargets(oldRow, oldColumn, attackRange);
        hideCardInfo();
        selectedBoardCard = null;
        selectedBoardTile = null;
        return;
    }

    selectedBoardCard.health = newHealth;

    // Set new tile unit piece & data
    tile.innerHTML = createUnitPieceHTML(selectedBoardCard.icon);
    tile.dataset.cardId = selectedBoardCard.id;
    
    // 2. Pass updated health to sync the tile dataset
    updateCardStats(tile, {
        health: selectedBoardCard.health,
        damage: selectedBoardCard.damage
    });

    // Clear old tile & clear highlights
    clearTile(selectedBoardTile);
    hideValidTiles(oldRow, oldColumn, moveRange);
    hideValidTargets(oldRow, oldColumn, attackRange);

    selectedBoardCard = null;
    selectedBoardTile = null;
}

// Places a card selected from the shop onto a board tile
function placeCard(tile) {
    if (!selectedCard) return;

    // Check if player has enough energy
    if (playerEnergy < selectedCard.cost) {
        if (selectedCardElement) selectedCardElement.classList.toggle("invalid");
        return;
    }

    // Deduct energy & update display
    playerEnergy -= selectedCard.cost;
    updateEnergyDisplay();

    // Place unit piece & data on tile
    tile.innerHTML = createUnitPieceHTML(selectedCard.icon);
    tile.dataset.cardId = selectedCard.id;
    updateCardStats(tile, {
        health: selectedCard.health,
        damage: selectedCard.damage
    });

    // Remove shop element after purchase
    if (selectedCardElement) {
        selectedCardElement.remove();
    }

    selectedCard = null;
    selectedCardElement = null;
}

// ==================== CARD COMBAT ====================

function attackCard(attackerTile, defenderTile) {
    const oldRow = Number(attackerTile.dataset.row);
    const oldColumn = Number(attackerTile.dataset.column);
    const moveRange = selectedBoardCard.move || 1;
    const attackRange = selectedBoardCard.range || 1;

    // 1. Get current stats directly from dataset
    const attackerDmg = Number(attackerTile.dataset.cardDamage) || selectedBoardCard.damage;
    const currentDefenderHp = Number(defenderTile.dataset.cardHealth) || 0;

    // 2. Calculate new health after damage
    const newDefenderHp = currentDefenderHp - attackerDmg;

    // 3. Visual feedback (hit animation)
    const defenderPiece = defenderTile.querySelector(".unit-piece");
    if (defenderPiece) {
        defenderPiece.classList.add("shaking");
        setTimeout(() => defenderPiece.classList.remove("shaking"), 300);
    }

    // 4. Update stats or destroy defender unit
    if (newDefenderHp <= 0) {
        clearTile(defenderTile);
    } else {
        updateCardStats(defenderTile, { health: newDefenderHp });
    }

    // 5. Clean up selection highlights
    hideValidTiles(oldRow, oldColumn, moveRange);
    hideValidTargets(oldRow, oldColumn, attackRange);

    selectedBoardCard = null;
    selectedBoardTile = null;
}

// ==================== BOARD INITIALIZATION ====================

function createBoard() {
    for (let row = 1; row <= 10; row++) {
        for (let column = 1; column <= 10; column++) {
            const tile = document.createElement("div");

            // Default tile setup
            tile.className = "tile grass";
            tile.dataset.position = `${row},${column}`;
            tile.dataset.row = row;
            tile.dataset.column = column;
            tile.dataset.type = "Grass";

            // Create Fire tile
            if (row === fireRow && column === fireColumn) {
                tile.classList.remove("grass");
                tile.classList.add("fire");
                tile.dataset.type = "Fire";
            }

            // Create Water tile
            if (row === waterRow && column === waterColumn) {
                tile.classList.remove("grass");
                tile.classList.add("water");
                tile.dataset.type = "Water";
            }

            // Create Ice tile
            if (row === iceRow && column === iceColumn) {
                tile.classList.remove("grass");
                tile.classList.add("ice");
                tile.dataset.type = "Ice";
            }

            board.appendChild(tile);

            // Tile click listener
            tile.addEventListener("click", function() {
                // Always show tile information
                showTileInfo(tile, row, column);

                // 1. ATTACK: If a card is selected and target clicked
                if (
                    selectedBoardCard &&
                    tile.classList.contains("target") &&
                    tile.dataset.cardId
                ) {
                    attackCard(selectedBoardTile, tile);
                    return;
                }

                // 2. MOVE: Move selected board card to valid empty tile
                if (
                    selectedBoardCard &&
                    tile.classList.contains("selected") &&
                    !tile.dataset.cardId
                ) {
                    moveCard(tile);
                    return;
                }

                // 3. DESELECT: If clicking the tile that is already selected
                if (selectedBoardTile === tile) {
                    const moveRange = selectedBoardCard.move || 1;
                    const attackRange = selectedBoardCard.range || 1;

                    hideValidTiles(row, column, moveRange);
                    hideValidTargets(row, column, attackRange);
                    
                    selectedBoardCard = null;
                    selectedBoardTile = null;
                    return;
                }

                // 4. SELECT UNIT: If tile already contains a card
                if (tile.dataset.cardId) {
                    const card = getCardFromTile(tile);

                    showCardInfo(card);

                    // Clear previous selection highlights if another card was selected
                    if (selectedBoardTile) {
                        const oldRow = Number(selectedBoardTile.dataset.row);
                        const oldColumn = Number(selectedBoardTile.dataset.column);
                        const oldMove = selectedBoardCard.move || 1;
                        const oldRange = selectedBoardCard.range || 1;

                        hideValidTiles(oldRow, oldColumn, oldMove);
                        hideValidTargets(oldRow, oldColumn, oldRange);
                    }

                    // Select this card
                    selectedBoardCard = card;
                    selectedBoardTile = tile;

                    // Show movement & target highlights based on unit's stats (defaulting to 1 if not specified)
                    const unitMove = card.move || 1;
                    const unitRange = card.range || 1;

                    showValidTiles(row, column, unitMove);
                    showValidTargets(row, column, unitRange);
                    return;
                }

                // 5. SHOP PLACEMENT
                if (selectedCard === null) {
                    hideCardInfo();
                    return;
                }

                placeCard(tile);
            });
        }
    }
}

createBoard();