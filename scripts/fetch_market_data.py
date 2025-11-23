from __future__ import annotations

import csv
import json
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Iterable
import xml.etree.ElementTree as ET

import pandas as pd
import requests


BASE_DIR = Path(__file__).resolve().parents[1]
DATA_DIR = BASE_DIR / "data"

# Core US and HK large-cap tickers
US_TICKERS = ["AAPL", "TSLA", "MSFT", "AMZN"]
HK_TICKERS = ["0700.HK", "0939.HK"]  # Tencent, China Construction Bank
ALL_TICKERS = US_TICKERS + HK_TICKERS


STOOQ_SYMBOL_MAP = {
    "AAPL": "aapl.us",
    "TSLA": "tsla.us",
    "MSFT": "msft.us",
    "AMZN": "amzn.us",
    "0700.HK": "0700.hk",
    "0939.HK": "0939.hk",
}


def fetch_stooq_history(symbol: str, days: int = 180) -> list[list]:
    """Fetch daily OHLCV data for a symbol from Stooq (no auth, CSV)."""
    code = STOOQ_SYMBOL_MAP.get(symbol)
    if not code:
        return []

    url = f"https://stooq.com/q/d/l/?s={code}&i=d"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()

    lines = resp.text.splitlines()
    reader = csv.reader(lines)
    header = next(reader, None)
    if not header:
        return []

    # Stooq header: Date,Open,High,Low,Close,Volume
    rows: list[list] = []
    for row in reader:
        if not row or row[0] in ("Date", ""):
            continue
        date_str, open_p, high_p, low_p, close_p, volume = row
        rows.append(
            [
                symbol,
                date_str,
                open_p,
                high_p,
                low_p,
                close_p,
                volume,
            ]
        )

    # Keep only the most recent `days` entries
    return rows[-days:]


def update_stocks_csv() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "stocks.csv"
    header = ["symbol", "date", "open", "high", "low", "close", "volume"]

    all_rows: list[list] = []
    for sym in ALL_TICKERS:
        print(f"[stocks] Fetching history for {sym} ...")
        try:
            rows = fetch_stooq_history(sym, days=180)
            all_rows.extend(rows)
        except Exception as exc:  # pragma: no cover - network dependent
            print(f"[stocks] Failed to fetch {sym}: {exc}")

    if not all_rows:
        print("[stocks] No data fetched; skipping write.")
        return

    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(all_rows)
    print(f"[stocks] Wrote {len(all_rows)} rows to {path}")


def fetch_yahoo_rss(symbol: str) -> list[dict]:
    """Fetch recent headlines for a ticker from Yahoo Finance RSS."""
    # Yahoo RSS supports US tickers; HK tickers may not always have feeds.
    url = (
        f"https://feeds.finance.yahoo.com/rss/2.0/headline?s={symbol}"
        "&region=US&lang=en-US"
    )
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()

    root = ET.fromstring(resp.text)
    channel = root.find("channel")
    if channel is None:
        return []

    items = []
    for item in channel.findall("item"):
        title_el = item.find("title")
        desc_el = item.find("description")
        pub_el = item.find("pubDate")
        title = title_el.text if title_el is not None else ""
        desc = desc_el.text if desc_el is not None else ""
        pub = pub_el.text if pub_el is not None else ""
        if not title:
            continue
        items.append(
            {
                "date": pub,
                "headline": title,
                "body": desc,
                # Sentiment labels are not available from RSS; mark as neutral.
                "sentiment": "neutral",
            }
        )
    return items


def update_news_csv() -> None:
    """Generate news-style entries based on recent price moves in stocks.csv."""
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "news.csv"
    header = ["date", "headline", "body", "sentiment"]

    stocks_path = DATA_DIR / "stocks.csv"
    if not stocks_path.exists():
        print("[news] stocks.csv not found; skipping news generation.")
        return

    df = pd.read_csv(stocks_path)
    if df.empty:
        print("[news] stocks.csv is empty; skipping news generation.")
        return

    df = df.sort_values(["symbol", "date"])
    news_rows: list[list[str]] = []

    for symbol, group in df.groupby("symbol"):
        group = group.reset_index(drop=True)
        # Look at the last few days for each symbol
        window = group.tail(5)
        for i in range(1, len(window)):
            today = window.iloc[i]
            prev = window.iloc[i - 1]
            close_today = float(today["close"])
            close_prev = float(prev["close"])
            if close_prev == 0:
                continue
            change = (close_today - close_prev) / close_prev * 100
            date_str = str(today["date"])

            direction = "rose" if change >= 0 else "declined"
            sentiment = (
                "positive"
                if change > 0.5
                else "negative"
                if change < -0.5
                else "neutral"
            )
            headline = f"{symbol} {direction} {abs(change):.2f}% on local session"
            body = (
                f"On {date_str}, {symbol} {direction} by {abs(change):.2f}% to close at {close_today:.2f}. "
                f"Previous close was {close_prev:.2f}. "
                "The move reflects short-term shifts in market sentiment captured in the local price data."
            )
            news_rows.append([date_str, headline, body, sentiment])

    if not news_rows:
        print("[news] No derived news items; skipping write.")
        return

    with path.open("w", encoding="utf-8", newline="") as f:
        writer = csv.writer(f)
        writer.writerow(header)
        writer.writerows(news_rows)
    print(f"[news] Wrote {len(news_rows)} rows to {path}")


def fetch_yahoo_report(symbol: str) -> dict | None:
    """Fetch a coarse 'report-like' snapshot using Stooq quote data."""
    code = STOOQ_SYMBOL_MAP.get(symbol)
    if not code:
        return None

    # Stooq quote CSV: Symbol,Date,Time,Open,High,Low,Close,Volume,OpenInt
    url = f"https://stooq.com/q/l/?s={code}&i=d"
    resp = requests.get(url, timeout=15)
    resp.raise_for_status()
    lines = resp.text.splitlines()
    reader = csv.reader(lines)
    header = next(reader, None)
    row = next(reader, None)
    if not header or not row:
        return None

    try:
        _, date_str, _time, open_p, high_p, low_p, close_p, volume, *_ = row
    except ValueError:
        return None

    highlights = (
        f"Last close {close_p}, intraday range {low_p}–{high_p}, "
        f"session volume {volume} (data source: Stooq)."
    )

    return {
        "company": symbol,
        "period": f"Snapshot as of {date_str}",
        "revenue": "N/A",
        "net_income": "N/A",
        "highlights": highlights,
    }


def update_reports_json() -> None:
    DATA_DIR.mkdir(parents=True, exist_ok=True)
    path = DATA_DIR / "reports.json"

    reports: list[dict] = []
    for sym in ALL_TICKERS:
        print(f"[reports] Fetching quote summary for {sym} ...")
        try:
            rep = fetch_yahoo_report(sym)
            if rep:
                reports.append(rep)
            time.sleep(1.0)
        except Exception as exc:  # pragma: no cover - network dependent
            print(f"[reports] Failed to fetch report for {sym}: {exc}")

    if not reports:
        print("[reports] No report snapshots fetched; skipping write.")
        return

    with path.open("w", encoding="utf-8") as f:
        json.dump(reports, f, ensure_ascii=False, indent=4)
    print(f"[reports] Wrote {len(reports)} entries to {path}")


def main(selected: Iterable[str] | None = None) -> None:
    print(f"Fetching live market data into {DATA_DIR} ...")
    tasks = set((selected or ["stocks", "news", "reports"]))

    if "stocks" in tasks:
        update_stocks_csv()
    if "news" in tasks:
        update_news_csv()
    if "reports" in tasks:
        update_reports_json()

    print("Done. Restart the backend so the RAG index can be rebuilt.")


if __name__ == "__main__":
    # Run all three by default
    main()


