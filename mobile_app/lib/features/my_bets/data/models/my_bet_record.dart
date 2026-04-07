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
    required this.lines,
    this.prizeLevel,
    this.actualResult,
    this.discountAmount = 0,
    this.sourceType = 'manual',
    this.ticketImageUrl = '',
    this.ocrText = '',
    this.ocrProvider,
    this.ocrRecognizedAt,
    this.ticketPurchasedAt,
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
  final List<MyBetLine> lines;
  final String? prizeLevel;
  final Map<String, dynamic>? actualResult;
  final int discountAmount;
  final String sourceType;
  final String ticketImageUrl;
  final String ocrText;
  final String? ocrProvider;
  final String? ocrRecognizedAt;
  final String? ticketPurchasedAt;

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
      lines: (json['lines'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(MyBetLine.fromMap)
          .toList(),
      prizeLevel: json['prize_level']?.toString(),
      actualResult: json['actual_result'] is Map<String, dynamic> ? json['actual_result'] as Map<String, dynamic> : null,
      discountAmount: (json['discount_amount'] as num?)?.toInt() ?? 0,
      sourceType: json['source_type']?.toString() ?? 'manual',
      ticketImageUrl: json['ticket_image_url']?.toString() ?? '',
      ocrText: json['ocr_text']?.toString() ?? '',
      ocrProvider: json['ocr_provider']?.toString(),
      ocrRecognizedAt: json['ocr_recognized_at']?.toString(),
      ticketPurchasedAt: json['ticket_purchased_at']?.toString(),
    );
  }
}

class MyBetLine {
  const MyBetLine({
    required this.lineNo,
    required this.playType,
    required this.frontNumbers,
    required this.backNumbers,
    required this.multiplier,
    required this.isAppend,
    required this.betCount,
    required this.amount,
  });

  final int lineNo;
  final String playType;
  final List<String> frontNumbers;
  final List<String> backNumbers;
  final int multiplier;
  final bool isAppend;
  final int betCount;
  final int amount;

  factory MyBetLine.fromMap(Map<String, dynamic> json) {
    return MyBetLine(
      lineNo: (json['line_no'] as num?)?.toInt() ?? 0,
      playType: json['play_type']?.toString() ?? 'dlt',
      frontNumbers: (json['front_numbers'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      backNumbers: (json['back_numbers'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      multiplier: (json['multiplier'] as num?)?.toInt() ?? 1,
      isAppend: json['is_append'] == true,
      betCount: (json['bet_count'] as num?)?.toInt() ?? 0,
      amount: (json['amount'] as num?)?.toInt() ?? 0,
    );
  }
}

class UpdateMyBetPayload {
  const UpdateMyBetPayload({
    required this.recordId,
    required this.lotteryCode,
    required this.targetPeriod,
    required this.discountAmount,
    required this.sourceType,
    required this.ticketImageUrl,
    required this.ocrText,
    required this.ocrProvider,
    required this.ocrRecognizedAt,
    required this.ticketPurchasedAt,
    required this.lines,
  });

  final int recordId;
  final String lotteryCode;
  final String targetPeriod;
  final int discountAmount;
  final String sourceType;
  final String ticketImageUrl;
  final String ocrText;
  final String? ocrProvider;
  final String? ocrRecognizedAt;
  final String? ticketPurchasedAt;
  final List<UpdateMyBetLinePayload> lines;

  Map<String, dynamic> toMap() {
    return {
      'record_id': recordId,
      'lottery_code': lotteryCode,
      'target_period': targetPeriod,
      'discount_amount': discountAmount,
      'source_type': sourceType,
      'ticket_image_url': ticketImageUrl,
      'ocr_text': ocrText,
      'ocr_provider': ocrProvider,
      'ocr_recognized_at': ocrRecognizedAt,
      'ticket_purchased_at': ticketPurchasedAt,
      'lines': lines.map((item) => item.toMap()).toList(),
    };
  }
}

class UpdateMyBetLinePayload {
  const UpdateMyBetLinePayload({
    required this.playType,
    required this.frontNumbers,
    required this.backNumbers,
    required this.multiplier,
    required this.isAppend,
  });

  final String playType;
  final List<String> frontNumbers;
  final List<String> backNumbers;
  final int multiplier;
  final bool isAppend;

  Map<String, dynamic> toMap() {
    return {
      'play_type': playType,
      'front_numbers': frontNumbers,
      'back_numbers': backNumbers,
      'multiplier': multiplier,
      'is_append': isAppend,
    };
  }
}
