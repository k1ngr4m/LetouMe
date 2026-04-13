from __future__ import annotations

from typing import Any


NUMBER_FIELD_SPECS: tuple[tuple[str, str], ...] = (
    ("front_numbers", "front"),
    ("back_numbers", "back"),
    ("front_dan", "front_dan"),
    ("front_tuo", "front_tuo"),
    ("back_dan", "back_dan"),
    ("back_tuo", "back_tuo"),
    ("direct_ten_thousands", "direct_ten_thousands"),
    ("direct_thousands", "direct_thousands"),
    ("direct_hundreds", "direct_hundreds"),
    ("direct_tens", "direct_tens"),
    ("direct_units", "direct_units"),
    ("direct_hundreds_dan", "direct_hundreds_dan"),
    ("direct_hundreds_tuo", "direct_hundreds_tuo"),
    ("direct_tens_dan", "direct_tens_dan"),
    ("direct_tens_tuo", "direct_tens_tuo"),
    ("direct_units_dan", "direct_units_dan"),
    ("direct_units_tuo", "direct_units_tuo"),
    ("group_numbers", "group"),
    ("sum_values", "sum"),
)
POSITION_SELECTION_ROLES: tuple[str, ...] = tuple(f"position_{index}" for index in range(1, 8))

ROLE_TO_FIELD = {role: field_name for field_name, role in NUMBER_FIELD_SPECS}
EMPTY_NUMBER_FIELDS = {field_name: "" for field_name, _ in NUMBER_FIELD_SPECS}
EMPTY_NUMBER_FIELDS["position_selections"] = []


def split_number_text(value: Any) -> list[str]:
    text = str(value or "").strip()
    if not text:
        return []
    return [item.strip() for item in text.split(",") if item.strip()]


def build_number_rows(payload: dict[str, Any]) -> list[tuple[str, int, str]]:
    rows: list[tuple[str, int, str]] = []
    for field_name, role in NUMBER_FIELD_SPECS:
        for index, number_value in enumerate(split_number_text(payload.get(field_name)), start=1):
            rows.append((role, index, number_value))
    position_selections = payload.get("position_selections")
    if isinstance(position_selections, list):
        for position_index, values in enumerate(position_selections, start=1):
            role = f"position_{position_index}"
            if role not in POSITION_SELECTION_ROLES:
                continue
            if not isinstance(values, list):
                continue
            for value_index, number_value in enumerate(values, start=1):
                rows.append((role, value_index, str(number_value).strip().zfill(2)))
    return rows


def merge_number_rows(rows: list[dict[str, Any]]) -> dict[str, str]:
    grouped: dict[str, list[tuple[int, str]]] = {field_name: [] for field_name, _ in NUMBER_FIELD_SPECS}
    position_grouped: dict[str, list[tuple[int, str]]] = {role: [] for role in POSITION_SELECTION_ROLES}
    for row in rows:
        role = str(row.get("number_role") or "").strip()
        field_name = ROLE_TO_FIELD.get(role)
        if not field_name:
            if role in position_grouped:
                position_grouped[role].append(
                    (
                        int(row.get("number_position") or 0),
                        str(row.get("number_value") or "").strip(),
                    )
                )
            continue
        grouped[field_name].append(
            (
                int(row.get("number_position") or 0),
                str(row.get("number_value") or "").strip(),
            )
        )
    result = dict(EMPTY_NUMBER_FIELDS)
    for field_name, values in grouped.items():
        ordered_values = [value for _, value in sorted(values, key=lambda item: (item[0], item[1])) if value]
        result[field_name] = ",".join(ordered_values)
    result["position_selections"] = [
        [value for _, value in sorted(position_grouped[role], key=lambda item: (item[0], item[1])) if value]
        for role in POSITION_SELECTION_ROLES
    ]
    return result


def with_number_fields(payload: dict[str, Any] | None = None) -> dict[str, Any]:
    return {**EMPTY_NUMBER_FIELDS, **(payload or {})}
