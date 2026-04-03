class HistoryRecord {
  const HistoryRecord({
    required this.period,
    required this.result,
    required this.summary,
  });

  final String period;
  final String result;
  final String summary;
}

class HistoryRepository {
  Future<List<HistoryRecord>> fetchHistory() async {
    return List.generate(
      8,
      (index) => HistoryRecord(
        period: '20260${index + 1}',
        result: '03 09 14 21 28 + 07 11',
        summary: '预测命中：红球 2 个 / 蓝球 1 个',
      ),
    );
  }
}
