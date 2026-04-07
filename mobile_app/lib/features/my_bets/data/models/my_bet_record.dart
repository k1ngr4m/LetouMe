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
    required this.frontDan,
    required this.frontTuo,
    required this.backDan,
    required this.backTuo,
    required this.directTenThousands,
    required this.directThousands,
    required this.directHundreds,
    required this.directTens,
    required this.directUnits,
    required this.groupNumbers,
    required this.sumValues,
    required this.multiplier,
    required this.isAppend,
    required this.betCount,
    required this.amount,
  });

  final int lineNo;
  final String playType;
  final List<String> frontNumbers;
  final List<String> backNumbers;
  final List<String> frontDan;
  final List<String> frontTuo;
  final List<String> backDan;
  final List<String> backTuo;
  final List<String> directTenThousands;
  final List<String> directThousands;
  final List<String> directHundreds;
  final List<String> directTens;
  final List<String> directUnits;
  final List<String> groupNumbers;
  final List<String> sumValues;
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
      frontDan: (json['front_dan'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      frontTuo: (json['front_tuo'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      backDan: (json['back_dan'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      backTuo: (json['back_tuo'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      directTenThousands: (json['direct_ten_thousands'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      directThousands: (json['direct_thousands'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      directHundreds: (json['direct_hundreds'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      directTens: (json['direct_tens'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      directUnits: (json['direct_units'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      groupNumbers: (json['group_numbers'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
      sumValues: (json['sum_values'] as List<dynamic>? ?? const []).map((item) => item.toString()).toList(),
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
    required this.multiplier,
    required this.isAppend,
    this.frontNumbers = const [],
    this.backNumbers = const [],
    this.frontDan = const [],
    this.frontTuo = const [],
    this.backDan = const [],
    this.backTuo = const [],
    this.directTenThousands = const [],
    this.directThousands = const [],
    this.directHundreds = const [],
    this.directTens = const [],
    this.directUnits = const [],
    this.groupNumbers = const [],
    this.sumValues = const [],
  });

  final String playType;
  final int multiplier;
  final bool isAppend;
  final List<String> frontNumbers;
  final List<String> backNumbers;
  final List<String> frontDan;
  final List<String> frontTuo;
  final List<String> backDan;
  final List<String> backTuo;
  final List<String> directTenThousands;
  final List<String> directThousands;
  final List<String> directHundreds;
  final List<String> directTens;
  final List<String> directUnits;
  final List<String> groupNumbers;
  final List<String> sumValues;

  Map<String, dynamic> toMap() {
    return {
      'play_type': playType,
      'front_numbers': frontNumbers,
      'back_numbers': backNumbers,
      'front_dan': frontDan,
      'front_tuo': frontTuo,
      'back_dan': backDan,
      'back_tuo': backTuo,
      'direct_ten_thousands': directTenThousands,
      'direct_thousands': directThousands,
      'direct_hundreds': directHundreds,
      'direct_tens': directTens,
      'direct_units': directUnits,
      'group_numbers': groupNumbers,
      'sum_values': sumValues,
      'multiplier': multiplier,
      'is_append': isAppend,
    };
  }
}
