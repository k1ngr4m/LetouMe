class PredictionsHistoryListResponse {
  const PredictionsHistoryListResponse({
    required this.records,
    required this.totalCount,
  });

  final List<PredictionHistoryRecord> records;
  final int totalCount;

  factory PredictionsHistoryListResponse.fromMap(Map<String, dynamic> json) {
    return PredictionsHistoryListResponse(
      records: (json['predictions_history'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryRecord.fromMap)
          .toList(),
      totalCount: (json['total_count'] as num?)?.toInt() ?? 0,
    );
  }
}

class PredictionHistoryRecord {
  const PredictionHistoryRecord({
    required this.targetPeriod,
    required this.predictionDate,
    required this.models,
    this.actualResult,
  });

  final String targetPeriod;
  final String predictionDate;
  final List<PredictionHistoryModelSummary> models;
  final LotteryResult? actualResult;

  factory PredictionHistoryRecord.fromMap(Map<String, dynamic> json) {
    final actual = json['actual_result'];
    return PredictionHistoryRecord(
      targetPeriod: json['target_period']?.toString() ?? '',
      predictionDate: json['prediction_date']?.toString() ?? '',
      models: (json['models'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryModelSummary.fromMap)
          .toList(),
      actualResult: actual is Map<String, dynamic> ? LotteryResult.fromMap(actual) : null,
    );
  }
}

class PredictionHistoryModelSummary {
  const PredictionHistoryModelSummary({
    required this.modelId,
    required this.modelName,
    required this.modelProvider,
    this.bestHitCount,
    this.winRateByPeriod,
  });

  final String modelId;
  final String modelName;
  final String modelProvider;
  final int? bestHitCount;
  final double? winRateByPeriod;

  factory PredictionHistoryModelSummary.fromMap(Map<String, dynamic> json) {
    return PredictionHistoryModelSummary(
      modelId: json['model_id']?.toString() ?? '',
      modelName: json['model_name']?.toString() ?? '',
      modelProvider: json['model_provider']?.toString() ?? '',
      bestHitCount: (json['best_hit_count'] as num?)?.toInt(),
      winRateByPeriod: (json['win_rate_by_period'] as num?)?.toDouble(),
    );
  }
}

class LotteryResult {
  const LotteryResult({
    required this.redBalls,
    required this.blueBalls,
  });

  final List<String> redBalls;
  final List<String> blueBalls;

  factory LotteryResult.fromMap(Map<String, dynamic> json) {
    return LotteryResult(
      redBalls: (json['red_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      blueBalls: (json['blue_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
    );
  }
}
