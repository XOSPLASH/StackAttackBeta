const shop = document.getElementById("shop");

const cardIcon = document.getElementById("cardIcon");
const cardName = document.getElementById("cardName");
const cardDamage = document.getElementById("cardDamage");
const cardHealth = document.getElementById("cardHealth");
const cardRange = document.getElementById("cardRange");
const cardMove = document.getElementById("cardMove");
const cardAP = document.getElementById("cardAP");
const cardAbility = document.getElementById("cardAbility");

const tileType = document.getElementById("tileType");
const tilePosition = document.getElementById("tilePosition");

let selectedCard = null;
let selectedCardElement = null;

cards.forEach(card => {
    const shopCard = document.createElement("div");

    shopCard.className = "shop-card pop-up";

    shopCard.innerHTML = `
        <h3>${card.icon} ${card.name}</h3>
        <p>Cost: ${card.cost}</p>
    `;

    shopCard.addEventListener("click", function() {
        const isSelected = shopCard.classList.contains("selected");

        // Unselect all other shop cards
        document.querySelectorAll(".shop-card").forEach(c => {
            c.classList.remove("selected");
        });

        // Toggle 'selected' on the clicked card
        const isNowSelected = shopCard.classList.toggle("selected", !isSelected);

        if (isNowSelected) {
            // Select the card & display stats in sidebar
            selectedCard = card;
            selectedCardElement = shopCard;

            cardIcon.classList.remove("team-blue", "team-red", "hidden");
            cardAbility.classList.remove("hidden");
            cardName.classList.remove("hidden");
            cardAP.classList.remove("hidden");
            cardDamage.classList.remove("hidden");
            cardHealth.classList.remove("hidden");
            cardRange.classList.remove("hidden");
            cardMove.classList.remove("hidden");

            cardIcon.textContent = `${card.icon}`;
            cardAbility.textContent = card.ability || "None";
            cardName.textContent = `${card.name}`;
            cardAP.textContent = `AP: ${card.ap ?? 2}`;
            cardDamage.textContent = `DMG: ${card.damage}`;
            cardHealth.textContent = `HP: ${card.health}`;
            cardRange.textContent = `Range: ${card.range}`;
            cardMove.textContent = `Move: ${card.move}`;
        } else {
            // Clear selection & hide sidebar elements
            selectedCard = null;
            selectedCardElement = null;

            cardIcon.classList.add("hidden");
            cardAbility.classList.add("hidden");
            cardName.classList.add("hidden");
            cardAP.classList.add("hidden");
            cardDamage.classList.add("hidden");
            cardHealth.classList.add("hidden");
            cardRange.classList.add("hidden");
            cardMove.classList.add("hidden");
        }
    });

    shop.appendChild(shopCard);
});