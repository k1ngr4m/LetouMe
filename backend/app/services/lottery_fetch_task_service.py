from __future__ import annotations

from backend.app.services.lottery_fetch_service import LotteryFetchService
from backend.app.services.task_runner import BackgroundTaskRunner


class LotteryFetchTaskService:
    def __init__(self, fetch_service: LotteryFetchService | None = None) -> None:
        self.fetch_service = fetch_service
        self.runner = BackgroundTaskRunner("services.lottery_fetch_task")

    def create_task(self, lottery_code: str = "dlt", on_update=None) -> dict:
        fetch_service = self.fetch_service or LotteryFetchService(lottery_code=lottery_code)
        return self.runner.create_task(
            initial_task={
                "lottery_code": lottery_code,
                "progress_summary": {
                    "lottery_code": lottery_code,
                    "fetched_count": 0,
                    "saved_count": 0,
                    "latest_period": None,
                    "duration_ms": 0,
                }
            },
            worker=lambda _progress_callback: fetch_service.fetch_and_save(),
            on_update=on_update,
        )

    def get_task(self, task_id: str) -> dict | None:
        return self.runner.get_task(task_id)


lottery_fetch_task_service = LotteryFetchTaskService()
