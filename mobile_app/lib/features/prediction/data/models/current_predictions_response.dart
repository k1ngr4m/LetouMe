class CurrentPredictionsResponse {
  const CurrentPredictionsResponse({
    required this.lotteryCode,
    required this.predictionDate,
    required this.targetPeriod,
    required this.models,
  });

  final String lotteryCode;
  final String predictionDate;
  final String targetPeriod;
  final List<PredictionModelItem> models;

  factory CurrentPredictionsResponse.fromMap(Map<String, dynamic> json) {
    return CurrentPredictionsResponse(
      lotteryCode: json['lottery_code']?.toString() ?? 'dlt',
      predictionDate: json['prediction_date']?.toString() ?? '',
      targetPeriod: json['target_period']?.toString() ?? '',
      models: (json['models'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionModelItem.fromMap)
          .toList(),
    );
  }
}

class PredictionModelItem {
  const PredictionModelItem({
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
  final List<PredictionGroupItem> predictions;
  final int? bestHitCount;
  final double? winRateByPeriod;

  factory PredictionModelItem.fromMap(Map<String, dynamic> json) {
    return PredictionModelItem(
      modelId: json['model_id']?.toString() ?? '',
      modelName: json['model_name']?.toString() ?? '',
      modelProvider: json['model_provider']?.toString() ?? '',
      predictions: (json['predictions'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(PredictionGroupItem.fromMap)
          .toList(),
      bestHitCount: (json['best_hit_count'] as num?)?.toInt(),
      winRateByPeriod: (json['win_rate_by_period'] as num?)?.toDouble(),
    );
  }
}

class PredictionGroupItem {
  const PredictionGroupItem({
    required this.redBalls,
    required this.blueBalls,
    this.strategy,
    this.playType,
  });

  final List<String> redBalls;
  final List<String> blueBalls;
  final String? strategy;
  final String? playType;

  factory PredictionGroupItem.fromMap(Map<String, dynamic> json) {
    return PredictionGroupItem(
      redBalls: (json['red_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      blueBalls: (json['blue_balls'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      strategy: json['strategy']?.toString(),
      playType: json['play_type']?.toString(),
    );
  }
}
