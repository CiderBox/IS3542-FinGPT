from __future__ import annotations

import csv
import json
import random
from dataclasses import dataclass
from datetime import date, timedelta
from pathlib import Path


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"


@dataclass
class StockConfig:
    symbol: str
    start_price: float


def _generate_stock_series(config: StockConfig, start_date: date, days: int) -> list[list]:
    """Generate a simple synthetic OHLCV series for one symbol."""
    rows: list[list] = []
    price = config.start_price
    current = start_date

    while len(rows) < days:
        # Skip weekends
        if current.weekday() < 5:
            open_p = price + random.uniform(-1.5, 1.5)
            high_p = open_p + random.uniform(0.5, 4.0)
            low_p = open_p - random.uniform(0.5, 4.0)
            close_p = random.uniform(low_p, high_p)
            volume = random.randint(18_000_000, 90_000_000)

            rows.append(
                [
                    config.symbol,
                    current.isoformat(),
                    round(open_p, 2),
                    round(high_p, 2),
                    round(low_p, 2),
                    round(close_p, 2),
                    volume,
                ]
            )
            price = close_p

        current += timedelta(days=1)

    return rows


def extend_stocks_csv() -> None:
    path = DATA_DIR / "stocks.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    existing: list[list] = []
    header = ["symbol", "date", "open", "high", "low", "close", "volume"]
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            reader = list(csv.reader(f))
            if reader:
                header = reader[0]
                existing = reader[1:]

    # Add a few extra symbols with ~30 trading days each
    configs = [
        StockConfig("AAPL", 190.0),
        StockConfig("MSFT", 380.0),
        StockConfig("TSLA", 380.0),
        StockConfig("AMZN", 150.0),
        StockConfig("JPM", 145.0),
        StockConfig("XOM", 115.0),
    ]

    start_date = date(2024, 10, 1)
    generated: list[list] = []
    for cfg in configs:
        generated.extend(_generate_stock_series(cfg, start_date, days=30))

    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for row in existing:
            if row:  # skip empty lines
                writer.writerow(row)
        for row in generated:
            writer.writerow(row)


def extend_news_csv() -> None:
    path = DATA_DIR / "news.csv"
    path.parent.mkdir(parents=True, exist_ok=True)

    header = ["date", "headline", "body", "sentiment"]
    existing: list[list] = []
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            reader = list(csv.reader(f))
            if reader:
                header = reader[0]
                existing = reader[1:]

    templates = [
        (
            "2024-10-{}",
            "{} posts solid earnings beat",
            "{} reported quarterly results ahead of consensus, with stronger-than-expected revenue in its core business lines.",
            "positive",
        ),
        (
            "2024-10-{}",
            "{} issues cautious guidance",
            "{} guided to slower growth next quarter as management highlighted macro uncertainty and FX headwinds.",
            "neutral",
        ),
        (
            "2024-10-{}",
            "{} faces regulatory scrutiny",
            "Regulators opened a probe into {}'s recent acquisition strategy, raising the risk of delays to future deals.",
            "negative",
        ),
    ]

    companies = [
        "Apple",
        "Microsoft",
        "Tesla",
        "Amazon",
        "JPMorgan Chase",
        "ExxonMobil",
        "Nova Energy",
        "Alpha Retail Group",
    ]

    generated: list[list] = []
    day = 1
    for company in companies:
        for pattern in templates:
            date_str = pattern[0].format(f"{day:02d}")
            headline = pattern[1].format(company)
            body = pattern[2].format(company)
            sentiment = pattern[3]
            generated.append([date_str, headline, body, sentiment])
            day = min(day + 1, 28)

    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        for row in existing:
            if row:
                writer.writerow(row)
        for row in generated:
            writer.writerow(row)


def extend_reports_json() -> None:
    path = DATA_DIR / "reports.json"
    path.parent.mkdir(parents=True, exist_ok=True)

    existing: list[dict] = []
    if path.exists():
        with path.open("r", encoding="utf-8") as f:
            existing = json.load(f)

    extra = [
        {
            "company": "Atlas Industrials",
            "period": "FY 2023",
            "revenue": "$22.1B",
            "net_income": "$1.9B",
            "highlights": "Backlog reached a record high; pricing actions offset input cost inflation and preserved margins.",
        },
        {
            "company": "Vertex Software",
            "period": "Q3 2024",
            "revenue": "$2.4B",
            "net_income": "$410M",
            "highlights": "Cloud ARR grew 32% YoY; net dollar retention remained above 120% despite slower seat expansion.",
        },
        {
            "company": "Harbor Real Estate Trust",
            "period": "Q3 2024",
            "revenue": "$980M",
            "net_income": "$210M",
            "highlights": "Occupancy in logistics assets rose to 97%; office exposure reduced to 18% of portfolio NOI.",
        },
    ]

    with path.open("w", encoding="utf-8") as f:
        json.dump(existing + extra, f, ensure_ascii=False, indent=4)


def main() -> None:
    print(f"Seeding synthetic data under {DATA_DIR} ...")
    extend_stocks_csv()
    extend_news_csv()
    extend_reports_json()
    print("Done. Restart the backend so the RAG index can be rebuilt.")


if __name__ == "__main__":
    main()


