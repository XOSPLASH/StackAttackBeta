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

        document.querySelectorAll(".shop-card").forEach(c => {
            c.classList.remove("selected");
        });

        shopCard.classList.add("selected");

        selectedCard = card;
        selectedCardElement = shopCard;

        cardIcon.classList.remove("team-blue", "team-red");

        cardIcon.classList.remove("hidden");
        cardAbility.classList.remove("hidden");
        cardName.classList.remove("hidden");
        cardAP.classList.remove("hidden");
        cardDamage.classList.remove("hidden");
        cardHealth.classList.remove("hidden");
        cardRange.classList.remove("hidden");
        cardMove.classList.remove("hidden");
        cardIcon.textContent = `${card.icon}`;
        cardAbility.classList.remove("hidden");
        cardAbility.textContent = `${card.ability}`;
        cardName.textContent = `${card.name}`;
        cardAP.textContent = `AP: ${card.ap}`;
        cardDamage.textContent = `DMG: ${card.damage}`;
        cardHealth.textContent = `HP: ${card.health}`;
        cardRange.textContent = `Range: ${card.range}`;
        cardMove.textContent = `Move: ${card.move}`;
    });

    shop.appendChild(shopCard);
});
