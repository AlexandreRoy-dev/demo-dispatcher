"""Generate a compact demo CSV with a clear spread of dispatch cases.

Cases covered:
- 1 réactif délai dépassé (Drummondville) + matching préventif same client
- Dual-call clients: same magasin/adresse with réactif + préventif (calendar suggestions)
- A few planifiés mid-day (leave afternoon free → suggestions at bottom of calendar)
- Remaining Q4 préventif pool (~200 total préventif)
"""
from __future__ import annotations

import csv
import random
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "public" / "dispatch-v2" / "appels.csv"

EQUIPMENT = [
    ("Café filtre", 5),
    ("Espresso", 2),
    ("Filtration d'eau", 6),
    ("Four à Convection", 14),
    ("Four Combi", 9),
    ("KIT ENTRETIEN", 34),
    ("Krystaline", 29),
    ("Machine à Glace", 15),
    ("Moulin", 17),
    ("Réfrigérateur", 28),
    ("Roller Grill", 4),
    ("Thermos", 19),
    ("Distributeur à eau chaude", 22),
    ("Hotte", 10),
    ("Lave-vaisselle", 26),
]

ZONES = {
    "Centre-du-Québec": [
        ("Drummondville", ["rue Brock", "boulevard Saint-Joseph", "rue Heriot", "rue Lindsay", "rue Power"]),
        ("Victoriaville", ["boulevard des Bois-Francs", "rue Notre-Dame", "rue Laurier"]),
        ("Nicolet", ["rue du Portage", "rue Notre-Dame"]),
        ("Bécancour", ["boulevard Bécancour", "avenue des Érables"]),
    ],
    "Mauricie": [
        ("Trois-Rivières", ["rue des Forges", "boulevard des Récollets", "rue Royale", "rue Hart"]),
        ("Shawinigan", ["3e Rue", "avenue de la Station"]),
    ],
    "Estrie": [
        ("Sherbrooke", ["rue King Ouest", "rue King Est", "12e Avenue Nord"]),
        ("Magog", ["rue Principale Ouest", "rue Merry Nord"]),
    ],
    "Montérégie": [
        ("Sorel-Tracy", ["rue du Prince", "boulevard Fiset", "rue Augusta"]),
    ],
}

CHAINS = [
    "Couche-Tard", "Tim Hortons", "McDonald's", "Subway", "IGA Extra",
    "Métro", "A&W", "Starbucks", "Harvey's", "Dépanneur 7 jours",
    "Brûlerie locale", "Restaurant du Parc",
]


def pick_place(rng: random.Random, region: str | None = None):
    if region is None:
        region = rng.choice(list(ZONES.keys()))
    city, streets = rng.choice(ZONES[region])
    return region, city, rng.choice(streets)


def row(
    index: int,
    call_type: str,
    *,
    region: str,
    city: str,
    street: str,
    opened_at: str,
    planifie: int = 0,
    heure: str = "",
    tech_id: str = "",
    magasin: str | None = None,
    equip: tuple[str, int] | None = None,
    number: int | None = None,
) -> dict:
    chain = random.Random(index).choice(CHAINS)
    equip_name, equip_id = equip or EQUIPMENT[index % len(EQUIPMENT)]
    num = number if number is not None else 100 + (index * 17) % 1700
    label = magasin or f"{chain} {city}"
    return {
        "id": f"NS-{10000 + index}",
        "type": call_type,
        "magasin": label,
        "adresse": f"{num} {street}, {city}, QC",
        "ville": city,
        "region": region,
        "equipement": equip_name,
        "equipement_id": equip_id,
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

    # --- Case A: réactif délai dépassé + matching préventif (same client) ---
    rows.append(
        row(
            n,
            "reactif",
            region="Centre-du-Québec",
            city="Drummondville",
            street="rue Brock",
            opened_at="2026-08-07",
            magasin="Couche-Tard Drummondville Brock",
            equip=("Espresso", 2),
            number=450,
        )
    )
    n += 1
    rows.append(
        row(
            n,
            "preventif",
            region="Centre-du-Québec",
            city="Drummondville",
            street="rue Brock",
            opened_at="2026-07-10",
            magasin="Couche-Tard Drummondville Brock",
            equip=("KIT ENTRETIEN", 34),
            number=450,
        )
    )
    n += 1

    # --- Case B: dual-call clients (réactif + préventif, same magasin + adresse) ---
    # When the réactif is routed, calendar suggests the sibling préventif (often end of day).
    dual_clients = [
        ("Centre-du-Québec", "Drummondville", "boulevard Saint-Joseph", 820, "Tim Hortons Drummondville St-Joseph"),
        ("Centre-du-Québec", "Drummondville", "rue Heriot", 315, "Subway Drummondville Heriot"),
        ("Centre-du-Québec", "Victoriaville", "rue Laurier", 640, "IGA Extra Victoriaville"),
        ("Centre-du-Québec", "Nicolet", "rue du Portage", 112, "Harvey's Nicolet"),
        ("Mauricie", "Trois-Rivières", "rue des Forges", 1500, "Starbucks Trois-Rivières Forges"),
        ("Mauricie", "Trois-Rivières", "rue Royale", 225, "Métro Trois-Rivières Royale"),
        ("Mauricie", "Shawinigan", "3e Rue", 980, "A&W Shawinigan"),
        ("Estrie", "Sherbrooke", "rue King Ouest", 4050, "McDonald's Sherbrooke King Ouest"),
        ("Estrie", "Magog", "rue Principale Ouest", 760, "Couche-Tard Magog Principale"),
        ("Montérégie", "Sorel-Tracy", "rue du Prince", 88, "Dépanneur 7 jours Sorel Prince"),
        ("Montérégie", "Sorel-Tracy", "boulevard Fiset", 1320, "Tim Hortons Sorel Fiset"),
        ("Centre-du-Québec", "Bécancour", "boulevard Bécancour", 1700, "CLSC Bécancour"),
    ]
    for region, city, street, number, label in dual_clients:
        rows.append(
            row(
                n,
                "reactif",
                region=region,
                city=city,
                street=street,
                opened_at=rng.choice(["2026-08-12", "2026-08-13"]),
                magasin=label,
                number=number,
                equip=("Espresso", 2) if n % 2 == 0 else ("Machine à Glace", 15),
            )
        )
        n += 1
        rows.append(
            row(
                n,
                "preventif",
                region=region,
                city=city,
                street=street,
                opened_at="2026-08-01",
                magasin=label,
                number=number,
                equip=("Filtration d'eau", 6),
            )
        )
        n += 1

    # --- Case C: a few mid-day planifiés (leave afternoon free for bottom-of-day suggestions) ---
    planned = [
        ("5", "Centre-du-Québec", "Drummondville", "rue Lindsay", 210, "11:00", "Entretien planifié — IGA Drummondville"),
        ("12", "Mauricie", "Trois-Rivières", "boulevard des Récollets", 880, "10:30", "Entretien planifié — Restaurant du Parc TR"),
        ("18", "Estrie", "Sherbrooke", "12e Avenue Nord", 560, "11:30", "Entretien planifié — Hôtel Sherbrooke"),
        ("21", "Montérégie", "Sorel-Tracy", "rue Augusta", 44, "10:00", "Entretien planifié — Aréna Sorel"),
    ]
    for tech_id, region, city, street, number, heure, label in planned:
        rows.append(
            row(
                n,
                "preventif",
                region=region,
                city=city,
                street=street,
                opened_at="2026-07-15",
                planifie=1,
                heure=heure,
                tech_id=tech_id,
                magasin=label,
                number=number,
                equip=("KIT ENTRETIEN", 34),
            )
        )
        n += 1

    # --- Case D: fill remaining Q4 préventif pool to ~200 ---
    remaining = 200 - sum(1 for r in rows if r["type"] == "preventif")
    for _ in range(max(0, remaining)):
        region, city, street = pick_place(rng)
        rows.append(
            row(
                n,
                "preventif",
                region=region,
                city=city,
                street=street,
                opened_at=rng.choice(["2026-07-01", "2026-07-20", "2026-08-05"]),
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
        1 for r in rows if r["type"] == "reactif" and r["opened_at"] <= "2026-08-10"
    )
    dual = sum(
        1
        for r in rows
        if r["type"] == "preventif"
        and any(
            o["type"] == "reactif"
            and o["adresse"] == r["adresse"]
            and o["magasin"] == r["magasin"]
            for o in rows
        )
    )
    print(
        f"Wrote {OUT} ({len(rows)} total: {prev} préventif, {react} réactif, "
        f"{pinned} planifiés, {overdue} délai dépassé, {dual} clients dual réactif+préventif)"
    )


if __name__ == "__main__":
    main()
