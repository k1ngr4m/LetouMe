import unittest
from unittest.mock import MagicMock, patch

from backend.app.services.schedule_service import (
    WORLDCUP_HOURLY_FETCH_CRON,
    WORLDCUP_HOURLY_FETCH_TASK_CODE,
    ScheduleService,
)


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

        with self.assertRaisesRegex(ValueError, "大乐透预测模式仅支持 direct / compound / dantuo"):
            self.service._normalize_payload(payload, task_code="sched-invalid")

    def test_normalize_payload_keeps_dlt_dantuo_for_prediction_tasks(self) -> None:
        payload = {
            "task_name": "大乐透胆拖预测",
            "task_type": "prediction_generate",
            "lottery_code": "dlt",
            "model_codes": ["dlt-model-a"],
            "generation_mode": "current",
            "prediction_play_mode": "dantuo",
            "overwrite_existing": False,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        normalized = self.service._normalize_payload(payload, task_code="sched-dlt-dantuo")
        self.assertEqual(normalized["prediction_play_mode"], "dantuo")

    def test_normalize_payload_keeps_dlt_compound_for_prediction_tasks(self) -> None:
        payload = {
            "task_name": "大乐透复式预测",
            "task_type": "prediction_generate",
            "lottery_code": "dlt",
            "model_codes": ["dlt-model-a"],
            "generation_mode": "current",
            "prediction_play_mode": "compound",
            "overwrite_existing": False,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        normalized = self.service._normalize_payload(payload, task_code="sched-dlt-compound")
        self.assertEqual(normalized["prediction_play_mode"], "compound")

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
            parallelism=1,
            progress_callback=progress_callback,
        )

    def test_trigger_task_passes_fetch_limit_for_lottery_fetch(self) -> None:
        task = {
            "task_code": "sched-qxc-fetch",
            "task_name": "七星彩抓取",
            "task_type": "lottery_fetch",
            "lottery_code": "qxc",
            "fetch_limit": 120,
            "model_codes": [],
            "generation_mode": "current",
            "prediction_play_mode": "direct",
            "overwrite_existing": False,
            "schedule_mode": "preset",
            "preset_type": "daily",
            "time_of_day": "09:00",
            "weekdays": [],
            "is_active": True,
        }

        with patch("backend.app.services.schedule_service.lottery_fetch_task_service.create_task") as create_task:
            self.service._trigger_task(task)

        create_task.assert_called_once()
        kwargs = create_task.call_args.kwargs
        self.assertEqual(kwargs["limit"], 120)

    def test_normalize_payload_accepts_worldcup_fetch_task(self) -> None:
        payload = {
            "task_name": "世界杯赛程赔率整点同步",
            "task_type": "worldcup_fetch",
            "lottery_code": "worldcup",
            "model_codes": [],
            "generation_mode": "current",
            "prediction_play_mode": "direct",
            "overwrite_existing": False,
            "schedule_mode": "cron",
            "cron_expression": WORLDCUP_HOURLY_FETCH_CRON,
            "is_active": True,
        }

        normalized = self.service._normalize_payload(payload, task_code=WORLDCUP_HOURLY_FETCH_TASK_CODE)

        self.assertEqual(normalized["task_type"], "worldcup_fetch")
        self.assertEqual(normalized["lottery_code"], "worldcup")
        self.assertEqual(normalized["cron_expression"], "0 * * * *")
        self.assertEqual(normalized["model_codes"], [])
        self.assertIsNotNone(normalized["next_run_at"])

    def test_start_creates_default_worldcup_hourly_fetch_task(self) -> None:
        self.repository.get_task.return_value = None
        self.repository.list_tasks.return_value = []

        with patch("backend.app.services.schedule_service.Thread") as thread_class:
            self.service.start()

        self.repository.create_task.assert_called_once()
        created_payload = self.repository.create_task.call_args.args[0]
        self.assertEqual(created_payload["task_code"], WORLDCUP_HOURLY_FETCH_TASK_CODE)
        self.assertEqual(created_payload["task_type"], "worldcup_fetch")
        self.assertEqual(created_payload["lottery_code"], "worldcup")
        self.assertEqual(created_payload["cron_expression"], WORLDCUP_HOURLY_FETCH_CRON)
        self.assertTrue(created_payload["is_active"])
        thread_class.return_value.start.assert_called_once()

    def test_ensure_worldcup_hourly_fetch_task_preserves_disabled_state(self) -> None:
        self.repository.get_task.return_value = {
            "task_code": WORLDCUP_HOURLY_FETCH_TASK_CODE,
            "task_name": "旧名称",
            "task_type": "worldcup_fetch",
            "lottery_code": "worldcup",
            "fetch_limit": 30,
            "model_codes": [],
            "generation_mode": "current",
            "prediction_play_mode": "direct",
            "overwrite_existing": False,
            "schedule_mode": "cron",
            "preset_type": None,
            "time_of_day": None,
            "weekdays": [],
            "cron_expression": "15 * * * *",
            "is_active": False,
        }

        self.service._ensure_worldcup_hourly_fetch_task()

        self.repository.update_task.assert_called_once()
        updated_payload = self.repository.update_task.call_args.args[1]
        self.assertFalse(updated_payload["is_active"])
        self.assertEqual(updated_payload["cron_expression"], WORLDCUP_HOURLY_FETCH_CRON)

    def test_trigger_task_runs_worldcup_fetch_service(self) -> None:
        task = {
            "task_code": WORLDCUP_HOURLY_FETCH_TASK_CODE,
            "task_name": "世界杯赛程赔率整点同步",
            "task_type": "worldcup_fetch",
            "lottery_code": "worldcup",
            "fetch_limit": 30,
            "model_codes": [],
            "generation_mode": "current",
            "prediction_play_mode": "direct",
            "overwrite_existing": False,
            "schedule_mode": "cron",
            "preset_type": None,
            "time_of_day": None,
            "weekdays": [],
            "cron_expression": WORLDCUP_HOURLY_FETCH_CRON,
            "is_active": True,
        }

        with patch("backend.app.services.schedule_service.worldcup_fetch_task_service.create_task") as create_task:
            self.service._trigger_task(task)

        create_task.assert_called_once()
        kwargs = create_task.call_args.kwargs
        self.assertEqual(kwargs["schedule_task_code"], WORLDCUP_HOURLY_FETCH_TASK_CODE)
        self.assertEqual(kwargs["trigger_type"], "schedule")
        self.assertTrue(callable(kwargs["on_update"]))


if __name__ == "__main__":
    unittest.main()
