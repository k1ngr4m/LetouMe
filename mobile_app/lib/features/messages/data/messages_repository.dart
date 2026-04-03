import '../../../core/network/api_client.dart';
import 'models/site_message.dart';

class MessagesRepository {
  MessagesRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<SiteMessageListResponse> listMessages({
    String? lotteryCode,
    int limit = 20,
    int offset = 0,
  }) async {
    final data = await _apiClient.post(
      '/messages/list',
      data: {
        'lottery_code': lotteryCode,
        'limit': limit,
        'offset': offset,
      },
    );
    return SiteMessageListResponse.fromMap(data);
  }

  Future<int> getUnreadCount({String? lotteryCode}) async {
    final data = await _apiClient.post(
      '/messages/unread-count',
      data: {'lottery_code': lotteryCode},
    );
    return (data['unread_count'] as num?)?.toInt() ?? 0;
  }

  Future<void> markRead(int messageId) async {
    await _apiClient.post(
      '/messages/read',
      data: {'message_id': messageId},
    );
  }

  Future<void> markAllRead({String? lotteryCode}) async {
    await _apiClient.post(
      '/messages/read-all',
      data: {'lottery_code': lotteryCode},
    );
  }
}
