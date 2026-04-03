import '../../../core/network/api_client.dart';
import 'models/predictions_history_detail_response.dart';
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

  Future<PredictionsHistoryDetailResponse> fetchHistoryDetail({
    required String targetPeriod,
    String lotteryCode = 'dlt',
  }) async {
    final data = await _apiClient.post(
      '/predictions/history/detail',
      data: {
        'lottery_code': lotteryCode,
        'target_period': targetPeriod,
      },
    );
    return PredictionsHistoryDetailResponse.fromMap(data);
  }
}
