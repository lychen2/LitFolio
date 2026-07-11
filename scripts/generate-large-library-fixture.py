#!/usr/bin/env python3
"""Generate a large Litera SQLite fixture for local performance checks.

The script applies the app migrations before seeding data so the resulting
database matches the current schema. Generated databases are intended for local
manual testing and should not be committed.
"""

from __future__ import annotations

import argparse
import json
import sqlite3
import time
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]
MIGRATIONS_DIR = ROOT / "src-tauri" / "migrations"

VENUES = [
    "ACL",
    "CHI",
    "CVPR",
    "EMNLP",
    "ICLR",
    "ICML",
    "KDD",
    "NeurIPS",
    "SIGIR",
    "VLDB",
]
TOPICS = [
    "retrieval augmented generation",
    "scientific document parsing",
    "local first sync",
    "graph neural retrieval",
    "citation recommendation",
    "interactive reading",
    "multilingual summarization",
    "semantic search",
    "evidence extraction",
    "workflow automation",
]
READ_STATUSES = ["unread", "reading", "read", "must"]
RELATIONS = ["extends", "contradicts", "compares", "builds_on", "uses_method", "related"]


def parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(
        description="Generate a Litera SQLite fixture with synthetic papers.",
    )
    parser.add_argument(
        "--output",
        type=Path,
        default=Path("/tmp/litera-large-library.sqlite"),
        help="SQLite database path to write. Defaults to /tmp/litera-large-library.sqlite.",
    )
    parser.add_argument(
        "--count",
        type=int,
        default=5000,
        help="Number of papers to seed. Typical M10 sizes: 500, 1000, 5000.",
    )
    parser.add_argument(
        "--links",
        type=int,
        default=1200,
        help="Number of synthetic paper_links to seed for graph checks.",
    )
    parser.add_argument(
        "--terms-per-paper",
        type=int,
        default=2,
        help="Number of reusable paper_terms per paper.",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Overwrite the output database if it already exists.",
    )
    return parser.parse_args()


def apply_migrations(connection: sqlite3.Connection) -> None:
    for migration in sorted(MIGRATIONS_DIR.glob("*.sql")):
        connection.executescript(migration.read_text(encoding="utf-8"))


def paper_id(index: int) -> str:
    return f"fixture-paper-{index:05d}"


def seed_static_dimensions(connection: sqlite3.Connection) -> None:
    connection.executemany(
        "INSERT INTO tags(id, name, color) VALUES (?, ?, ?)",
        [
            (1, "method", "#60a5fa"),
            (2, "survey", "#34d399"),
            (3, "dataset", "#f59e0b"),
            (4, "benchmark", "#f472b6"),
        ],
    )
    connection.executemany(
        "INSERT INTO folders(id, name, parent_id) VALUES (?, ?, ?)",
        [
            (1, "Large Library Fixture", None),
            (2, "Retrieval", 1),
            (3, "Reading Systems", 1),
            (4, "Knowledge Graph", 1),
        ],
    )


def seed_papers(connection: sqlite3.Connection, count: int) -> None:
    now = int(time.time())
    rows = []
    tag_rows = []
    folder_rows = []
    queue_rows = []
    for i in range(count):
        topic = TOPICS[i % len(TOPICS)]
        venue = VENUES[i % len(VENUES)]
        year = 2014 + (i % 13)
        pid = paper_id(i)
        title = f"{topic.title()} for Large Library Evaluation {i:05d}"
        authors = [f"Author {i % 97}", f"Researcher {(i * 7) % 113}"]
        abstract = (
            f"This synthetic paper studies {topic} with a reproducible benchmark, "
            f"large local collections, and latency measurements for query {i % 31}."
        )
        findings = [
            f"{topic} improves retrieval precision for bucket {i % 11}",
            f"Interactive review remains stable with batch {i % 17}",
        ]
        rows.append(
            (
                pid,
                title,
                json.dumps(authors),
                year,
                venue,
                f"10.5555/fixture.{i:05d}",
                f"2401.{i % 10000:04d}",
                abstract,
                f"/tmp/litera-fixture/pdfs/{pid}.pdf",
                None,
                now - i,
                now - i,
                READ_STATUSES[i % len(READ_STATUSES)],
                f"One sentence TLDR for {topic} paper {i}.",
                f"How does {topic} scale in a local-first literature workspace?",
                "Synthetic benchmark with deterministic corpus generation.",
                f"FixtureSet-{i % 9}",
                json.dumps(findings),
                "Synthetic limitations keep the fixture deterministic.",
                f"Compared with adjacent topic bucket {(i + 1) % len(TOPICS)}.",
                None,
                None,
                f"@article{{fixture{i:05d}, title={{{title}}}, year={{{year}}}}}",
                None,
            )
        )
        tag_rows.append((pid, 1 + (i % 4)))
        if i % 5 == 0:
            tag_rows.append((pid, 1 + ((i + 1) % 4)))
        folder_rows.append((pid, 2 + (i % 3)))
        if i < min(100, count):
            queue_rows.append((pid, 100 - i, None, f"Fixture priority item {i}", now - i))

    connection.executemany(
        """
        INSERT INTO papers (
            id, title, authors_json, year, venue, doi, arxiv_id, abstract,
            pdf_path, note_path, added_at, updated_at, read_status, tldr,
            research_question, method, dataset, key_findings_json, limitations,
            comparison, title_translated, abstract_translated, bibtex, last_exported_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )
    connection.executemany(
        "INSERT INTO paper_tags(paper_id, tag_id) VALUES (?, ?)",
        tag_rows,
    )
    connection.executemany(
        "INSERT INTO paper_folders(paper_id, folder_id) VALUES (?, ?)",
        folder_rows,
    )
    connection.executemany(
        "INSERT INTO reading_queue(paper_id, priority, target_date, note, added_at) VALUES (?, ?, ?, ?, ?)",
        queue_rows,
    )


def seed_terms(connection: sqlite3.Connection, count: int, terms_per_paper: int) -> None:
    if terms_per_paper <= 0:
        return
    now = int(time.time())
    rows = []
    reusable_terms = [topic.replace(" ", "-") for topic in TOPICS]
    for i in range(count):
        for offset in range(terms_per_paper):
            normalized = reusable_terms[(i + offset) % len(reusable_terms)]
            rows.append(
                (
                    paper_id(i),
                    normalized.replace("-", " ").title(),
                    normalized,
                    f"Definition for {normalized} in fixture paper {i}.",
                    f"Evidence sentence {offset} from synthetic abstract {i}.",
                    0.8 - (offset * 0.05),
                    now - i,
                    now - i,
                )
            )
    connection.executemany(
        """
        INSERT INTO paper_terms(
            paper_id, term, normalized_term, local_definition, local_evidence,
            score, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def seed_links(connection: sqlite3.Connection, count: int, link_count: int) -> None:
    if count < 2 or link_count <= 0:
        return
    now = int(time.time())
    rows = []
    seen = set()
    offset = 1
    while len(rows) < link_count and offset < count:
        for source_index in range(count):
            target_index = (source_index + offset) % count
            if source_index == target_index:
                continue
            relation = RELATIONS[(source_index + offset) % len(RELATIONS)]
            key = (source_index, target_index, relation)
            if key in seen:
                continue
            seen.add(key)
            rows.append(
                (
                    paper_id(source_index),
                    paper_id(target_index),
                    relation,
                    "user" if len(rows) % 3 == 0 else "ai",
                    1.0 if len(rows) % 3 == 0 else 0.72,
                    f"Synthetic {relation} edge for graph performance.",
                    now - len(rows),
                    now - len(rows),
                )
            )
            if len(rows) >= link_count:
                break
        offset += 1

    connection.executemany(
        """
        INSERT INTO paper_links(
            source_paper_id, target_paper_id, relation, source_type,
            confidence, snippet, created_at, updated_at
        )
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
        """,
        rows,
    )


def create_fixture(output: Path, count: int, links: int, terms_per_paper: int) -> None:
    output.parent.mkdir(parents=True, exist_ok=True)
    connection = sqlite3.connect(output)
    try:
        connection.execute("PRAGMA foreign_keys = ON")
        connection.execute("PRAGMA journal_mode = WAL")
        apply_migrations(connection)
        with connection:
            seed_static_dimensions(connection)
            seed_papers(connection, count)
            seed_terms(connection, count, terms_per_paper)
            seed_links(connection, count, links)
            connection.execute("PRAGMA optimize")
    finally:
        connection.close()


def main() -> None:
    args = parse_args()
    if args.count <= 0:
        raise SystemExit("--count must be positive")
    if args.output.exists() and not args.force:
        raise SystemExit(f"{args.output} already exists; pass --force to overwrite")
    if args.force:
        sidecars = [
            args.output,
            args.output.with_name(args.output.name + "-wal"),
            args.output.with_name(args.output.name + "-shm"),
        ]
        for path in sidecars:
            if path.exists():
                path.unlink()
    create_fixture(args.output, args.count, args.links, args.terms_per_paper)
    print(
        f"Generated {args.count} papers, {args.links} links at {args.output}",
        flush=True,
    )


if __name__ == "__main__":
    main()
