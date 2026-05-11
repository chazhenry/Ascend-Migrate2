import json
from collections import defaultdict
from pathlib import Path
from typing import Any


def load_json_file(path: Path) -> Any:
    return json.loads(path.read_text(encoding="utf-8"))


def normalize_schema_payload(payload: Any) -> list[dict[str, Any]]:
    if isinstance(payload, list):
        return [record for record in payload if isinstance(record, dict)]
    if isinstance(payload, dict):
        for value in payload.values():
            if isinstance(value, list):
                return [record for record in value if isinstance(record, dict)]
    raise ValueError("Unsupported schema payload format")


def group_schema_records(records: list[dict[str, Any]]) -> dict[str, dict[str, Any]]:
    grouped: dict[str, dict[str, Any]] = defaultdict(lambda: {"columns": []})
    for record in records:
        table_name = str(record.get("table_name") or record.get("table") or "unknown_table")
        grouped[table_name]["columns"].append(
            {
                "column_name": record.get("column_name"),
                "data_type": record.get("data_type"),
                "is_nullable": record.get("is_nullable"),
                "ordinal_position": record.get("ordinal_position"),
                "character_maximum_length": record.get("character_maximum_length"),
                "numeric_precision": record.get("numeric_precision"),
                "numeric_scale": record.get("numeric_scale"),
                "column_default": record.get("column_default"),
            }
        )
    return dict(grouped)


def flatten_grouped_schema(grouped: dict[str, dict[str, Any]]) -> list[dict[str, Any]]:
    flattened: list[dict[str, Any]] = []
    for table_name, table_payload in grouped.items():
        for column in table_payload.get("columns", []):
            flattened.append({"table_name": table_name, **column})
    return flattened


def infer_file_type(filename: str) -> str:
    suffix = Path(filename).suffix.lower()
    if suffix == ".json":
        return "schema_json"
    if suffix == ".csv":
        return "csv"
    if suffix == ".sql":
        return "sql"
    if suffix in {".xlsx", ".xls"}:
        return "xlsx"
    return "other"
