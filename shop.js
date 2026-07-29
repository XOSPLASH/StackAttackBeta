const shop = document.getElementById("shop");

const cardIcon = document.getElementById("cardIcon");
const cardName = document.getElementById("cardName");
const cardDamage = document.getElementById("cardDamage");
const cardHealth = document.getElementById("cardHealth");

const tileType = document.getElementById("tileType");
const tilePosition = document.getElementById("tilePosition");

let selectedCard = null;
let selectedCardElement = null;

cards.forEach(card => {
    const shopCard = document.createElement("div");

    shopCard.className = "shop-card pop-up";

    shopCard.innerHTML = `
        <h3>${card.icon} ${card.name}</h3>
        <p>${card.type}</p>
        <p>Cost: ${card.cost}</p>
        <p>HP: ${card.health}</p>
        <p>DMG: ${card.damage}</p>
    `;

    shopCard.addEventListener("click", function() {

        document.querySelectorAll(".shop-card").forEach(c => {
            c.classList.remove("selected");
        });

        shopCard.classList.add("selected");

        selectedCard = card;
        selectedCardElement = shopCard;

        cardIcon.classList.remove("hidden");
        cardName.classList.remove("hidden");
        cardDamage.classList.remove("hidden");
        cardHealth.classList.remove("hidden");
        tileType.classList.remove("hidden");
        tilePosition.classList.remove("hidden");
        cardIcon.textContent = `${card.icon}`;
        cardName.textContent = `${card.name}`;
        cardDamage.textContent = `DMG: ${card.damage}`;
        cardHealth.textContent = `HP: ${card.health}`;
        tileType.textContent = `Type: ${card.type} • ${card.rarity}`;
        tilePosition.textContent = `Move: ${card.move} • Range: ${card.range}`;
    });

    shop.appendChild(shopCard);
});
