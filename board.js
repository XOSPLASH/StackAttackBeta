// Board setup
const board = document.getElementById("board");

const fireRow = Math.floor(Math.random() * 10) + 1;
const fireColumn = Math.floor(Math.random() * 10) + 1;
const waterRow = Math.floor(Math.random() * 10) + 1;
const waterColumn = Math.floor(Math.random() * 10) + 1;
const iceRow = Math.floor(Math.random() * 10) + 1;
const iceColumn = Math.floor(Math.random() * 10) + 1;

let selectedBoardCard = null;
let selectedBoardTile = null;

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
    hideLabel(cardName);
    hideLabel(cardDamage);
    hideLabel(cardHealth);
}

// Shows card information
function showCardInfo(card) {
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

// Shows valid adjacent movement tiles (empty tiles only)
function showValidTiles(row, column) {
    const top = getTile(row - 1, column);
    const right = getTile(row, column + 1);
    const bottom = getTile(row + 1, column);
    const left = getTile(row, column - 1);

    if (top && !top.dataset.cardId) top.classList.add("selected");
    if (right && !right.dataset.cardId) right.classList.add("selected");
    if (bottom && !bottom.dataset.cardId) bottom.classList.add("selected");
    if (left && !left.dataset.cardId) left.classList.add("selected");
}

// Hides valid movement highlights
function hideValidTiles(row, column) {
    const top = getTile(row - 1, column);
    const right = getTile(row, column + 1);
    const bottom = getTile(row + 1, column);
    const left = getTile(row, column - 1);

    if (top) top.classList.remove("selected");
    if (right) right.classList.remove("selected");
    if (bottom) bottom.classList.remove("selected");
    if (left) left.classList.remove("selected");
}

function showValidTargets(row, column) {
    const top = getTile(row - 1, column);
    const right = getTile(row, column + 1);
    const bottom = getTile(row + 1, column);
    const left = getTile(row, column - 1);

    if (top && top.dataset.cardId) top.classList.add("target");
    if (right && right.dataset.cardId) right.classList.add("target");
    if (bottom && bottom.dataset.cardId) bottom.classList.add("target");
    if (left && left.dataset.cardId) left.classList.add("target");
}

function hideValidTargets(row, column) {
    const top = getTile(row - 1, column);
    const right = getTile(row, column + 1);
    const left = getTile(row, column - 1);
    const bottom = getTile(row + 1, column);

    if (top) top.classList.remove("target");
    if (right) right.classList.remove("target");
    if (bottom) bottom.classList.remove("target");
    if (left) left.classList.remove("target");
}

// ==================== CARD MOVEMENT & PLACEMENT ====================

function moveCard(tile) {
    const oldRow = Number(selectedBoardTile.dataset.row);
    const oldColumn = Number(selectedBoardTile.dataset.column);

    // 1. Deduct 10 health directly from unit
    const newHealth = selectedBoardCard.health - 10;

    // Check if unit dies from moving
    if (newHealth <= 0) {
        clearTile(selectedBoardTile);
        hideValidTiles(oldRow, oldColumn);
        hideValidTargets(oldRow, oldColumn);
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

    // Clear old tile
    clearTile(selectedBoardTile);
    hideValidTiles(oldRow, oldColumn);
    hideValidTargets(oldRow, oldColumn);

    selectedBoardCard = null;
    selectedBoardTile = null;
}

// Places a card selected from the shop onto a board tile
function placeCard(tile) {
    tile.innerHTML = createUnitPieceHTML(selectedCard.icon);
    tile.dataset.cardId = selectedCard.id;
    updateCardStats(tile, {
        health: selectedCard.health,
        damage: selectedCard.damage
    });

    if (selectedCardElement) {
        selectedCardElement.remove();
    }

    selectedCard = null;
    selectedCardElement = null;
}

// ==================== CARD COMBAT ====================
// Handles attack mechanics between two board units
function attackCard(attackerTile, defenderTile) {
    const oldRow = Number(attackerTile.dataset.row);
    const oldColumn = Number(attackerTile.dataset.column);

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
    hideValidTiles(oldRow, oldColumn);
    hideValidTargets(oldRow, oldColumn);

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
                    hideValidTiles(row, column);
                    hideValidTargets(row, column);
                    selectedBoardCard = null;
                    selectedBoardTile = null;
                    return;
                }

                // 4. SELECT UNIT: If tile already contains a card
                if (tile.dataset.cardId) {
                    const card = getCardFromTile(tile);

                    showCardInfo(card);

                    // Clear previous selection highlights
                    if (selectedBoardTile) {
                        const oldRow = Number(selectedBoardTile.dataset.row);
                        const oldColumn = Number(selectedBoardTile.dataset.column);
                        hideValidTiles(oldRow, oldColumn);
                        hideValidTargets(oldRow, oldColumn);
                    }

                    // Select this card
                    selectedBoardCard = card;
                    selectedBoardTile = tile;

                    // Show movement & target highlights
                    showValidTiles(row, column);
                    showValidTargets(row, column);

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