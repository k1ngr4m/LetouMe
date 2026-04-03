class MyBetRecordListResponse {
  const MyBetRecordListResponse({
    required this.records,
    required this.summary,
  });

  final List<MyBetRecord> records;
  final MyBetSummary summary;

  factory MyBetRecordListResponse.fromMap(Map<String, dynamic> json) {
    return MyBetRecordListResponse(
      records: (json['records'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MyBetRecord.fromMap)
          .toList(),
      summary: MyBetSummary.fromMap(json['summary'] is Map<String, dynamic> ? json['summary'] as Map<String, dynamic> : const {}),
    );
  }
}

class MyBetSummary {
  const MyBetSummary({
    required this.totalCount,
    required this.totalAmount,
    required this.totalNetAmount,
    required this.totalPrizeAmount,
    required this.totalNetProfit,
    required this.settledCount,
    required this.pendingCount,
  });

  final int totalCount;
  final int totalAmount;
  final int totalNetAmount;
  final int totalPrizeAmount;
  final int totalNetProfit;
  final int settledCount;
  final int pendingCount;

  factory MyBetSummary.fromMap(Map<String, dynamic> json) {
    return MyBetSummary(
      totalCount: (json['total_count'] as num?)?.toInt() ?? 0,
      totalAmount: (json['total_amount'] as num?)?.toInt() ?? 0,
      totalNetAmount: (json['total_net_amount'] as num?)?.toInt() ?? 0,
      totalPrizeAmount: (json['total_prize_amount'] as num?)?.toInt() ?? 0,
      totalNetProfit: (json['total_net_profit'] as num?)?.toInt() ?? 0,
      settledCount: (json['settled_count'] as num?)?.toInt() ?? 0,
      pendingCount: (json['pending_count'] as num?)?.toInt() ?? 0,
    );
  }
}

class MyBetRecord {
  const MyBetRecord({
    required this.id,
    required this.lotteryCode,
    required this.targetPeriod,
    required this.playType,
    required this.betCount,
    required this.amount,
    required this.netAmount,
    required this.settlementStatus,
    required this.winningBetCount,
    required this.prizeAmount,
    required this.netProfit,
    required this.createdAt,
    required this.updatedAt,
    required this.frontNumbers,
    required this.backNumbers,
    this.prizeLevel,
    this.actualResult,
  });

  final int id;
  final String lotteryCode;
  final String targetPeriod;
  final String playType;
  final int betCount;
  final int amount;
  final int netAmount;
  final String settlementStatus;
  final int winningBetCount;
  final int prizeAmount;
  final int netProfit;
  final String createdAt;
  final String updatedAt;
  final List<String> frontNumbers;
  final List<String> backNumbers;
  final String? prizeLevel;
  final Map<String, dynamic>? actualResult;

  factory MyBetRecord.fromMap(Map<String, dynamic> json) {
    return MyBetRecord(
      id: (json['id'] as num?)?.toInt() ?? 0,
      lotteryCode: json['lottery_code']?.toString() ?? 'dlt',
      targetPeriod: json['target_period']?.toString() ?? '',
      playType: json['play_type']?.toString() ?? 'dlt',
      betCount: (json['bet_count'] as num?)?.toInt() ?? 0,
      amount: (json['amount'] as num?)?.toInt() ?? 0,
      netAmount: (json['net_amount'] as num?)?.toInt() ?? 0,
      settlementStatus: json['settlement_status']?.toString() ?? 'pending',
      winningBetCount: (json['winning_bet_count'] as num?)?.toInt() ?? 0,
      prizeAmount: (json['prize_amount'] as num?)?.toInt() ?? 0,
      netProfit: (json['net_profit'] as num?)?.toInt() ?? 0,
      createdAt: json['created_at']?.toString() ?? '',
      updatedAt: json['updated_at']?.toString() ?? '',
      frontNumbers: (json['front_numbers'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      backNumbers: (json['back_numbers'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      prizeLevel: json['prize_level']?.toString(),
      actualResult: json['actual_result'] is Map<String, dynamic> ? json['actual_result'] as Map<String, dynamic> : null,
    );
  }
}
