class PredictionsHistoryDetailResponse {
  const PredictionsHistoryDetailResponse({
    required this.records,
    required this.totalCount,
    required this.modelStats,
  });

  final List<PredictionHistoryDetailRecord> records;
  final int totalCount;
  final List<PredictionHistoryModelStat> modelStats;

  factory PredictionsHistoryDetailResponse.fromMap(Map<String, dynamic> json) {
    return PredictionsHistoryDetailResponse(
      records: (json['predictions_history'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryDetailRecord.fromMap)
          .toList(),
      totalCount: (json['total_count'] as num?)?.toInt() ?? 0,
      modelStats: (json['model_stats'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryModelStat.fromMap)
          .toList(),
    );
  }
}

class PredictionHistoryDetailRecord {
  const PredictionHistoryDetailRecord({
    required this.targetPeriod,
    required this.predictionDate,
    required this.models,
    this.actualResult,
  });

  final String targetPeriod;
  final String predictionDate;
  final List<PredictionHistoryDetailModel> models;
  final PredictionActualResult? actualResult;

  factory PredictionHistoryDetailRecord.fromMap(Map<String, dynamic> json) {
    final actual = json['actual_result'];
    return PredictionHistoryDetailRecord(
      targetPeriod: json['target_period']?.toString() ?? '',
      predictionDate: json['prediction_date']?.toString() ?? '',
      models: (json['models'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryDetailModel.fromMap)
          .toList(),
      actualResult: actual is Map<String, dynamic> ? PredictionActualResult.fromMap(actual) : null,
    );
  }
}

class PredictionHistoryDetailModel {
  const PredictionHistoryDetailModel({
    required this.modelId,
    required this.modelName,
    required this.modelProvider,
    required this.predictions,
    this.bestHitCount,
    this.winRateByPeriod,
  });

  final String modelId;
  final String modelName;
  final String modelProvider;
  final List<PredictionHistoryGroup> predictions;
  final int? bestHitCount;
  final double? winRateByPeriod;

  factory PredictionHistoryDetailModel.fromMap(Map<String, dynamic> json) {
    return PredictionHistoryDetailModel(
      modelId: json['model_id']?.toString() ?? '',
      modelName: json['model_name']?.toString() ?? '',
      modelProvider: json['model_provider']?.toString() ?? '',
      predictions: (json['predictions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionHistoryGroup.fromMap)
          .toList(),
      bestHitCount: (json['best_hit_count'] as num?)?.toInt(),
      winRateByPeriod: (json['win_rate_by_period'] as num?)?.toDouble(),
    );
  }
}

class PredictionHistoryGroup {
  const PredictionHistoryGroup({
    required this.redBalls,
    required this.blueBalls,
    this.strategy,
    this.playType,
  });

  final List<String> redBalls;
  final List<String> blueBalls;
  final String? strategy;
  final String? playType;

  factory PredictionHistoryGroup.fromMap(Map<String, dynamic> json) {
    return PredictionHistoryGroup(
      redBalls: (json['red_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      blueBalls: (json['blue_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      strategy: json['strategy']?.toString(),
      playType: json['play_type']?.toString(),
    );
  }
}

class PredictionActualResult {
  const PredictionActualResult({
    required this.redBalls,
    required this.blueBalls,
  });

  final List<String> redBalls;
  final List<String> blueBalls;

  factory PredictionActualResult.fromMap(Map<String, dynamic> json) {
    return PredictionActualResult(
      redBalls: (json['red_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      blueBalls: (json['blue_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
    );
  }
}

class PredictionHistoryModelStat {
  const PredictionHistoryModelStat({
    required this.modelId,
    required this.modelName,
    required this.periods,
    required this.winningPeriods,
    required this.winRateByPeriod,
  });

  final String modelId;
  final String modelName;
  final int periods;
  final int winningPeriods;
  final double winRateByPeriod;

  factory PredictionHistoryModelStat.fromMap(Map<String, dynamic> json) {
    return PredictionHistoryModelStat(
      modelId: json['model_id']?.toString() ?? '',
      modelName: json['model_name']?.toString() ?? '',
      periods: (json['periods'] as num?)?.toInt() ?? 0,
      winningPeriods: (json['winning_periods'] as num?)?.toInt() ?? 0,
      winRateByPeriod: (json['win_rate_by_period'] as num?)?.toDouble() ?? 0,
    );
  }
}
