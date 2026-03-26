from __future__ import annotations

import unittest

from backend.app.number_codec import build_number_rows, merge_number_rows, split_number_text


class NumberCodecTests(unittest.TestCase):
    def test_split_number_text_skips_empty_items(self) -> None:
        self.assertEqual(split_number_text("01, 02 ,,03"), ["01", "02", "03"])

    def test_build_number_rows_serializes_supported_fields(self) -> None:
        rows = build_number_rows(
            {
                "front_numbers": "01,02,03",
                "back_numbers": "09,10",
                "direct_hundreds": "04,05",
                "group_numbers": "07,08",
                "sum_values": "10,11",
            }
        )
        self.assertEqual(
            rows,
            [
                ("front", 1, "01"),
                ("front", 2, "02"),
                ("front", 3, "03"),
                ("back", 1, "09"),
                ("back", 2, "10"),
                ("direct_hundreds", 1, "04"),
                ("direct_hundreds", 2, "05"),
                ("group", 1, "07"),
                ("group", 2, "08"),
                ("sum", 1, "10"),
                ("sum", 2, "11"),
            ],
        )

    def test_merge_number_rows_rebuilds_legacy_fields(self) -> None:
        payload = merge_number_rows(
            [
                {"number_role": "front", "number_position": 2, "number_value": "02"},
                {"number_role": "front", "number_position": 1, "number_value": "01"},
                {"number_role": "group", "number_position": 2, "number_value": "08"},
                {"number_role": "group", "number_position": 1, "number_value": "07"},
                {"number_role": "sum", "number_position": 2, "number_value": "11"},
                {"number_role": "sum", "number_position": 1, "number_value": "10"},
            ]
        )
        self.assertEqual(payload["front_numbers"], "01,02")
        self.assertEqual(payload["group_numbers"], "07,08")
        self.assertEqual(payload["sum_values"], "10,11")
        self.assertEqual(payload["back_numbers"], "")


if __name__ == "__main__":
    unittest.main()
