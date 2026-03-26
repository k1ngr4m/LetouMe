import unittest
from unittest.mock import MagicMock, patch

from backend.app.services.schedule_service import ScheduleService


class ScheduleServiceTestCase(unittest.TestCase):
    def setUp(self) -> None:
        self.repository = MagicMock()
        self.prediction_generation_service = MagicMock()
        self.prediction_generation_service.model_repository.list_active_model_codes.return_value = ["pl3-model-a"]
        self.service = ScheduleService(
            repository=self.repository,
            prediction_generation_service=self.prediction_generation_service,
        )

    def test_normalize_payload_keeps_pl3_direct_sum_for_prediction_tasks(self) -> None:
        payload = {
            "task_name": "排列3和值预测",
            "task_type": "prediction_generate",
            "lottery_code": "pl3",
            "model_codes": ["pl3-model-a"],
            "generation_mode": "current",
            "prediction_play_mode": "direct_sum",
            "overwrite_existing": False,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        normalized = self.service._normalize_payload(payload, task_code="sched-pl3-sum")

        self.assertEqual(normalized["prediction_play_mode"], "direct_sum")

    def test_normalize_payload_rejects_direct_sum_for_non_pl3_prediction_tasks(self) -> None:
        payload = {
            "task_name": "大乐透和值预测",
            "task_type": "prediction_generate",
            "lottery_code": "dlt",
            "model_codes": ["dlt-model-a"],
            "generation_mode": "current",
            "prediction_play_mode": "direct_sum",
            "overwrite_existing": False,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        with self.assertRaisesRegex(ValueError, "仅排列3预测任务支持和值模式"):
            self.service._normalize_payload(payload, task_code="sched-invalid")

    def test_trigger_task_passes_prediction_play_mode_to_generation_service(self) -> None:
        task = {
            "task_code": "sched-pl3-sum",
            "task_name": "排列3和值预测",
            "task_type": "prediction_generate",
            "lottery_code": "pl3",
            "model_codes": ["pl3-model-a"],
            "generation_mode": "current",
            "prediction_play_mode": "direct_sum",
            "overwrite_existing": True,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        with patch("backend.app.services.schedule_service.prediction_generation_task_service.create_task") as create_task:
            self.service._trigger_task(task)

        worker = create_task.call_args.kwargs["worker"]
        progress_callback = MagicMock()
        worker(progress_callback)

        self.prediction_generation_service.generate_for_models.assert_called_once_with(
            lottery_code="pl3",
            model_codes=["pl3-model-a"],
            mode="current",
            prediction_play_mode="direct_sum",
            overwrite=True,
            progress_callback=progress_callback,
        )


if __name__ == "__main__":
    unittest.main()
