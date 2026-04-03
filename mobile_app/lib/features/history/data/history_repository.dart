import '../../../core/network/api_client.dart';
import 'models/predictions_history_response.dart';

class HistoryRepository {
  HistoryRepository({required ApiClient apiClient}) : _apiClient = apiClient;

  final ApiClient _apiClient;

  Future<PredictionsHistoryListResponse> fetchHistory({
    String lotteryCode = 'dlt',
    int limit = 20,
    int offset = 0,
  }) async {
    final data = await _apiClient.post(
      '/predictions/history/list',
      data: {
        'lottery_code': lotteryCode,
        'limit': limit,
        'offset': offset,
      },
    );
    return PredictionsHistoryListResponse.fromMap(data);
  }
}
