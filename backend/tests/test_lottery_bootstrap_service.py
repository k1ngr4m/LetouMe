from __future__ import annotations

import unittest
from unittest.mock import Mock, patch

from backend.app.services.lottery_bootstrap_service import LotteryBootstrapService, LotteryBootstrapTaskService


class LotteryBootstrapServiceTests(unittest.TestCase):
    def test_bootstrap_defaults_to_all_supported_lotteries_and_backfills_detail_lotteries(self) -> None:
        lottery_service = Mock()
        lottery_service.repository.list_draws.side_effect = [
            [{"period": "26002"}, {"period": "26001"}],
            [{"period": "26003"}],
        ]
        checkpoint_repository = Mock()
        checkpoint_repository.get.return_value = None
        service = LotteryBootstrapService.__new__(LotteryBootstrapService)
        service.lottery_service = lottery_service
        service.checkpoint_repository = checkpoint_repository
        service.logger = Mock()
        progress_updates: list[dict] = []

        with patch.object(service, "_fetch_base_history") as fetch_base_history, patch("backend.app.services.lottery_bootstrap_service.LotteryFetchService") as fetch_service_class, patch("backend.app.services.lottery_bootstrap_service.time.sleep"):
            fetch_base_history.side_effect = [
                {"fetched_count": 2, "saved_count": 2, "latest_period": "26002"},
                {"fetched_count": 3, "saved_count": 3, "latest_period": "26003"},
                {"fetched_count": 4, "saved_count": 4, "latest_period": "26004"},
                {"fetched_count": 1, "saved_count": 1, "latest_period": "26005"},
            ]
            fetch_service = fetch_service_class.return_value

            summary = service.bootstrap(progress_callback=progress_updates.append)

        self.assertEqual(fetch_base_history.call_count, 4)
        self.assertEqual([call.args[0] for call in fetch_base_history.call_args_list], ["dlt", "pl3", "pl5", "qxc"])
        self.assertEqual(fetch_service.backfill_draw_detail.call_count, 3)
        self.assertEqual(summary["base_saved"], 10)
        self.assertEqual(summary["detail_processed"], 3)
        self.assertEqual(summary["detail_failed"], 0)
        self.assertEqual(progress_updates[-1]["phase"], "done")

    def test_bootstrap_resume_continues_after_checkpoint_period(self) -> None:
        lottery_service = Mock()
        lottery_service.repository.list_draws.return_value = [{"period": "26003"}, {"period": "26002"}, {"period": "26001"}]
        checkpoint_repository = Mock()
        checkpoint_repository.get.return_value = {"base_done": True, "detail_done": False, "last_period": "26002"}
        service = LotteryBootstrapService.__new__(LotteryBootstrapService)
        service.lottery_service = lottery_service
        service.checkpoint_repository = checkpoint_repository
        service.logger = Mock()

        with patch("backend.app.services.lottery_bootstrap_service.LotteryFetchService") as fetch_service_class, patch("backend.app.services.lottery_bootstrap_service.time.sleep"):
            fetch_service = fetch_service_class.return_value
            summary = service.bootstrap(lottery_codes=["dlt"], resume=True)

        fetch_service.backfill_draw_detail.assert_called_once_with("26001")
        self.assertEqual(summary["detail_processed"], 1)

    def test_bootstrap_detail_failure_does_not_stop_task(self) -> None:
        lottery_service = Mock()
        lottery_service.repository.list_draws.return_value = [{"period": "26002"}, {"period": "26001"}]
        checkpoint_repository = Mock()
        checkpoint_repository.get.return_value = {"base_done": True, "detail_done": False, "last_period": None}
        service = LotteryBootstrapService.__new__(LotteryBootstrapService)
        service.lottery_service = lottery_service
        service.checkpoint_repository = checkpoint_repository
        service.logger = Mock()

        with patch.object(service, "_backfill_detail_with_retry") as backfill_detail, patch("backend.app.services.lottery_bootstrap_service.LotteryFetchService"), patch("backend.app.services.lottery_bootstrap_service.time.sleep"):
            backfill_detail.side_effect = [ValueError("blocked"), None]
            summary = service.bootstrap(lottery_codes=["dlt"], resume=True)

        self.assertEqual(summary["detail_processed"], 1)
        self.assertEqual(summary["detail_failed"], 1)


class LotteryBootstrapTaskServiceTests(unittest.TestCase):
    def test_create_task_uses_bootstrap_worker_and_all_log(self) -> None:
        bootstrap_service = Mock()
        bootstrap_service.bootstrap.return_value = {"saved_count": 4}
        log_repository = Mock()
        service = LotteryBootstrapTaskService(bootstrap_service=bootstrap_service, maintenance_log_repository=log_repository)
        service.runner = Mock()
        service.runner.create_task.return_value = {"task_id": "task-1", "status": "queued", "created_at": 1}

        result = service.create_task()

        self.assertEqual(result["task_id"], "task-1")
        call_kwargs = service.runner.create_task.call_args.kwargs
        self.assertEqual(call_kwargs["initial_task"]["lottery_code"], "all")
        worker = call_kwargs["worker"]
        worker(None, lambda: False)
        bootstrap_service.bootstrap.assert_called_once()
        log_repository.create_log.assert_called_once_with(
            task_id="task-1",
            lottery_code="all",
            schedule_task_code=None,
            trigger_type="manual",
            task_type="lottery_bootstrap",
            status="queued",
            created_at=1,
        )


if __name__ == "__main__":
    unittest.main()
