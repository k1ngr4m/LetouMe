class PredictionSummary {
  const PredictionSummary({
    required this.period,
    required this.hitRate,
    required this.modelCount,
  });

  final String period;
  final int hitRate;
  final int modelCount;
}

class PredictionRepository {
  Future<PredictionSummary> fetchSummary() async {
    return const PredictionSummary(
      period: '2026043',
      hitRate: 74,
      modelCount: 12,
    );
  }
}
