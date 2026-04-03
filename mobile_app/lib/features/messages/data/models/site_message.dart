class SiteMessageListResponse {
  const SiteMessageListResponse({
    required this.messages,
    required this.totalCount,
  });

  final List<SiteMessage> messages;
  final int totalCount;

  factory SiteMessageListResponse.fromMap(Map<String, dynamic> json) {
    return SiteMessageListResponse(
      messages: (json['messages'] as List<dynamic>? ?? const [])
          .whereType<Map<String, dynamic>>()
          .map(SiteMessage.fromMap)
          .toList(),
      totalCount: (json['total_count'] as num?)?.toInt() ?? 0,
    );
  }
}

class SiteMessage {
  const SiteMessage({
    required this.id,
    required this.lotteryCode,
    required this.targetPeriod,
    required this.myBetRecordId,
    required this.messageType,
    required this.title,
    required this.content,
    required this.isRead,
    required this.createdAt,
    this.snapshot,
    this.readAt,
  });

  final int id;
  final String lotteryCode;
  final String targetPeriod;
  final int myBetRecordId;
  final String messageType;
  final String title;
  final String content;
  final bool isRead;
  final String createdAt;
  final Map<String, dynamic>? snapshot;
  final String? readAt;

  factory SiteMessage.fromMap(Map<String, dynamic> json) {
    return SiteMessage(
      id: (json['id'] as num?)?.toInt() ?? 0,
      lotteryCode: json['lottery_code']?.toString() ?? 'dlt',
      targetPeriod: json['target_period']?.toString() ?? '',
      myBetRecordId: (json['my_bet_record_id'] as num?)?.toInt() ?? 0,
      messageType: json['message_type']?.toString() ?? 'bet_settlement',
      title: json['title']?.toString() ?? '',
      content: json['content']?.toString() ?? '',
      isRead: json['is_read'] == true,
      createdAt: json['created_at']?.toString() ?? '',
      snapshot: json['snapshot'] is Map<String, dynamic> ? json['snapshot'] as Map<String, dynamic> : null,
      readAt: json['read_at']?.toString(),
    );
  }
}
