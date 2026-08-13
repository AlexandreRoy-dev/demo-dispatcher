"""Generate public/guertech/appels.csv — compact Q4 demo set.

- 200 préventif (= 800 / 4, restants d'ici fin Q4)
- ~24 réactif dans le délai 2 jours
- 1 réactif délai dépassé
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "guertech" / "appels.csv"

PREVENTIF_COUNT = 200  # 800 / 4 — Q4 remaining
REACTIF_PENDING = 24
REACTIF_OVERDUE = 1

EQUIPMENT = [
    ("Accessoire TP", 30),
    ("ADMIN", 37),
    ("Boissons en fontaine", 27),
    ("BW3 Désinstallé", 38),
    ("Café filtre", 5),
    ("Cappuccino Glacé", 16),
    ("Chocolatière", 7),
    ("CT CUR-GEM3IF", 32),
    ("Distributeur à eau chaude", 22),
    ("Distributeur à sucre", 20),
    ("Distributeur lait/crème", 8),
    ("Distributrice", 25),
    ("Espresso", 2),
    ("Filtration d'eau", 6),
    ("Four à Convection", 14),
    ("Four Combi", 9),
    ("Four Micro-onde", 13),
    ("Frigo à Condiments", 18),
    ("Grille-Pain", 11),
    ("Hotte", 10),
    ("K-Cup", 24),
    ("KIT ENTRETIEN", 34),
    ("Krystaline", 29),
    ("Lassonde", 39),
    ("Lave-vaisselle", 26),
    ("Machine à Glace", 15),
    ("Moulin", 17),
    ("Panini", 23),
    ("PIÈCES RP", 35),
    ("Polar-pop", 33),
    ("PopCorn", 12),
    ("Réchaud", 3),
    ("Réfrigérateur", 28),
    ("Refroidisseur", 31),
    ("Roller Grill", 4),
    ("Site", 1),
    ("Slush", 42),
    ("Table chaude", 40),
    ("Thé", 21),
    ("Thermos", 19),
]

CITIES = [
    ("Drummondville", "Centre-du-Québec", [
        "rue Brock", "boulevard Saint-Joseph", "rue Heriot", "rue Lindsay",
        "rue Cockburn", "boulevard Foucault", "rue Marchand", "rue des Forges",
        "rue Power", "rue de l'Éclipse",
    ]),
    ("Victoriaville", "Centre-du-Québec", [
        "boulevard des Bois-Francs", "rue Notre-Dame", "boulevard Jutras",
        "rue de l'Aqueduc", "rue Laurier",
    ]),
    ("Nicolet", "Centre-du-Québec", [
        "rue Notre-Dame", "rue du Portage", "boulevard Louis-Fréchette",
    ]),
    ("Bécancour", "Centre-du-Québec", [
        "boulevard Bécancour", "avenue des Érables", "rue de l'Industrie",
    ]),
    ("Trois-Rivières", "Mauricie", [
        "rue des Forges", "boulevard des Récollets", "rue Royale",
        "boulevard des Chenaux", "rue Hart",
    ]),
    ("Shawinigan", "Mauricie", [
        "3e Rue", "avenue de la Station", "boulevard Royal",
    ]),
    ("Sherbrooke", "Estrie", [
        "rue King Ouest", "rue King Est", "12e Avenue Nord",
        "boulevard de Portland", "rue Wellington Nord",
    ]),
    ("Magog", "Estrie", [
        "rue Principale Ouest", "rue Merry Nord", "rue Sherbrooke",
    ]),
    ("Thetford Mines", "Chaudière-Appalaches", [
        "9e Rue Sud", "boulevard Frontenac", "rue Notre-Dame Est",
    ]),
    ("Sorel-Tracy", "Montérégie", [
        "rue du Prince", "boulevard Fiset", "rue Augusta",
    ]),
]

CHAINS = [
    "Couche-Tard", "Tim Hortons", "McDonald's", "Subway", "IGA Extra",
    "Métro", "Dollarama", "A&W", "Starbucks", "Harvey's", "Benny&Co",
    "La Belle Province", "Dépanneur 7 jours", "Cafeteria industrielle",
    "Restaurant du Parc", "Brûlerie locale", "Hôtel Le Dauphin",
    "Aréna municipal", "CLSC", "École secondaire",
]

TECH_IDS = ["5", "12", "18", "21"]
HOURS = [f"{h:02d}:{m:02d}" for h in range(8, 16) for m in (0, 30)]
AS_OF = "2026-08-13"


def make_row(
    rng: random.Random,
    index: int,
    call_type: str,
    *,
    planifie: int = 0,
    opened_at: str,
    force_magasin: str | None = None,
) -> dict:
    city, region, streets = CITIES[rng.randrange(len(CITIES))]
    street = rng.choice(streets)
    number = rng.randint(12, 1899)
    chain = rng.choice(CHAINS)
    magasin = force_magasin or f"{chain} {city}"
    if force_magasin is None and rng.random() < 0.35:
        magasin = f"{chain} — {street.title()}"
    equip, eid = EQUIPMENT[rng.randrange(len(EQUIPMENT))]
    heure = rng.choice(HOURS) if planifie else ""
    tech_id = rng.choice(TECH_IDS) if planifie else ""
    return {
        "id": f"NS-{10000 + index}",
        "type": call_type,
        "magasin": magasin,
        "adresse": f"{number} {street}, {city}, QC",
        "ville": city,
        "region": region,
        "equipement": equip,
        "equipement_id": eid,
        "netsuite_id": f"NS-{10000 + index}",
        "planifie": planifie,
        "heure": heure,
        "tech_id": tech_id,
        "opened_at": opened_at,
    }


def main() -> None:
    rng = random.Random(20260813)
    OUT.parent.mkdir(parents=True, exist_ok=True)

    rows: list[dict] = []
    n = 1

    # 1 overdue réactif first (visible in its own section)
    rows.append(
        make_row(
            rng,
            n,
            "reactif",
            opened_at="2026-08-07",
            force_magasin="Couche-Tard Drummondville — DÉLAI DÉPASSÉ",
        )
    )
    n += 1

    # Réactif pending within the 2-day window
    for _ in range(REACTIF_PENDING):
        rows.append(
            make_row(
                rng,
                n,
                "reactif",
                opened_at=rng.choice(["2026-08-12", "2026-08-13"]),
            )
        )
        n += 1

    # Q4 préventif remaining (800 / 4)
    for i in range(PREVENTIF_COUNT):
        # A few already booked appointments so Planifié is visible
        planifie = 1 if i < 8 else 0
        rows.append(
            make_row(
                rng,
                n,
                "preventif",
                planifie=planifie,
                opened_at=rng.choice(
                    ["2026-07-01", "2026-07-15", "2026-08-01", "2026-08-10"]
                ),
            )
        )
        n += 1

    with OUT.open("w", encoding="utf-8", newline="") as fh:
        writer = csv.DictWriter(
            fh,
            fieldnames=[
                "id",
                "type",
                "magasin",
                "adresse",
                "ville",
                "region",
                "equipement",
                "equipement_id",
                "netsuite_id",
                "planifie",
                "heure",
                "tech_id",
                "opened_at",
            ],
        )
        writer.writeheader()
        writer.writerows(rows)

    prev = sum(1 for r in rows if r["type"] == "preventif")
    react = sum(1 for r in rows if r["type"] == "reactif")
    pinned = sum(1 for r in rows if r["planifie"] == 1)
    overdue = sum(
        1
        for r in rows
        if r["type"] == "reactif" and r["opened_at"] <= "2026-08-10"
    )
    print(
        f"Wrote {OUT} ({len(rows)} total: {prev} préventif, {react} réactif, "
        f"{pinned} planifiés, {overdue} délai dépassé)"
    )


if __name__ == "__main__":
    main()
